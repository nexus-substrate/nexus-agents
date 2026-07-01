---
'nexus-agents': minor
---

Teach vote consumers to honor a `no_quorum` outcome instead of misreading it as a rejection (#4135, epic #4130).

`executeVoting` now stamps the response-layer `decision` (incl. `no_quorum`) onto its `ExtendedVotingResult`, computed once via the exported `resolveVoteDecision` that `buildResponse` reuses (DRY — the decision can't diverge). Consumers read `decision` (falling back to the engine outcome when absent):

- **iterative-consensus:** on `no_quorum`, re-runs the SAME plan (a missing voice, not a bad plan) bounded by a new `maxNoQuorumRetries` (default 2, counted separately from `maxIterations`); on exhaustion it terminates as a non-rejected failure rather than dropping into the refine loop.
- **agent-executor vote stage:** returns a distinct `kind:'no_quorum'` terminal signal instead of `{kind:'rejected', feedback}` fed into plan-revision.
- **vote CLI:** new `--on-no-quorum` flag (`fail` default → exit 1 for back-compat | `exit2` → distinct exit 2 | `retry` → re-run once, then fail); `formatVoteComment` labels `no_quorum` distinctly.
- **graph consensus gate:** `ConsensusVerdict.outcome` widened to `'approved' | 'rejected' | 'no_quorum'` (the voter-throw path stays fail-closed `rejected`).

Inert by default: under every default error policy `resolveVoteDecision` never yields `no_quorum` from a genuine tally, so these paths activate only when a caller opts into `absolute_quorum` (#4132) or an error-policy short-circuit voids the vote.
