---
'nexus-agents': patch
---

make `vote --option` actually reach the engine

The flag parsed, validated and appeared in `parseCliArgs` output, and
`handleVoteCommand` then rebuilt `VoteCommandOptions` field by field without
naming it — so every multi-option vote from the CLI still recorded
`optionTally: null`, exactly as before the flag existed.

Caught by running it: a vote declaring three alternatives persisted a null
tally, and passing a single `--option` did not trip the engine's `min(2)`
validation, which proved the field never reached `ConsensusVoteInput`.
