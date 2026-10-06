---
'nexus-agents': major
---

Remove the dead pipeline conditional approval path for 10.0: the `conditional_go`
variant of `VoteResult`, the `createVoteResult` helper, `PipelineTask.conditions`
and `PipelineTask.caveats`, and their conditional checkpoint fields. The variant
never had a production producer under any configuration; `createVoteResult` was
called only by tests. Production pipeline votes continue to return `approved`,
`rejected`, or `no_quorum`.

Consumers should remove `conditional_go` switch cases and task conditions/caveats
accesses. Replace calls to the removed helper with the appropriate vote literal:

```diff
-const vote = createVoteResult(true, '', approvalPercentage);
+const vote: VoteResult = { kind: 'approved', approvalPercentage };
```

Live per-voter conditions are unaffected: `VoteSchema.conditions`, the conditions
field in the voter prompt, and voter-response parsing remain available. Recording
these voter conditions is a separate change tracked by #7134.

Existing 9.x JSONL checkpoints still load and resume. The reader ignores retired
conditional metadata (including `voteConditions`, `voteCaveats`, and conditional
state); new vote checkpoints no longer write conditional metadata. No checkpoint
migration is required.
