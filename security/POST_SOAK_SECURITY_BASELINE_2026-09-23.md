# Post-Soak Security Baseline — 2026-09-23

## Frozen evidence boundary

- Gold50 repository: `rinko0211/gold50-shadow-monitor`
- Verified pre-hardening parent commit: `5eb76b835e211a8c5aeabe6a596914a778b83422`
- Phase C: `C10/10`, `COMPLETE_STOP_GATE`
- Strategy: `TQQQ-Gold50-Research-v0.1`
- Mapper: `TQQQ = VS13 target; GLD = CASH = (1-target)/2`
- Authority: `NONE_SHADOW_ONLY`; `brokerOrderAllowed=false`

## Rate-regime audit

The isolated branch `audit/rate-regime-2026-09-23` replayed Gold50 using the approved Tiingo EOD GLD source and pinned TQQQ baseline `fa77469d85ac7f37b74500e15afc6793eca6e432`.

The audit persists only aggregate metrics and input hashes; raw Tiingo OHLC is not persisted.

## P0 hardening scope

This branch may change workflow security controls and security tests only. It must not modify Phase C evidence, the frozen mapper, provider policy, TQQQ source authority, or broker/Production authority.

P0 controls:
- immutable SHA pinning for active GitHub Actions;
- regression tests preventing mutable Action references from returning.

Branch protection, repository visibility decisions and any future broker execution service remain separate gated changes.
