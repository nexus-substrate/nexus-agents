---
'nexus-agents': patch
---

`nexus-agents vote --option …` now prints an `Options:` block in its terminal summary. Before this, the declared-option tally was written to the audit record but the summary showed only Approve/Reject counts and `Result:`, so a reader could not tell which option won without opening `.nexus-agents/governance/vote-records.jsonl`.

The block lists every declared option with its count (an option nobody chose prints `0`), a `Winner:` line, and a `Coverage:` line giving how many approvers named a declared option and how many were unattributed. The winner line says `none` with the reason when no voter named an option, when the top count is tied, or when the leading option fell short of the option bar. The counts are the option gate's own tally from the engine, not a second computation. A vote without `--option` prints no block.
