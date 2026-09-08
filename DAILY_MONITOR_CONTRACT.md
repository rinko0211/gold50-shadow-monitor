# Gold50 / TQQQ Daily Monitoring Contract

Updated: 2026-09-09
Status: ACTIVE — Phase C baseline `phase-c-tiingo-v1`

## Purpose

Daily monitoring is session-based, not run-count-based. The formal unit is one completed NYSE trading session.

Internal retries may run several times while upstream providers are pending. Those retries exist only to obtain a valid completed-session observation and must never create multiple successful counts for the same market date.

## Separation of responsibilities

### TQQQ

- `rinko0211/tqqq-signal-lab` remains the authoritative upstream source for the frozen VS13 research signal and runtime status.
- Gold50 reads TQQQ `signal.json` and `status.json` only.
- Gold50 does not write to the TQQQ repository, retune VS13, promote Production, or fill missing TQQQ data.

### Gold50

- `rinko0211/gold50-shadow-monitor` is an independent `SHADOW_RESEARCH` monitor.
- GLD is obtained only from the approved Tiingo EOD source.
- No scraping, guessed source, synthetic fallback, or silent substitute provider is allowed.
- Authority remains `NONE_SHADOW_ONLY`; `brokerOrderAllowed=false`.

## Formal daily countability gate

A NYSE session is countable only when all of the following are true:

1. The market date is a real NYSE session and the official core session has completed.
2. Session completion uses the official close time, including published early-close dates; it is not hard-coded to 16:00 ET for every session.
3. TQQQ signal generation and TQQQ status generation occur no earlier than that session close.
4. TQQQ `signal.json` and `status.json` are coherent, successful, current, and in an accepted ready state.
5. TQQQ signal date, status date, and market-data date all identify the same completed session.
6. Tiingo returns a valid GLD bar for that same session, and GLD retrieval occurs after the official session close and no later than evaluation time.
7. Frozen mapping is unchanged: `TQQQ = VS13 target`, `GLD = CASH = (1-target)/2`.
8. Deterministic replay matches the canonical decision hash.
9. Shadow authority invariants pass and no broker/Production authority is created.
10. That market date has not already been counted under the current Phase C baseline.

A successful new session is `PASS_COUNTABLE` and advances the Phase C counter once.

## Non-countable states

The following do not advance Phase C:

- upstream `provider_pending`, `market_pending`, failed, stale, or otherwise not-ready state
- source or GLD session mismatch
- pre-close generation/retrieval/evaluation
- malformed or invalid source data
- missing Tiingo secret or provider failure
- replay or authority invariant failure
- duplicate observation of an already counted market date

Use `BLOCKED_NOT_COUNTABLE` / `CHECK_DATA` for invalid or incomplete evidence. A duplicate valid session is `PASS_DUPLICATE_SESSION_NOT_COUNTED`.

No historical backfill is created merely to fill a missing session. No passed execution open is chased.

## Phase C progression

- Start baseline: `C0/10`
- Each unique valid completed NYSE session: +1
- Duplicate runs: +0
- BLOCKED / WAITING / provider pending: +0
- At `C10/10`: automatic progression stops at `COMPLETE_STOP_GATE`
- Phase D, integration, Production, and broker execution do not begin automatically.

## Daily human-readable report

Keep TQQQ and Gold50 visibly separate.

### TQQQ section

Report at minimum:

- latest market-data date
- last calculation / generation time
- last successful Action state if relevant
- current signal / target
- next legal execution session
- strategy version
- freshness / provider state

If the provider has not delivered a new completed session, state `NO NEW SIGNAL` or the explicit pending/failure state rather than presenting the old signal as current.

### Gold50 section

Report at minimum:

- Phase C counter (`C#/10`)
- observation market date
- classification (`PASS_COUNTABLE`, `PASS_DUPLICATE_SESSION_NOT_COUNTED`, or `BLOCKED_NOT_COUNTABLE`)
- TQQQ source readiness
- GLD same-session readiness
- diagnostic code when blocked
- `SHADOW_RESEARCH / NONE_SHADOW_ONLY / brokerOrderAllowed=false`

The report must not collapse the two systems into a single health state: TQQQ may be healthy while Gold50 is blocked, and Gold50/Tiingo may be healthy while TQQQ is provider-pending.
