# Gold50 long-horizon prospective Forward — release charter (2026-10-11 JST)

## Purpose and user-authorized scope

Continue the **one frozen Gold50 candidate** previously validated for 10 distinct operational Phase C sessions. **The user alone manually enters any brokerage orders.** This continuation adds no real or paper brokerage APIs, order sending, order routing, broker credentials, or automatic asset rebalancing.

- Strategy: `TQQQ-Gold50-Research-v0.1` / `gold-overlay-shadow-0.1.0`.
- Fixed mapper, unchanged from Phase C: `TQQQ=w; GLD=(1-w)/2; CASH=(1-w)/2`, where `w=VS13-v1.0 target`.
- Prospective start: **2026-10-12 NYSE session**, first eligible U.S. equity trading day following the request on Sunday October 11. This is an explicit **new Forward starting point**, *not* a reconstruction of September 22–October 9.
- Phase C archive: `phase-c/status.json` remains `C10/10 COMPLETE_STOP_GATE`, last session 2026-09-21; `phase-c/observations.jsonl` immutable.
- Separate new records: `forward/ledger.jsonl`, `forward/status.json` and `site/forward.html` (read-only displayed status).
- The existing 8 TQQQ research/benchmark Forward series are **not changed**. This is the ninth prior-soak-observed series.

## Data governance and live capture

The **authoritative source** is now the upstream TQQQ project's public `ops-state` branch, not the stale post-separation `main` publication. Each capture first reads the GitHub REST `refs/heads/ops-state` and obtains a single commit SHA. TQQQ `signal.json` and `status.json` must then both be read from that **same immutable SHA**. This prevents inter-request branch drift. GitHub Git object/HTTPS checks do not themselves authenticate Nasdaq upstream feed provenance; this remains a research-only input.

GLD OHLC is retrieved from the **existing Tiingo EOD endpoint**, using the repository's existing `TIINGO_API_TOKEN` secret (never printed or persisted). Existing Phase C `buildShadowArtifact`, `sanitizeArtifact`, canonical replay and official-session/time checks are reused without changing mapper parameters. Source data must be current, same market date, completed NYSE session, and correctly post-close. Missing/mismatched/invalid data give `CHECK_DATA`, no trade signal and no ledger append.

### Daily schedule and persistence

A new **GitHub Actions research-only schedule**, UTC 03:37 / 09:37 / 15:37 Tuesday–Saturday, attempts to collect the preceding completed NYSE session. It is safe to retry. A session can be appended only once: exact same source bytes are idempotent; altered original bytes cause `ORIGINAL_SOURCE_REVISED` and halt; unexpected missing NYSE sessions give `MISSING_NYSE_SESSION_REQUIRES_REVIEW`, with **no synthetic fill or silent catch-up**. Stored research status may record an error but does not authorize execution.

The workflow runs `npm test` plus confirms Phase C archive still C10/10 before fetching live inputs. It writes ONLY `forward/ledger.jsonl` and `forward/status.json` and commits/pushes by the GitHub Actions bot. The runner is serialized with `cancel-in-progress:false`; a stale checkout cannot use force push, so GitHub safely rejects a race. GitHub workflow job errors remain visible even if the last valid research record is preserved. Only GitHub-authored versions are appended; no user-broker trade state is involved.

An observer must **not** backfill a gap by replacing failed evidence. If source outage causes a lost completed trading session, this v1 capture halts until separately reviewed remediation is made; **restart/rebase policy requires a new registered version** rather than revision of the earlier ledger.

## What a Forward row represents

Each row is a post-close research allocation observation: SHA-256 hashes of the same-commit TQQQ source files and licensed Tiingo response; version, NYSE date, source target, frozen Gold50 target weight vector, target action-day estimate and **estimated manual trade legs**. Raw Tiingo OHLC is never stored in the public repository.

**Important limitation:** The long-horizon series begins as a verified **signal-level Forward**, NOT a certified executable portfolio-return backtest. There is no self-certified P&L, Sharpe, Calmar, max drawdown, real fills or broker-order count in this release. Opening-price execution, transaction-cost propagation, whole-share sizing, GLD total-return method, and wealth-path normalization require separately preregistered accounting and licensing review. Do NOT falsely compare these signal-only observations against the TQQQ simulated capital curves as if returns were commensurate. The user's desired annual **~30–40 manual order legs maximum** is tracked as a future capacity check; event estimates are not actual orders.

Gold C10/10 is a completed **operational-soak gate**. It does not shorten this new Forward strategy eligibility window, establish regime robustness or authorize manual trade recommendations without enough data.

## CI and manual readiness

`Gold50 Prospective Forward Guard` is pull-request CI: read-only permission, Node 22, all mapper/Phase C and long-forward tests, Phase C archive invariants and initial zero-record/no-backfill checks. The scheduled runner is main-only and **not** run on pull requests with credentials.

After the protected review and clean CI, merge the tested exact PR head; verify GitHub Actions first `Gold50 Prospective Forward` post-merge run (before Oct 12 is expected to return `WAIT`), `forward/status.json` and Pages `forward.html`. Post-merge successful creation of a session row cannot be claimed until one valid **10/12 or later** session has actually completed and both providers have supplied it.

## Release constraints

- No changes to Phase C immutable history, Tiingo secret, frozen mapping, TQQQ project, prior Forward ledgers or lifecycle rules.
- No broker orders or API, auto rebalance, automatic strategy promotion or Production-mode change.
- No historical Gold50 simulated performance or returns claimed from a signal-only record.
- No assumption that an unchanged NYSE scheduled holiday page attests to all emergency closures.
