---
'nexus-agents': patch
---

fix(governance): stop the audit chain recording a voided vote as approved

`outcomeToDecision` returned on `result.outcome === 'approved'` before it
consulted `errorVoided`, so the void logic could only ever convert a `rejected`
into a `no_quorum`. An `absolute_quorum` degradation stamps its reason on the
response and never on the result, so `errorVoided` was false, and the
hash-chained record persisted `approved` for a vote the tool reported as
`no_quorum`.

The record now takes the decision `resolveVoteDecision` already produced, rather
than deriving a second one from the outcome — the second derivation is what let
the two disagree. `resolvedDecision` is a required field, including its
`undefined` case, so the compiler names every call site instead of letting a new
one inherit the fallback silently.

Two adjacent misreports went with it. The fallback's `errorVoided` check moved
above the `approved` short-circuit, and a non-terminal outcome is no longer
recorded as a rejection: `ProposalStatus` also carries `timeout`, `pending`,
`voting` and `closed`, and the old everything-else-is-rejected default
attributed a verdict to voters who never gave one.
