# Gold50 Prospective Equity / Drawdown Subledger — preregistered 2026-10-14

## Why DD was blank
Gold50 forward/ledger.jsonl contains **target allocations, dates and provenance only**. It contains no executed holdings or daily portfolio equity. Rendering a zero DD or a reconstructed Oct 12–13 equity curve would be ungrounded. Old observations remain frozen and unchanged.

## Separate, indicative valuation trial (v1)

- Start: **first valid completed NYSE session on or after 2026-10-14**. This instruction is registered **before Oct 14 NYSE opens**. The 2026-10-12 and 2026-10-13 research signals will **not** receive retroactive valuation entries.
- Input: previous valid Gold50 forward signal at **previous NYSE close**, followed by current session's independently verified **TQQQ and GLD open and close**. Both OHLC responses are fetched from Tiingo via existing GitHub Actions secret; current TQQQ close must agree within 50 bps of pinned immutable ops-state daily signal. A split, provider date mismatch, unsettled session or invalid price **fails closed**.
- Model: hypothetical **fractional model shares**, base index 100; open execution for the **previous day's** target, rebalances only when the frozen target changes. Previous holdings carry overnight gap exposure across contiguous observations. Fees on turnover: **3 bps commission + 5 bps slippage**. No fee on cash and no margin. This is **not a brokerage fill**.
- Record: append-only \`forward/performance-ledger.jsonl\` records only the derived equity index, holdings, peak, current DD, max DD, model legs, trading-cost accumulator, source hashes, continuity and model-only flags. It **never persists raw Tiingo OHLC**. \`forward/performance-status.json\` reports newest validated result or CHECK_DATA.
- **Gaps and restarts:** never synthesize missed days/returns. Noncontiguous valuation dates start a new **GAP_RESET epoch at index 100**; DD is **only within that epoch**, no cross-epoch composite performance.
- Source: this **does not change** Gold50 frozen mapper, prospective allocations, Phase C audit, signal status, TQQQ benchmark model, or Strategy Freeze.
- Governance: \`mode=SHADOW_RESEARCH\`, \`performanceCertification=INDICATIVE_NOT_COMPARABLE\`, \`brokerOrderAllowed=false\`; no provider-price records, brokerage integration, passwords, approval, automated orders, forex, tax, bid-ask microstructure or exact whole-share execution. TQQQ core and Gold50 model do not have matching valuation periods or methods. DO NOT rank them by headline return/DD until comparable methodology and common start validated.

## Operational acceptance gate
Required: tests of no retroactive Oct 12–13 valuation, proper previous-day execution, 8bp cost, overnight gap DD, unobserved-gap epochs, invalid OHLC/split rejection, source discrepancy rejection, no raw price persistence, idempotent daily retries and no trading authority. Existing Gold50 and TQQQ continuity must stay unchanged. The first real value may only become visible **after a completed and source-validated Oct 14 session or later** and must be labelled as a limited-period *indicative research* DD, not a certified live DD.
