---
'nexus-agents': minor
---

Outcomes the router produced are now tagged, and only those train distilled routing rules (#6521).

- `TaskOutcome` gains an optional `routedBy: 'composite-router'` field (type `OutcomeRoutedBy`). The dev-pipeline stages set it when `CompositeRouter.executeTask` chose the CLI. Failures are recorded too, classified with `failureCategory`, so an arm's routed success rate includes its failures. No other writer sets the field. Existing records remain valid.
- `CompositeRouter.executeTask` now names the arm it ran, on success (`CliResponse.routedCli`, `routedDurationMs`) and on failure (the same fields on `CliError`). `routedDurationMs` times the arm's own `execute` call. The routed arm is authoritative for the recorded `cli`: the model string no longer overrides it. Before this change a CLI subprocess arm (no `model` reported) left the pipeline with no CLI, so every routed outcome for it was dropped.
- Pipeline QA rows now record whether the review call succeeded. The verdict moves from `success` to the quality signal `qa-verdict:<verdict>`, so a rejected implementation no longer counts against the reviewer's CLI.
- `isDistillerEligible` now requires `routedBy: 'composite-router'`, a duration above 0 and a known CLI, and it excludes consensus. The earlier inference from `source: 'delegate'` plus `cliSource: 'executed'` is gone, because its only writer, the orchestrate tool, runs the server's configured adapter, not a CLI the router chose.
- `nexus-agents doctor` prints `Routed outcomes (CompositeRouter): N total, M in the last 7 days`.
