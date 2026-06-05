---
'nexus-agents': minor
---

feat(routing): resolve difficulty tier to a concrete model at route time (#3394)

`CompositeRouter.route()` can now return a concrete `model` alongside `cliName`,
chosen from the in-tree registry by a tier-appropriate quality dimension
(`powerful`→reasoning, `balanced`→codeGeneration, `fast`→speed). Opt-in behind
`NEXUS_ROUTE_MODEL_SELECTION=true` (default OFF). Pure, deterministic, and
synchronous — no probe on the hot path. Consumers (`orchestrate`,
`delegate_to_model`) prefer `decision.model` and fall back to the CLI default
when absent or the flag is off. Builds on the live-discovery enumeration from
epic #3403.
