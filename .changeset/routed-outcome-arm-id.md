---
'nexus-agents': patch
---

Routed outcome rows now record the arm that ran, not its vendor slot (#6552). A task the router sent to the Anthropic API arm was written to the outcome store as `cli: 'claude'`, so the next process's LinUCB warm start credited the claude CLI arm and the `api:anthropic` arm started cold. The claude CLI arm's quality reward also mixed API runs into its success rate.

- `CliResponse`, `CliError` and `ExpertBridgeResult` gain an optional `routedArm` (a `RoutingArmId`, such as `api:anthropic` or `claude`), set by `CompositeRouter` next to the existing `routedCli`. `routedCli` is unchanged and remains the display slot.
- Rows written by the dev-pipeline stages and by `nexus-agents orchestrate` store `routedArm` as `cli`. A CLI arm is still recorded under its own name (`claude`, `codex`, ...).
- The router's quality reward reads the success rate of the arm that ran. An API arm with no history of its own falls back to its display slot's rate, so a new API arm is not rewarded below its CLI sibling for the same success.
- `weather_report` swarm health now scores routing accuracy and regret over API arms as well as CLI names. Before, an API-arm row could never count as accurate, and a category mixing API and CLI rows could report negative regret. A category made only of API-arm rows is now analysed rather than skipped.
- API-arm rows do not train distilled routing rules, as before: the rules file accepts CLI names only. The difference is that API runs no longer reach the rules under the `claude` label. Per-CLI tables in `weather_report`, `doctor --deep` and adaptive timeouts also drop API runs from the CLI rows that used to include them. Rows written before this change keep their slot label.
