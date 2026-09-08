import assert from "node:assert/strict";
import test from "node:test";
import { isCompletedNyseSession, nyseSessionCloseMinutes } from "../src/calendar.mjs";
import { buildShadowArtifact } from "../src/shadow.mjs";

const sourceBytes = (signal) => JSON.stringify(signal);

function normalSessionFixture() {
  const signal = {
    generatedAt: "2026-09-08T19:00:00.000Z",
    dataDate: "2026-09-08",
    platformMode: "RESEARCH",
    assetTicker: "TQQQ",
    strategyVersion: "VS13-v1.0",
    state: "latest",
    signal: { date: "2026-09-08", target: 0.75, previousTarget: 0.75, executionDate: "2026-09-09" }
  };
  const status = {
    generatedAt: signal.generatedAt,
    actionStatus: "success",
    marketDataDate: signal.dataDate,
    signalDate: signal.dataDate,
    state: "latest",
    errors: []
  };
  const gold = {
    ticker: "GLD",
    retrievedAt: "2026-09-08T19:01:00.000Z",
    bars: [
      { date: "2026-09-04", open: 400, high: 405, low: 398, close: 404 },
      { date: "2026-09-08", open: 405, high: 410, low: 404, close: 409 }
    ]
  };
  return { signal, status, gold, sourceBytes: sourceBytes(signal), now: "2026-09-08T19:02:00.000Z" };
}

test("regular NYSE session is not complete before 16:00 ET", () => {
  assert.equal(nyseSessionCloseMinutes("2026-09-08"), 16 * 60);
  assert.equal(isCompletedNyseSession("2026-09-08", "2026-09-08T19:59:00.000Z"), false);
  assert.equal(isCompletedNyseSession("2026-09-08", "2026-09-08T20:00:00.000Z"), true);
});

test("official 2026 day-after-Thanksgiving early close is 13:00 ET", () => {
  assert.equal(nyseSessionCloseMinutes("2026-11-27"), 13 * 60);
  assert.equal(isCompletedNyseSession("2026-11-27", "2026-11-27T17:59:00.000Z"), false);
  assert.equal(isCompletedNyseSession("2026-11-27", "2026-11-27T18:00:00.000Z"), true);
});

test("pre-close source and GLD timestamps fail closed and cannot count", () => {
  const input = normalSessionFixture();
  const artifact = buildShadowArtifact(input);
  assert.equal(artifact.status, "CHECK_DATA");
  assert.ok(artifact.diagnostics.issues.includes("SOURCE_GENERATED_BEFORE_SESSION_CLOSE"));
  assert.ok(artifact.diagnostics.issues.includes("STATUS_GENERATED_BEFORE_SESSION_CLOSE"));
  assert.ok(artifact.diagnostics.issues.includes("SESSION_NOT_COMPLETE"));
  assert.ok(artifact.diagnostics.issues.includes("GLD_RETRIEVED_BEFORE_SESSION_CLOSE"));
});

test("same-session inputs immediately after an official early close are eligible for normal shadow validation", () => {
  const signal = {
    generatedAt: "2026-11-27T18:01:00.000Z",
    dataDate: "2026-11-27",
    platformMode: "RESEARCH",
    assetTicker: "TQQQ",
    strategyVersion: "VS13-v1.0",
    state: "latest",
    signal: { date: "2026-11-27", target: 0.5, previousTarget: 0.5, executionDate: "2026-11-30" }
  };
  const status = {
    generatedAt: signal.generatedAt,
    actionStatus: "success",
    marketDataDate: signal.dataDate,
    signalDate: signal.dataDate,
    state: "latest",
    errors: []
  };
  const gold = {
    ticker: "GLD",
    retrievedAt: "2026-11-27T18:02:00.000Z",
    bars: [
      { date: "2026-11-25", open: 400, high: 405, low: 398, close: 404 },
      { date: "2026-11-27", open: 405, high: 410, low: 404, close: 409 }
    ]
  };
  const artifact = buildShadowArtifact({ signal, status, gold, sourceBytes: sourceBytes(signal), now: "2026-11-27T18:03:00.000Z" });
  assert.equal(artifact.status, "SHADOW_ONLY");
  assert.deepEqual(artifact.diagnostics.issues, []);
});
