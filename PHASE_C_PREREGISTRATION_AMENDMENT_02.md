# Phase C Preregistration Amendment 02 — Tiingo Live Provider / Independent Repository

Date: 2026-09-09
Status: `AUTHORIZED — IMPLEMENTED / C0/10 START BASELINE`

## Explicit authorization and baseline

The user explicitly approved selecting a live GLD provider and starting Phase C. Tiingo EOD is selected as the sole GLD provider. Phase C is implemented in the independent repository `rinko0211/gold50-shadow-monitor`; `rinko0211/tqqq-signal-lab` remains read-only.

The supplied recovery package is `tqqq-gold50-shadow-r1(1).zip`, SHA-256 `e953d11d1f33758f06f898c812d8a8c789262e8100e6de55cda0ca512a833a39`. It contains the Phase B mapper and reports 20/20 Phase B tests PASS. This SHA is not represented as the unavailable historical frozen ZIP SHA `856431...`; Phase C therefore starts a new implementation baseline `phase-c-tiingo-v1` at C0/10. No historical session is backfilled.

## Frozen strategy logic

The mapper is unchanged:

- `TQQQ = authoritative VS13 target`
- `GLD = (1 - target) / 2`
- `CASH = (1 - target) / 2`

Authority remains `SHADOW_RESEARCH` / `NONE_SHADOW_ONLY` / `brokerOrderAllowed=false`.

## Input sources

- TQQQ signal: public `tqqq-signal-lab` `signal.json`, read-only.
- TQQQ runtime status: public `tqqq-signal-lab` `status.json`, read-only.
- GLD EOD: Tiingo EOD REST API using repository secret `TIINGO_API_TOKEN` in the Authorization header.
- No scraping and no automatic fallback provider.

## Tiingo license-safe evidence rule

Tiingo individual plans are internal-use-only. Therefore raw Tiingo OHLC and raw provider responses are ephemeral in the GitHub Actions runner and are not committed, published, or uploaded as artifacts. Persistent evidence stores only hashes, session identity, validation result, mapper result, replay hash, diagnostics, and authority invariants. The sanitized persisted result excludes `gldClose` and all raw Tiingo OHLC values.

This replaces the earlier requirement to persist raw GLD input files. The change occurs before any Phase C session is counted, so the baseline is C0/10.

## Countability

A session counts only when:

1. TQQQ signal/status are coherent and current.
2. Tiingo returns a valid GLD bar for the same completed NYSE session.
3. The frozen mapper returns `SHADOW_ONLY` or normal `NO_ACTION` without integrity issues.
4. Deterministic in-run replay matches the canonical decision hash.
5. Authority invariants pass.
6. The session date has not already counted under the current baseline.

`CHECK_DATA`, provider failure, missing secret, stale/mismatched dates, malformed data, or duplicate already-counted sessions do not advance the counter. BLOCKED observations do not reset prior successful sessions. Any strategy/formula/schema/contract change after the first countable session requires a new baseline and C0 reset.

## Scheduling and stop gate

The independent workflow retries after expected Tiingo EOD availability and before the next normal NYSE open. It uses a dedicated concurrency group and cannot write to the TQQQ repository. At C10/10 the script stops advancing automatically; Phase D/integration does not start automatically.
