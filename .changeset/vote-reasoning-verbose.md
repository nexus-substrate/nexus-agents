---
'nexus-agents': patch
---

feat(cli): show voter reasoning under `nexus-agents vote --verbose` (#5339)

A vote that blocks a decision recorded **that** it blocked, not **why**. The CLI
printed the tally and a per-role verification hash; `grep -c reasoning` over the
complete output of a 7-voter run returned 0.

The reasoning was there the whole time. `generateVoteHash` hashes
`vote.reasoning` to bind the record to the argument — the CLI held the argument
in memory and never displayed it. So the grounds of a blocking dissent were
unrecoverable from any artifact without re-running the entire panel through a
different entry point and hoping for the same objection.

`--verbose` now renders each voter's grounds beneath its row, dimmed and
indented, clipped at 600 characters. It stays verbose-only because the default
panel is a scannable tally and seven multi-paragraph rationales inline would
bury it.

An errored voter renders as before. The error arm returns before the reasoning
is reached, so the placeholder reasoning on an errored voter's vote stub is
never displayed as though the voter had reasoned — a voter that produced no
judgment must not appear to have produced one.

This is the display half of #5339. The persisted record at
`governance/vote-records.jsonl` still stores `{role, decision, confidence}` per
voter; changing that schema is a `src/audit/` change and needs owner
ratification, so it stays open.
