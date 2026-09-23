import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workflowPath = ".github/workflows/phase-c-monitor.yml";

test("completed Phase C workflow is read-only and unscheduled", async () => {
  const text = await readFile(workflowPath, "utf8");
  assert.match(text, /^\s*contents:\s*read\s*$/m);
  assert.doesNotMatch(text, /^\s*schedule:\s*$/m);
  assert.doesNotMatch(text, /TIINGO_API_TOKEN|secrets\./);
  assert.doesNotMatch(text, /git\s+(push|commit|add)|npm\s+run\s+phasec:run/);
  assert.match(text, /COMPLETE_STOP_GATE/);
  assert.match(text, /C10\/10/);
  assert.match(text, /NONE_SHADOW_ONLY/);
});

test("archived Phase C evidence remains complete and non-authoritative", async () => {
  const status = JSON.parse(await readFile("phase-c/status.json", "utf8"));
  assert.equal(status.counter, "C10/10");
  assert.equal(status.successfulSessions, 10);
  assert.equal(status.targetSessions, 10);
  assert.equal(status.phaseCState, "COMPLETE_STOP_GATE");
  assert.equal(status.productionAuthority, false);
  assert.equal(status.brokerOrderAllowed, false);
  assert.equal(status.rawTiingoDataPersisted, false);
  assert.equal(status.latestObservation?.replayVerified, true);
  assert.equal(status.latestObservation?.authorityInvariantPass, true);
  assert.equal(status.latestObservation?.authority, "NONE_SHADOW_ONLY");
  assert.equal(status.latestObservation?.brokerOrderAllowed, false);
});
