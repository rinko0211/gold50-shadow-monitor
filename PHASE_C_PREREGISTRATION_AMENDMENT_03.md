# Phase C Preregistration Amendment 03 — Completed-Session Timing Guard

Date: 2026-09-09
Status: `AUTHORIZED BY DAILY-MONITOR REFERENCE — IMPLEMENTED BEFORE FIRST COUNTABLE SESSION`
Baseline: `phase-c-tiingo-v1`
Counter at change: `C0/10`

## Reason

The daily-monitor reference requires one formal observation per completed NYSE session and identifies a prior gap: treating every session as if it closes at 16:00 ET can misclassify official early-close days, and same-date timestamps alone do not prove that signal generation, GLD retrieval, and evaluation occurred after the completed session.

Because no Phase C session has yet counted, this guard is added before C1 without changing the frozen strategy, mapper, schema authority, provider, or baseline.

## Guard added

The monitor now requires:

- actual official NYSE core-session close boundary for the monitored session;
- TQQQ signal generation at or after that close;
- TQQQ status generation at or after that close;
- GLD retrieval at or after that close;
- evaluation at or after that close;
- normal freshness, same-session, replay, and authority checks remain unchanged.

The current official NYSE published close calendar is explicitly encoded for 2026-2028. Unknown close-calendar years fail closed rather than silently assuming that an early-close day is a normal 16:00 session.

## 2026 official early closes relevant to the calendar guard

- 2026-11-27: 13:00 ET
- 2026-12-24: 13:00 ET

Regular core sessions close at 16:00 ET.

## New fail-closed diagnostics

- `SOURCE_GENERATED_BEFORE_SESSION_CLOSE`
- `STATUS_GENERATED_BEFORE_SESSION_CLOSE`
- `SESSION_NOT_COMPLETE`
- `SESSION_CLOSE_UNVERIFIED`
- `GLD_RETRIEVED_BEFORE_SESSION_CLOSE`
- `GLD_SESSION_CLOSE_UNVERIFIED`

## Regression evidence requirement

Permanent tests must prove:

1. a normal 2026 session is incomplete immediately before 16:00 ET and complete at 16:00 ET;
2. the 2026-11-27 early-close session is incomplete immediately before 13:00 ET and complete at 13:00 ET;
3. same-date pre-close TQQQ/GLD inputs fail closed;
4. coherent same-session inputs after an official early close can pass normal shadow validation.

## Invariants unchanged

- frozen mapper unchanged;
- TQQQ repository read-only from Gold50;
- Tiingo remains sole approved GLD provider;
- no raw Tiingo OHLC persistence;
- `SHADOW_RESEARCH` only;
- `NONE_SHADOW_ONLY`;
- `brokerOrderAllowed=false`;
- duplicate sessions never increment the Phase C counter;
- no historical backfill;
- `C10/10` remains a stop gate, not automatic integration or Production approval.
