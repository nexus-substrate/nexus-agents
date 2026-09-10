---
'nexus-agents': minor
---

A consensus voter seat that could not read the artifact is now recorded as `unverifiable` instead of an ordinary abstention, is retried once, and the vote record carries the model each seat ran on.

`AgentVoteResult.source` gains the value `'unverifiable'`. A seat is classified that way when the CLI transport captured a sandbox or shell failure on stderr during the call (the structured signal, now exposed as `CliResponse.stderr` and `CompletionResponse.cliStderr`), or, as a fallback, when the seat's own reasoning says it could not read the artifact. Whatever decision such a seat returned is discarded and logged; its recorded decision is always `abstain`, it never credits a declared option, and the existing per-role retry relaunches it exactly once. The `consensus_vote` result reports these seats in `voteCounts.unverifiable` (always present, `0` when there are none) and flags them per voter; under `errorPolicy: 'absolute_quorum'` an unverifiable seat voids the quorum exactly as an errored seat does. The voter prompts now instruct a seat that cannot read the artifact to abstain and say so rather than vote on the description.

The vote-record schema moves to `1.8`: each voter entry may carry `model` (the registry model id the seat ran on) and `unverifiable: true`. Both are appended present-only, so every existing record re-hashes byte-identically and still verifies; a record carries version `1.8` only when at least one entry has either field.
