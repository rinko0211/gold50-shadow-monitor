# Gold50 scope restoration — manual signals, no broker automation, broader candidate census

Date: **2026-10-11 JST**. User scope clarification. No change to frozen Gold50 mapper, immutable Phase C observations, scheduled workflows, or other repository.

## Actual user goal

TQQQ-related **and Gold-related** investment strategy variants should be prospectively evaluated as a broadly **preregistered candidate universe**, then compared and selected on evidence. The system **computes/displays** current BUY/SELL/HOLD/WAIT signals and target weights; **the user manually enters any actual orders**. There is no consent to automated brokerage orders, order routing, account trading API, unattended allocation, or future automatic trading gateway. Manual annual transaction workload should be about **30–40 or fewer trades**, with distinct counts for order legs versus Action Days.

This repository is **Gold research only** and must not write TQQQ Signal Lab data. TQQQ strategy selection and Gold-based portfolio comparison remain separately governed until evidence supports a user-selected manual signal.

## What has actually been implemented (do not overstate)

- A single frozen `TQQQ-Gold50-Research-v0.1` / `gold-overlay-shadow-0.1.0` mapper: `TQQQ=VS13 target; GLD=CASH=(1-target)/2`.
- Tiingo GLD EOD read-only consumption plus TQQQ source JSON read-only.
- `phase-c/status.json`: **C10/10** successful research observations from **2026-09-08 through 2026-09-21**, `phaseCState=COMPLETE_STOP_GATE`. This is a finite provider/integrity shadow check, **not** comparative multi-candidate Forward readiness or a user-authorized trading system.
- No independent Gold candidate family/version census, ongoing multi-variant performance ledger, or documented sufficient prospective comparison across Gold alternatives is certified by the current repository.
- Earlier research context investigated (at least) fixed allocations; partial **GLD replacement of the non-TQQQ VS13 sleeve**; and a TQQQ cap plus always-on GLD. These are **research directions**, not automatically frozen executable candidates, and no new arbitrary allocation ratios may be presented as already approved.

## Corrective sequence, pending separate research review

1. Recover Gold research experiment results, hypothesis registration, exact parameter grids and exclusion reasons from historical artifacts and any parent project; identify all genuinely preregistered distinct candidate versions and the universe meant by the user's 'dozens'. Label missing inventory as **UNVERIFIED**, not complete.
2. Track candidate `strategyId`, `version`, `formula`, underlying, source, start/freeze date, admissible use, expected manual trade-count range and `status` (`ACTIVE`, `ELIGIBLE_NOT_ENROLLED`, `REJECTED_HISTORICALLY`, `DEFERRED`, `BENCHMARK`, `UNVERIFIED`). Historical rejected variants need a new prospective preregistration to be reconsidered.
3. In a separate approved Gold research phase, prospectively freeze and register **all user-approved eligible** Gold strategy versions in independent append-only Forward ledgers. Never backdate a new version or reinterpret closed Phase C evidence as a longer Forward test; maintain Gold/TQQQ independent data boundaries.
4. Compare these and the TQQQ-side candidates over actual common market sessions and sufficiently varied regimes; control missing prices, overfitting, correlated candidates, nonzero turnover, downside/DD/recovery, risk-adjusted metrics, transaction costs/slippage, and annual human manual order legs. No best-of-grid ranking without adequate unobserved Forward evidence.
5. Present a final selection **to the user** for a manually operated primary signal only after the agreed candidate universe is adequately tested. No auto strategy promotion or automated trading at any stage.

## Immediate allowed scope

This corrective record is **documentation-only**. Keep Phase C `COMPLETE_STOP_GATE`, TQQQ VS13 source, all existing histories, Tiingo credentials and all current schedulers **unchanged**. Do not restart the closed 10/10 monitor; do not create a new Gold live source pipeline or new strategies without a separate, reviewed research charter. No broker APIs or order execution. Status remains **GAP: multi-candidate Gold Forward NOT IMPLEMENTED**.

Related correction: `rinko0211/tqqq-signal-lab/research/USER_SCOPE_MANUAL_TRADES_FULL_FORWARD_CENSUS_2026-10-11.md`.
