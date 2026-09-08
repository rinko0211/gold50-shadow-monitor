import { createHash } from "node:crypto";
import { completedNyseSessionsSince, executionWindow, isNyseSession, nextNyseSession } from "./calendar.mjs";

export const STRATEGY_ID = "TQQQ-Gold50-Research-v0.1";
export const STRATEGY_VERSION = "gold-overlay-shadow-0.1.0";
export const SOURCE_VERSION = "VS13-v1.0";
const TARGET_TOLERANCE = 1e-12;
const READY_SOURCE_STATES = new Set(["latest", "market_closed"]);

export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const finiteUnit = (value) => Number.isFinite(value) && value >= 0 && value <= 1;
const finitePositive = (value) => Number.isFinite(value) && value > 0;
const time = (value) => {
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

export function mapGold50(sourceTarget) {
  if (!finiteUnit(sourceTarget)) throw new Error("source target must be finite and inside [0,1]");
  const complement = 1 - sourceTarget;
  return { TQQQ: sourceTarget, GLD: complement * 0.5, CASH: complement * 0.5 };
}

export function estimateBrokerLegs(previousTarget, target) {
  const before = mapGold50(previousTarget);
  const after = mapGold50(target);
  return ["TQQQ", "GLD"].filter((asset) => Math.abs(after[asset] - before[asset]) > TARGET_TOLERANCE).length;
}

export function wholeShareDraft({ capital, target, tqqqPrice, gldPrice }) {
  if (!finitePositive(capital) || !finitePositive(tqqqPrice) || !finitePositive(gldPrice)) {
    throw new Error("capital and prices must be finite and positive");
  }
  const weights = mapGold50(target);
  const tqqqShares = Math.floor((capital * weights.TQQQ) / tqqqPrice);
  const gldShares = Math.floor((capital * weights.GLD) / gldPrice);
  const invested = tqqqShares * tqqqPrice + gldShares * gldPrice;
  const residualCash = capital - invested;
  if (residualCash < -1e-8) throw new Error("whole-share draft exceeds capital");
  return {
    status: "NON_EXECUTABLE_DRAFT",
    capital,
    shares: { TQQQ: tqqqShares, GLD: gldShares },
    notional: { TQQQ: tqqqShares * tqqqPrice, GLD: gldShares * gldPrice },
    residualCash,
    brokerOrderAllowed: false
  };
}

function validateGold(gold, signalDate, now, issues) {
  const result = { valid: true, date: null, close: null };
  if (!gold || gold.ticker !== "GLD" || !Array.isArray(gold.bars) || gold.bars.length === 0) {
    issues.push("GLD_MISSING");
    return { ...result, valid: false };
  }
  const retrieved = time(gold.retrievedAt);
  if (!Number.isFinite(retrieved)) issues.push("GLD_RETRIEVED_AT_INVALID");
  else if (retrieved > time(now)) issues.push("GLD_RETRIEVED_AT_FUTURE");

  const dates = gold.bars.map((bar) => bar?.date);
  if (new Set(dates).size !== dates.length) issues.push("GLD_DUPLICATE_DATE");
  if (dates.some((date) => !isNyseSession(date))) issues.push("GLD_INVALID_SESSION");
  const sorted = [...gold.bars].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted.at(-1);
  result.date = latest?.date ?? null;
  result.close = latest?.close ?? null;
  if (latest?.date < signalDate) issues.push("GLD_STALE");
  if (latest?.date > signalDate) issues.push("GLD_FUTURE_BAR");
  if (![latest?.open, latest?.high, latest?.low, latest?.close].every(finitePositive)) {
    issues.push("GLD_PRICE_INVALID");
  }
  if (
    [latest?.open, latest?.high, latest?.low, latest?.close].every(finitePositive)
    && (latest.high < latest.low || latest.high < Math.max(latest.open, latest.close) || latest.low > Math.min(latest.open, latest.close))
  ) {
    issues.push("GLD_OHLC_INVALID");
  }
  const prior = sorted.at(-2);
  if (prior && finitePositive(prior.close) && finitePositive(latest?.close)) {
    const ratio = latest.close / prior.close;
    if ((ratio < 0.5 || ratio > 2) && latest?.corporateAction?.type !== "SPLIT") {
      issues.push("GLD_CORPORATE_ACTION_UNRESOLVED");
    }
    if (latest?.corporateAction?.type === "SPLIT" && !finitePositive(latest.corporateAction.factor)) {
      issues.push("GLD_CORPORATE_ACTION_INVALID");
    } else if (latest?.corporateAction?.type === "SPLIT") {
      const adjustedRatio = ratio * latest.corporateAction.factor;
      if (adjustedRatio < 0.5 || adjustedRatio > 2) issues.push("GLD_CORPORATE_ACTION_FACTOR_MISMATCH");
    }
  }
  result.valid = !issues.some((issue) => issue.startsWith("GLD_"));
  return result;
}

function validateSource({ signal, status, sourceBytes, now }) {
  const issues = [];
  const source = signal?.signal;
  if (!signal || !source || typeof sourceBytes !== "string") issues.push("SOURCE_MISSING");
  if (signal?.strategyVersion !== SOURCE_VERSION) issues.push("SOURCE_VERSION_MISMATCH");
  if (signal?.assetTicker !== "TQQQ") issues.push("SOURCE_ASSET_MISMATCH");
  if (signal?.platformMode !== "RESEARCH") issues.push("SOURCE_MODE_MISMATCH");
  if (!READY_SOURCE_STATES.has(signal?.state) || !READY_SOURCE_STATES.has(status?.state)) {
    issues.push("UPSTREAM_STATE_NOT_READY");
  }
  if (typeof sourceBytes === "string") {
    try {
      if (JSON.stringify(JSON.parse(sourceBytes)) !== JSON.stringify(signal)) issues.push("SOURCE_BYTES_MISMATCH");
    } catch {
      issues.push("SOURCE_BYTES_INVALID");
    }
  }
  if (!isNyseSession(signal?.dataDate) || source?.date !== signal?.dataDate) issues.push("SOURCE_DATE_INVALID");
  if (!finiteUnit(source?.target) || !finiteUnit(source?.previousTarget)) issues.push("SOURCE_TARGET_INVALID");

  const generatedAt = time(signal?.generatedAt);
  const statusGeneratedAt = time(status?.generatedAt);
  const nowTime = time(now);
  if (![generatedAt, statusGeneratedAt, nowTime].every(Number.isFinite)) issues.push("GENERATION_TIME_INVALID");
  else {
    if (generatedAt > nowTime || statusGeneratedAt > nowTime) issues.push("FUTURE_GENERATION");
    if (Math.abs(generatedAt - statusGeneratedAt) > 60_000) issues.push("CROSS_GENERATION_MISMATCH");
  }
  if (status?.actionStatus !== "success" || (status?.errors?.length ?? 0) > 0) issues.push("UPSTREAM_STATUS_FAILED");
  if (status?.signalDate !== signal?.dataDate || status?.marketDataDate !== signal?.dataDate) {
    issues.push("UPSTREAM_DATE_MISMATCH");
  }
  try {
    if (completedNyseSessionsSince(signal?.generatedAt, now) > 0) issues.push("SOURCE_STALE");
  } catch {
    issues.push("SOURCE_STALE");
  }

  let earliestLegalDate = null;
  try {
    earliestLegalDate = nextNyseSession(source?.date);
    if (source?.executionDate !== earliestLegalDate) issues.push("EXECUTION_DATE_MISMATCH");
  } catch {
    issues.push("EXECUTION_DATE_INVALID");
  }
  return { issues, earliestLegalDate };
}

export function buildShadowArtifact({ signal, status, gold, sourceBytes, now, wholeShare = null }) {
  const sourceValidation = validateSource({ signal, status, sourceBytes, now });
  const issues = [...sourceValidation.issues];
  const goldState = validateGold(gold, signal?.dataDate, now, issues);
  const sourceValid = !issues.some((issue) => !issue.startsWith("GLD_"));
  const coherentGeneration = !issues.includes("CROSS_GENERATION_MISMATCH") && !issues.includes("UPSTREAM_DATE_MISMATCH");
  const valid = issues.length === 0;
  const changed = valid && Math.abs(signal.signal.target - signal.signal.previousTarget) > TARGET_TOLERANCE;
  const window = sourceValidation.earliestLegalDate
    ? executionWindow(sourceValidation.earliestLegalDate, now)
    : "INVALID_SESSION";
  const missed = valid && changed && window === "OPEN_PASSED";
  const target = valid ? mapGold50(signal.signal.target) : null;
  const targetSum = target ? target.TQQQ + target.GLD + target.CASH : null;
  if (target && Math.abs(targetSum - 1) > TARGET_TOLERANCE) throw new Error("target sum invariant failed");

  let wholeShareDraftResult = null;
  if (valid && wholeShare) {
    wholeShareDraftResult = wholeShareDraft({ ...wholeShare, target: signal.signal.target });
  }
  return {
    schemaVersion: 1,
    mode: "SHADOW_RESEARCH",
    strategyId: STRATEGY_ID,
    strategyVersion: STRATEGY_VERSION,
    generatedAt: now,
    marketDataDate: signal?.dataDate ?? null,
    sourceSignal: {
      strategyId: signal?.strategyVersion ?? null,
      signalDate: signal?.signal?.date ?? null,
      target: finiteUnit(signal?.signal?.target) ? signal.signal.target : null,
      previousTarget: finiteUnit(signal?.signal?.previousTarget) ? signal.signal.previousTarget : null,
      artifactHash: typeof sourceBytes === "string" ? sha256(sourceBytes) : null
    },
    target,
    execution: {
      earliestLegalDate: sourceValidation.earliestLegalDate,
      timing: window,
      actionDay: changed,
      estimatedBrokerLegs: valid ? estimateBrokerLegs(signal.signal.previousTarget, signal.signal.target) : 0,
      brokerOrderAllowed: false
    },
    freshness: {
      sourceSignalValid: sourceValid,
      gldValid: goldState.valid,
      coherentGeneration
    },
    diagnostics: {
      issues,
      gldDate: goldState.date,
      gldClose: goldState.close,
      mapping: "TQQQ=VS13 target; GLD=CASH=(1-target)/2",
      authority: "NONE_SHADOW_ONLY"
    },
    wholeShareDraft: wholeShareDraftResult,
    status: valid ? (missed ? "NO_ACTION" : "SHADOW_ONLY") : "CHECK_DATA"
  };
}
