---
'nexus-agents': minor
---

`nexus-agents orchestrate` now feeds its routed runs back to the router and the outcome store (#6533). It used to route a task with `CompositeRouter`, run the chosen arm directly and discard the result, so the bandit, latency, difficulty and distiller learners got nothing from CLI runs.

- New `CompositeRouter.executeDecision(decision, task, runTask?)` runs a decision returned by `route()` and records the same feedback `executeTask` does. `executeTask` now delegates to it and behaves as before. `ICompositeRouter.executeDecision` is optional, so existing implementors stay valid.
- Each routed run appends a `TaskOutcome` with `routedBy: 'composite-router'`, the slot of the arm that ran as `cli`, that arm's own run time as `durationMs`, and a `failureCategory` on failure. It uses `model: 'orchestrate-cli'`. These rows count toward `doctor`'s "Routed outcomes (CompositeRouter)" line and are eligible to train distilled rules.
- No row is written when routing fails, on `--dry-run`, or for a pinned `--model` run, since the router chose no CLI in those cases. No row is written when the task category is not detected either: `category` is required, and defaulting it to `'exploration'` would record a category that was never measured. The router still receives in-process feedback for that run.
