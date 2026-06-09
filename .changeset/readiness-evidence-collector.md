---
'nexus-agents': minor
---

Wire the enforce-decision-gate readiness evidence chain (#3765, #3764 — part of #3653/#3540).

- #3765: durable soundness-review surface — a `JsonlStore`-backed review-record store
  (secret-scrubbed `note`), a `summarizeRemediationReviews` aggregate, and a new
  `nexus-agents remediation-review` CLI command (`list` pending soak selections,
  `mark <soakRef> --evaluator <name> --sound|--unsound`, `sign-off --owner <name>`).
- #3764: `buildEnforceReadinessEvidence` collector that builds `EnforceReadinessEvidence`
  from the durable soak (#3762) + review summaries, now wired as the `readiness` provider
  in `buildAutoRemediationDeps` — replacing the hardcoded `NOT_READY`. Fail-closed:
  missing/zero data keeps enforce blocked; audit mode never consults readiness.
