---
'nexus-agents': patch
---

write an audit record for votes run from the CLI

`persistVoteRecord` had exactly one caller — the MCP `consensus_vote` tool — so
every decision made through `nexus-agents vote` was absent from the
tamper-evident chain. `verify_audit_chain` reported the chain intact across
those votes, and it was: contiguous sequence, no hash breaks. It simply did not
contain them, and there was no field in which it could say so.

Measured, not inferred: two live panels run at a terminal left no entry in any
`vote-records.jsonl` on the machine. They also got none of the per-option
instrumentation — no `optionTally`, no `optionCoverage`, no `proposalHash` —
so a multi-option CLI vote was invisible to the machinery that records which
option won.

The CLI now calls the same `recordAuthenticVote` the MCP path uses rather than
growing a second writer, and prints one line saying what reached the chain. A
write failure is stated rather than swallowed: the vote must not fail because
its record could not be written, but a decision that left no record must not
look like one that did. Simulated runs are still skipped, and are reported as
skipped rather than as a failure.

The recorded strategy is the one that was applied, not the CLI's display
`threshold` — the two can differ.
