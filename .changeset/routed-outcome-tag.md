---
'nexus-agents': minor
---

Outcomes the router produced are now tagged, and only those train distilled routing rules (#6521).

- `TaskOutcome` gains an optional `routedBy: 'composite-router'` field (type `OutcomeRoutedBy`). The dev-pipeline stages set it when `CompositeRouter.executeTask` chose the CLI. No other writer sets it: orchestrate, execute_expert, consensus voters, graph workflows, warm-up priors and e2e-eval runs stay untagged. Existing records are still valid.
- `CliResponse` gains an optional `routedCli`, set only by `CompositeRouter.executeTask`, which names the CLI slot of the arm that ran. The CLI subprocess adapters report no `model`, so before this change the pipeline had no CLI to record and dropped every routed outcome for a CLI arm. The pipeline now falls back to `routedCli`.
- `isDistillerEligible` now requires `routedBy: 'composite-router'`, a duration above 0 and a known CLI. It excludes consensus. The earlier inference from `source: 'delegate'` plus `cliSource: 'executed'` is gone: the only writer of `cliSource: 'executed'` is the orchestrate tool, which runs the server's configured adapter, not a CLI the router chose.
- `nexus-agents doctor` prints `Routed outcomes (CompositeRouter): N total, M in the last 7 days`, the routing loop's input rate.
