import { createHash } from "node:crypto";

export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function canonicalDecision(artifact) {
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
    diagnostics: artifact.diagnostics,
    wholeShareDraft: artifact.wholeShareDraft,
    status: artifact.status
  };
}
