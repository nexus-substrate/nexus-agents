---
'nexus-agents': patch
---

fix(governance): attribute expert outcomes to the real executing CLI (#3624)

Completes the #3624 attribution fix (the de-noising half shipped in #3628). Expert
execution outcomes now derive their `cli` from the model the adapter ACTUALLY
executed (via the model registry), instead of guessing it from task content:

- `TaskOutcome.cli` widened to `CliName | 'unknown'` (new `OutcomeCliSchema`) so
  unresolvable outcomes carry an explicit `'unknown'` rather than a fabricated
  real CLI. Minimal blast radius (2 schema lines).
- `recordExpertOutcome` resolves cli from the executed model; vendor/family are
  auto-resolved from `model` by `OutcomeStore.enrich` (#2548). Placeholder/
  unresolvable models record `cli='unknown'/model='unknown'`.
- `execute_expert` threads the executed model (`result.metadata.model`) through
  to the recorder, so success outcomes are attributed to ground truth.

Together with #3628, expert outcomes are now correctly attributed instead of
piling onto `DEFAULT_CLI='claude'` — removing the root cause of the misleading
"claude security_review" routing signal (#3620).
