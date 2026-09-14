---
'nexus-agents': patch
---

feat(cli): `remediation-review readiness` prints a soak-store staleness alarm (#4279)

The enforce-readiness verdict now carries a `Soak store:` line (and a `soakStore`
object under `--format json`): `UNMEASURED` when the operator soak store is empty,
`ALARM` when it holds at most one record or has had no new record for 14 days
(every cause named), `fresh` otherwise. The operator store sat at one record for
five weeks behind a daily green CI job that fed a different, cache-only store;
this is the surface that would have shown it. The signal is informational and
never changes `ready`.

Two record corrections travel with it. `requiresDryRun` (p0-only) gates IMPLEMENT
and never gated soundness review — a p2 record produced by the audit cycle is
judgeable by `remediation-review mark` and counts toward `judged-coverage`; this
is now pinned by an end-to-end test rather than changed. And the scheduled
`remediation-audit-soak.yml` workflow is relabelled "Remediation Audit Smoke (no
readiness evidence)": it exercises the audit path daily but produces no readiness
evidence for #3769 (the operator store is the evidence path, panel Option B).
