#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { canonicalDecision } from "./audit.mjs";
import { buildShadowArtifact, sha256 } from "./shadow.mjs";

const TQQQ_SIGNAL_URL = "https://raw.githubusercontent.com/rinko0211/tqqq-signal-lab/main/github-pages/public/data/signal.json";
const TQQQ_STATUS_URL = "https://raw.githubusercontent.com/rinko0211/tqqq-signal-lab/main/github-pages/public/data/status.json";
const TIINGO_ENDPOINT = "https://api.tiingo.com/tiingo/daily/GLD/prices";
const BASELINE = "phase-c-tiingo-v1";
const TARGET_COUNT = 10;
const OBS_PATH = resolve("phase-c/observations.jsonl");
const STATUS_PATH = resolve("phase-c/status.json");

const isoNow = () => new Date().toISOString();
const isIsoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value ?? "");
const minusDays = (date, days) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
};

async function fetchText(url, options = {}) {
  const response = await fetch(url, { ...options, redirect: "error", headers: { "User-Agent": "gold50-shadow-monitor/phase-c", ...(options.headers ?? {}) } });
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  return response.text();
}

export function tiingoBarsFromResponse(rows, retrievedAt) {
  if (!Array.isArray(rows)) throw new Error("TIINGO_RESPONSE_NOT_ARRAY");
  const bars = rows.map((row) => {
    const date = typeof row?.date === "string" ? row.date.slice(0, 10) : null;
    const bar = { date, open: row?.open, high: row?.high, low: row?.low, close: row?.close };
    if (Number.isFinite(row?.splitFactor) && Math.abs(row.splitFactor - 1) > 1e-12) {
      bar.corporateAction = { type: "SPLIT", factor: row.splitFactor };
    }
    return bar;
  });
  return { ticker: "GLD", retrievedAt, bars };
}

export function sanitizeArtifact(artifact) {
  return {
    schemaVersion: artifact.schemaVersion,
    mode: artifact.mode,
    strategyId: artifact.strategyId,
    strategyVersion: artifact.strategyVersion,
    marketDataDate: artifact.marketDataDate,
    sourceSignal: artifact.sourceSignal,
    target: artifact.target,
    execution: artifact.execution,
    freshness: artifact.freshness,
    diagnostics: {
      issues: artifact.diagnostics.issues,
      gldDate: artifact.diagnostics.gldDate,
      mapping: artifact.diagnostics.mapping,
      authority: artifact.diagnostics.authority
    },
    status: artifact.status
  };
}

export function summarize(observations) {
  const current = observations.filter((x) => x.baseline === BASELINE);
  const successfulDates = [];
  const seen = new Set();
  for (const item of current) {
    if (item.countable === true && isIsoDate(item.marketDataDate) && !seen.has(item.marketDataDate)) {
      seen.add(item.marketDataDate);
      successfulDates.push(item.marketDataDate);
    }
  }
  successfulDates.sort();
  const count = Math.min(successfulDates.length, TARGET_COUNT);
  return {
    schemaVersion: 1,
    baseline: BASELINE,
    targetSessions: TARGET_COUNT,
    successfulSessions: count,
    counter: `C${count}/${TARGET_COUNT}`,
    successfulDates,
    phaseCState: count >= TARGET_COUNT ? "COMPLETE_STOP_GATE" : "ACTIVE",
    latestObservation: current.at(-1) ?? null,
    updatedAt: current.at(-1)?.observedAt ?? null,
    rawTiingoDataPersisted: false,
    productionAuthority: false,
    brokerOrderAllowed: false
  };
}

async function readObservations(path = OBS_PATH) {
  try {
    const text = await readFile(path, "utf8");
    return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

async function appendObservation(observation, path = OBS_PATH) {
  await mkdir(dirname(path), { recursive: true });
  let prior = "";
  try { prior = await readFile(path, "utf8"); } catch (error) { if (error?.code !== "ENOENT") throw error; }
  await writeFile(path, `${prior}${JSON.stringify(observation)}\n`, "utf8");
}

async function writeStatus(status, path = STATUS_PATH) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(status, null, 2)}\n`, "utf8");
}

function blockedObservation({ now, code, detail = null, signalHash = null, statusHash = null, providerHash = null, marketDataDate = null }) {
  return {
    schemaVersion: 1,
    baseline: BASELINE,
    observedAt: now,
    marketDataDate,
    classification: "BLOCKED_NOT_COUNTABLE",
    countable: false,
    shadowStatus: "CHECK_DATA",
    diagnosticCodes: [code],
    detail,
    inputHashes: { signal: signalHash, status: statusHash, tiingo: providerHash },
    replayVerified: false,
    authority: "NONE_SHADOW_ONLY",
    brokerOrderAllowed: false,
    provider: { name: "Tiingo EOD", rawDataPersisted: false }
  };
}

export async function runPhaseC({ now = isoNow(), token = process.env.TIINGO_API_TOKEN, observationsPath = OBS_PATH, statusPath = STATUS_PATH, fetcher = fetchText } = {}) {
  const existing = await readObservations(observationsPath);
  const before = summarize(existing);
  if (before.phaseCState === "COMPLETE_STOP_GATE") return { skipped: true, reason: "PHASE_C_COMPLETE", status: before };

  let signalText, statusText, tiingoText;
  let signalHash = null, statusHash = null, providerHash = null;
  let marketDataDate = null;
  try {
    [signalText, statusText] = await Promise.all([fetcher(TQQQ_SIGNAL_URL), fetcher(TQQQ_STATUS_URL)]);
    signalHash = sha256(signalText);
    statusHash = sha256(statusText);
    const signal = JSON.parse(signalText);
    const status = JSON.parse(statusText);
    marketDataDate = signal?.dataDate ?? null;
    if (!isIsoDate(marketDataDate)) throw new Error("TQQQ_SIGNAL_DATE_INVALID");
    if (!token) throw new Error("TIINGO_API_TOKEN_MISSING");

    const startDate = minusDays(marketDataDate, 14);
    const url = `${TIINGO_ENDPOINT}?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(marketDataDate)}`;
    tiingoText = await fetcher(url, { headers: { Authorization: `Token ${token}`, Accept: "application/json" } });
    providerHash = sha256(tiingoText);
    const gold = tiingoBarsFromResponse(JSON.parse(tiingoText), now);

    const input = { signal, status, gold, sourceBytes: signalText, now };
    const artifact = buildShadowArtifact(input);
    const replayArtifact = buildShadowArtifact(input);
    const decisionHash = sha256(JSON.stringify(canonicalDecision(artifact)));
    const replayDecisionHash = sha256(JSON.stringify(canonicalDecision(replayArtifact)));
    const replayVerified = decisionHash === replayDecisionHash;
    const invariantPass = artifact.mode === "SHADOW_RESEARCH" && artifact.diagnostics.authority === "NONE_SHADOW_ONLY" && artifact.execution.brokerOrderAllowed === false;
    const validShadow = ["SHADOW_ONLY", "NO_ACTION"].includes(artifact.status) && replayVerified && invariantPass;

    const alreadyCounted = existing.some((x) => x.baseline === BASELINE && x.countable === true && x.marketDataDate === artifact.marketDataDate);
    const countable = validShadow && !alreadyCounted;
    const classification = countable
      ? "PASS_COUNTABLE"
      : validShadow
        ? "PASS_DUPLICATE_SESSION_NOT_COUNTED"
        : "BLOCKED_NOT_COUNTABLE";
    const observation = {
      schemaVersion: 1,
      baseline: BASELINE,
      observedAt: now,
      marketDataDate: artifact.marketDataDate,
      classification,
      countable,
      shadowStatus: artifact.status,
      diagnosticCodes: artifact.diagnostics.issues,
      inputHashes: { signal: signalHash, status: statusHash, tiingo: providerHash },
      artifactHash: sha256(JSON.stringify(artifact)),
      canonicalDecisionHash: decisionHash,
      replayVerified,
      authorityInvariantPass: invariantPass,
      authority: "NONE_SHADOW_ONLY",
      brokerOrderAllowed: false,
      provider: { name: "Tiingo EOD", endpoint: "/tiingo/daily/GLD/prices", rawDataPersisted: false },
      result: sanitizeArtifact(artifact)
    };
    await appendObservation(observation, observationsPath);
    const updated = await readObservations(observationsPath);
    const summary = summarize(updated);
    await writeStatus(summary, statusPath);
    return { skipped: false, observation, status: summary };
  } catch (error) {
    const code = error instanceof SyntaxError ? "UPSTREAM_JSON_INVALID" : (error instanceof Error ? error.message : "UNKNOWN_ERROR");
    const observation = blockedObservation({ now, code, signalHash, statusHash, providerHash, marketDataDate });
    await appendObservation(observation, observationsPath);
    const updated = await readObservations(observationsPath);
    const summary = summarize(updated);
    await writeStatus(summary, statusPath);
    return { skipped: false, observation, status: summary };
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runPhaseC();
  process.stdout.write(`${JSON.stringify({ classification: result.observation?.classification ?? result.reason, counter: result.status.counter, marketDataDate: result.observation?.marketDataDate ?? null, shadowStatus: result.observation?.shadowStatus ?? null }, null, 2)}\n`);
}
