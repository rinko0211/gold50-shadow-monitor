import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runPhaseC, sanitizeArtifact, summarize, tiingoBarsFromResponse } from "../src/phase-c-monitor.mjs";

const NOW = "2026-09-08T22:45:00.000Z";
const signal = {
  generatedAt: "2026-09-08T22:35:00.000Z",
  dataDate: "2026-09-08",
  platformMode: "RESEARCH",
  assetTicker: "TQQQ",
  strategyVersion: "VS13-v1.0",
  signal: { date: "2026-09-08", target: 0.75, previousTarget: 0.75, executionDate: "2026-09-09" }
};
const status = { generatedAt: signal.generatedAt, actionStatus: "success", marketDataDate: "2026-09-08", signalDate: "2026-09-08", errors: [] };
const tiingo = [
  { date: "2026-09-04T00:00:00.000Z", open: 405, high: 409, low: 404, close: 408, splitFactor: 1 },
  { date: "2026-09-08T00:00:00.000Z", open: 410, high: 414, low: 409, close: 413, splitFactor: 1 }
];

function fakeFetch(url, options = {}) {
  if (url.includes("signal.json")) return Promise.resolve(`${JSON.stringify(signal)}\n`);
  if (url.includes("status.json")) return Promise.resolve(`${JSON.stringify(status)}\n`);
  if (url.includes("api.tiingo.com")) {
    assert.match(options.headers.Authorization, /^Token /);
    return Promise.resolve(JSON.stringify(tiingo));
  }
  throw new Error("UNEXPECTED_URL");
}

test("Tiingo response maps OHLC for validation", () => {
  const gold = tiingoBarsFromResponse(tiingo, NOW);
  assert.equal(gold.ticker, "GLD");
  assert.equal(gold.bars.at(-1).date, "2026-09-08");
});

test("sanitized evidence never persists raw Tiingo price", () => {
  const sanitized = sanitizeArtifact({
    schemaVersion: 1, mode: "SHADOW_RESEARCH", strategyId: "x", strategyVersion: "y", marketDataDate: "2026-09-08",
    sourceSignal: {}, target: {}, execution: {}, freshness: {}, diagnostics: { issues: [], gldDate: "2026-09-08", gldClose: 413, mapping: "m", authority: "NONE_SHADOW_ONLY" }, status: "SHADOW_ONLY"
  });
  assert.equal("gldClose" in sanitized.diagnostics, false);
  assert.doesNotMatch(JSON.stringify(sanitized), /413/);
});

test("valid same-session run counts once", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gold50-phasec-"));
  const observationsPath = join(dir, "observations.jsonl");
  const statusPath = join(dir, "status.json");
  const first = await runPhaseC({ now: NOW, token: "secret", observationsPath, statusPath, fetcher: fakeFetch });
  assert.equal(first.observation.classification, "PASS_COUNTABLE");
  assert.equal(first.status.counter, "C1/10");
  const second = await runPhaseC({ now: NOW, token: "secret", observationsPath, statusPath, fetcher: fakeFetch });
  assert.equal(second.observation.classification, "PASS_DUPLICATE_SESSION_NOT_COUNTED");
  assert.equal(second.status.counter, "C1/10");
});

test("missing token blocks without advancing", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gold50-phasec-token-"));
  const result = await runPhaseC({ now: NOW, token: "", observationsPath: join(dir, "obs.jsonl"), statusPath: join(dir, "status.json"), fetcher: fakeFetch });
  assert.equal(result.observation.classification, "BLOCKED_NOT_COUNTABLE");
  assert.deepEqual(result.observation.diagnosticCodes, ["TIINGO_API_TOKEN_MISSING"]);
  assert.equal(result.status.counter, "C0/10");
});

test("stale TQQQ source blocks even if historical GLD can be fetched", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gold50-phasec-stale-"));
  const staleSignal = structuredClone(signal);
  staleSignal.generatedAt = "2026-09-04T22:35:00.000Z";
  staleSignal.dataDate = "2026-09-04";
  staleSignal.signal.date = "2026-09-04";
  staleSignal.signal.executionDate = "2026-09-08";
  const staleStatus = { ...status, generatedAt: staleSignal.generatedAt, marketDataDate: "2026-09-04", signalDate: "2026-09-04" };
  const fetcher = (url) => {
    if (url.includes("signal.json")) return Promise.resolve(JSON.stringify(staleSignal));
    if (url.includes("status.json")) return Promise.resolve(JSON.stringify(staleStatus));
    if (url.includes("api.tiingo.com")) return Promise.resolve(JSON.stringify([tiingo[0]]));
    throw new Error("UNEXPECTED_URL");
  };
  const result = await runPhaseC({ now: NOW, token: "secret", observationsPath: join(dir, "obs.jsonl"), statusPath: join(dir, "status.json"), fetcher });
  assert.equal(result.observation.classification, "BLOCKED_NOT_COUNTABLE");
  assert.ok(result.observation.diagnosticCodes.includes("SOURCE_STALE"));
});

test("summary grants no Production or broker authority", () => {
  const summary = summarize([{ baseline: "phase-c-tiingo-v1", observedAt: "a", marketDataDate: "2026-09-08", countable: true }]);
  assert.equal(summary.counter, "C1/10");
  assert.equal(summary.productionAuthority, false);
  assert.equal(summary.brokerOrderAllowed, false);
});
