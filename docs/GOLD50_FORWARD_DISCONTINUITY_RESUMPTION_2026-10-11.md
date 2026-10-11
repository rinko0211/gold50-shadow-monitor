# Gold50 prospective Forward — explicitly recorded discontinuities (2026-10-11)

## Scope

Amend the **research-only** Oct12 long Forward collector after identifying a permanent deadlock: if an NYSE session is missed because Tiingo/TQQQ is delayed, the previous v1 collector rejects the next valid market date forever. The user specifically requires the unified TQQQ+Gold UI and Forward to work across completed-soak gaps, provider outages and forward restarts.

The observed Phase C remains **C10/10 COMPLETE_STOP_GATE**. Gold50 frozen mapping and data authentication remain unchanged. No auto broker connection or order placement of any kind.

## Fail-closed state-transition rule

- **Complete same-session record**: `CONTIGUOUS` (or `INITIAL` for the first Oct12 observation).
- **One or more full NYSE sessions absent**: the next genuinely valid completed-session observation can append with immutable `continuity.kind=UNOBSERVED_GAP`, `expectedDate` and `actualDate`. It must be visibly a **new segment**. Missing days are never synthesized, replayed or counted.
- **Initial Oct12 source absent**: the first later genuinely validated session may be recorded only as `UNOBSERVED_GAP` relative to preregistered Oct12; Oct12 itself remains missing and never backfilled. The initial baseline identity and start date remain Oct12.
- **Out-of-order, duplicate, forged/missing gap metadata**: reject; do not append.
- **After a gap, VS13 previousTarget cannot be compared to last *observed* target** because there were missing upstream days; no false cross-gap consistency claim.
- **Manual trade burden on first post-gap observation is unknown**: `estimatedManualOrderLegs=null`, `manualLegEstimateReliable=false`, `actionDay=null`; never assume that zero executions happened in the missing interval.
- **Even after restart**: `mode=SHADOW_RESEARCH`, `authority=NONE_SHADOW_ONLY`, `brokerOrderAllowed=false`, raw Tiingo GLD OHLC not persisted. This is **observation continuity, not portfolio continuity**. Combined CAGR/DD/pnl must not be computed across a missing period.

The status file independently reports `observedSegments` and `unobservedGapCount`. UI must render segment boundaries; in-progress or stale segments must never be treated as current trade authorization. Such states do not automatically make the strategy eligible for selection.

## Verification

The existing Gold50 test suite and additional tests verify explicit first-session gap restart, post-initial missed NYSE session, preserving original immutable observations, unknown leg count, and failure of forged gap claims. No changes to workflow secrets, scheduler, Phase C, TQQQ source repository or frozen rule parameters.

## Human-only end product

This research system generates and displays candidate allocations. The user alone makes and executes any brokerage decision. Historic research evidence never becomes an instruction for automatic trading.
