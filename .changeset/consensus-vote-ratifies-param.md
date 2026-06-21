---
'nexus-agents': minor
---

Add `ratifies` param to the consensus_vote MCP tool — the authentic-record authoring last-mile (#4004)

`consensus_vote` now accepts an optional `ratifies` argument: the loop/strategy subject an authority-ladder ratification vote authorizes. It is threaded into the persisted authentic vote record's self-hash (`ratifies` field, #3927 item 1), so a real `higher_order` ratification vote cast with `ratifies=<subject>` lands a tamper-evident record the promotion gate (`check-authority-tier-drift.ts`) can resolve a `ratificationVoteRef` against and verify (`ratifies === transition.subject`, decision=approved, strategy=higher_order). Completes the authoring path so the first real authority-tier promotion can be ratified end-to-end. Omitted on ordinary votes (no behaviour change). Tool reference + repo index regenerated.
