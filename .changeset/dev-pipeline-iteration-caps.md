---
'nexus-agents': minor
---

make run_dev_pipeline's iteration caps actually do something

`maxVoteIterations` and `maxQaIterations` have been advertised by the MCP tool
since it shipped — bounds-checked `min(1).max(5)`, defaulted to 3, and
`.describe()`d into the generated tool reference — and neither was ever read
off the parsed input. A caller who set either got a validation error for `6`
and silence for `5`, both meaning the same thing.

The behaviour they name already existed as hardcoded `MAX_VOTE_ITERATIONS` and
`MAX_QA_ITERATIONS` constants, both `3`, matching the schema defaults exactly —
so these were knobs over real loops that were simply never connected. They now
resolve through `DevPipelineOptions`, falling back to the constants when
unset, so an unconfigured run behaves exactly as before.

Found in a vestigial-code sweep (#4939) among a cluster of declared-but-unread
configuration.
