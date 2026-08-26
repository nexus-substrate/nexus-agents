---
'nexus-agents': patch
---

test(pipeline): pin whether the delegate policy gate can actually deny

The V2 delegate pipeline's only policy gate cannot deny anything, for any input,
in any mode: `trustTierRule` requires `stageType === 'execute'`, `ENTRY_GATE`
guards a `route` stage, and no production stage is execute-typed (#4657).

Existing coverage checks the pieces — that the mechanism halts on an injected
always-denying engine, that the guarded stage is route-typed, that no stage is
execute-typed. None of it runs the _real_ rule at the _real_ gate. This adds
that: the actual `trustTierRule`, the actual `ENTRY_GATE`, an explicitly
tier-4 task, block mode — and pins that nothing is denied.

Pinning a negative is the point. Widening the rule to cover `route`, or
retyping the route stage to `execute` — the two remedies on the #4657 ballot —
each make this test fail, so whichever the project chooses has to be chosen
deliberately rather than drifting in.

No behaviour change. The #4657 remedy remains undecided: the consensus panel
approved 6 of 7 but split 3/2/1 across the options, so no option cleared the
supermajority bar. A test proving deny-capability was the one thing every voter
agreed on regardless of which remedy they preferred.
