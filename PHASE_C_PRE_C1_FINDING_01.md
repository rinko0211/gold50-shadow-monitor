# Phase C Pre-C1 Finding 01 — Upstream provider-pending freshness gap

Date: 2026-09-09
Status: `FOUND BEFORE FIRST COUNTABLE SESSION — REMEDIATED`
Phase C counter at discovery: `C0/10`

## Finding

The recovered Phase B source validator treated TQQQ freshness primarily through generation chronology. On 2026-09-08 the TQQQ Daily workflow correctly regenerated public `signal.json` / `status.json` with a fresh `generatedAt`, but the provider had not yet published a common 2026-09-08 daily bar. The public state was therefore `provider_pending` while `dataDate` remained `2026-09-04`.

Without an explicit upstream-state readiness gate, a Gold50 observation created immediately after that regeneration could have considered the old 2026-09-04 source generation fresh, requested matching historical GLD data for 2026-09-04, and incorrectly classified the observation as countable.

No countable Phase C session had been recorded when this defect was discovered. Existing Phase C evidence remained `C0/10`, so no countable record required invalidation or rewrite.

## Root cause

Freshness and readiness were conflated. `generatedAt` measures when the upstream artifact was regenerated, not whether the upstream provider supplied the latest completed-session market data. TQQQ intentionally uses `actionStatus=success` together with state values such as `provider_pending` to publish a fail-closed operational status without pretending new market data exists.

## Remediation

Gold50 now requires both public TQQQ artifacts to have an explicitly ready state:

- allowed: `latest`, `market_closed`
- blocked: `provider_pending`, `market_pending`, `not_updated`, `failed`, missing/unknown state

Non-ready upstream state produces `UPSTREAM_STATE_NOT_READY` and `CHECK_DATA`, and cannot advance Phase C.

Permanent regressions were added in both frozen-mapper and Phase C monitor tests.

## Evidence integrity

- Strategy formula unchanged.
- Tiingo provider contract unchanged.
- TQQQ remains read-only.
- Production authority remains none.
- No broker order path is introduced.
- No historical record is deleted, rewritten, or backfilled.
- Phase C remains on baseline `phase-c-tiingo-v1` at `C0/10` because the defect was corrected before any countable session.
