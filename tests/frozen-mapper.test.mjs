import assert from "node:assert/strict";
import test from "node:test";
import { buildShadowArtifact, mapGold50 } from "../src/shadow.mjs";

function fixture() {
  const signal = {
    generatedAt: "2026-09-08T22:35:00.000Z",
    dataDate: "2026-09-08",
    platformMode: "RESEARCH",
    assetTicker: "TQQQ",
    strategyVersion: "VS13-v1.0",
    signal: { date: "2026-09-08", target: 0.75, previousTarget: 0.5, executionDate: "2026-09-09" }
  };
  const status = { generatedAt: signal.generatedAt, actionStatus: "success", marketDataDate: signal.dataDate, signalDate: signal.dataDate, errors: [] };
  const gold = { ticker: "GLD", retrievedAt: "2026-09-08T22:40:00.000Z", bars: [
    { date: "2026-09-04", open: 400, high: 405, low: 398, close: 404 },
    { date: "2026-09-08", open: 405, high: 410, low: 404, close: 409 }
  ] };
  return { signal, status, gold, sourceBytes: JSON.stringify(signal), now: "2026-09-08T22:45:00.000Z" };
}

test("frozen Gold50 mapping is exact for VS13 target grid", () => {
  for (const target of [0, 0.25, 0.5, 0.75, 1]) {
    const mapped = mapGold50(target);
    assert.equal(mapped.TQQQ, target);
    assert.equal(mapped.GLD, (1 - target) / 2);
    assert.equal(mapped.CASH, (1 - target) / 2);
    assert.equal(mapped.TQQQ + mapped.GLD + mapped.CASH, 1);
  }
});

test("valid mapper output is shadow-only and non executable", () => {
  const artifact = buildShadowArtifact(fixture());
  assert.equal(artifact.mode, "SHADOW_RESEARCH");
  assert.equal(artifact.diagnostics.authority, "NONE_SHADOW_ONLY");
  assert.equal(artifact.execution.brokerOrderAllowed, false);
  assert.equal(artifact.status, "SHADOW_ONLY");
});

test("stale GLD fails closed", () => {
  const input = fixture();
  input.gold.bars.pop();
  const artifact = buildShadowArtifact(input);
  assert.equal(artifact.status, "CHECK_DATA");
  assert.ok(artifact.diagnostics.issues.includes("GLD_STALE"));
});

test("future GLD retrieval timestamp fails closed", () => {
  const input = fixture();
  input.gold.retrievedAt = "2026-09-09T00:00:00.000Z";
  const artifact = buildShadowArtifact(input);
  assert.equal(artifact.status, "CHECK_DATA");
  assert.ok(artifact.diagnostics.issues.includes("GLD_RETRIEVED_AT_FUTURE"));
});

test("passed intended open becomes NO_ACTION and never rolls forward", () => {
  const input = fixture();
  input.now = "2026-09-09T14:00:00.000Z";
  const artifact = buildShadowArtifact(input);
  assert.equal(artifact.status, "NO_ACTION");
  assert.equal(artifact.execution.earliestLegalDate, "2026-09-09");
  assert.equal(artifact.execution.brokerOrderAllowed, false);
});
