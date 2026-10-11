# Gold50 — actual soak-observed candidate inventory (2026-10-11)

This document narrows the candidate universe to only the systems the user actually had in operational *soak/shadow* monitoring, not all historical Gold parameter proposals.

**Authoritative complete nine-series census:** `rinko0211/tqqq-signal-lab/research/soak-cohort-forward-census-2026-10-11.json`, plus the companion human-readable `research/SOAK_COHORT_FORWARD_CENSUS_CLOSE_2026-10-11.md`.

## Exactly one Gold research strategy under the observed Phase C soak

| Field | Audited value |
|---|---|
| Strategy | `TQQQ-Gold50-Research-v0.1` |
| Version | `gold-overlay-shadow-0.1.0` |
| Formula | `TQQQ=VS13 target`; `GLD=(1-TQQQ)/2`; `CASH=(1-TQQQ)/2` |
| Observational proof | `phase-c/observations.jsonl`, `phase-c/status.json` |
| Successful distinct sessions | **10/10**, 2026-09-08 to 2026-09-21 |
| Total attempts | 61: 10 countable + 27 duplicate pass (not counted) + 24 blocked |
| Soak state | `COMPLETE_STOP_GATE` |
| Longer multi-month strategy Forward | **NOT RUNNING / NOT YET ELIGIBLE** |
| Brokerage | **USER MANUALLY PLACES ORDERS** — automatic order authority NONE |

Phase C is a finite live data-source/integrity soak, not a multi-quarter risk/return/turnover Forward experiment. Its completed ten-session sequence is preserved forever and **must never be reset, backdated or described as continuing**. The current TQQQ Daily+Phase5 ensemble in the separate repository has eight explicitly frozen Forward series (six strategy versions and two benchmarks); all had 2026-10-09 records when audited. The 2 old UPRO Track B versions are archive-only and not included in the observed soak cohort.

## Remaining Gold task

A **separate prospective long-horizon** observation using the **same frozen mapper** is necessary before this strategy can be ranked with the TQQQ six strategy candidates. Preserve `phase-c-tiingo-v1` and its `C10/10` history without mutation. A new observation track requires its own approved start, proof of valid GLD EOD acquisition, append-only ledger, sensible annual manual transaction count including the two TQQQ/GLD legs, and a common-sessions comparison method. A manual research deployment MUST NOT become automatic brokerage execution or silently rewrite old data.

No other GLD allocation or stop/weight grid has been preregistered here as an active soak candidate; none is included in this audit merely to reach a numerical candidate target.

## Scope constraints

This is a static evidence/inventory document only. No changes to `src/`, `phase-c/`, tests, workflows, secrets, existing TQQQ external data, or current Gold site. The user expressly rejected automatic trading: the correct final product automatically computes and displays signals but leaves all brokerage transactions to the user.
