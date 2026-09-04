---
'nexus-agents': patch
---

fix(mcp): the sanitization disclosure now reaches the voter proposal on the MCP path (#5385)

`buildPrReviewProposal` annotates the proposal when it strips HTML comments, so
a panel is not asked whether a silently shortened body is "correct and
complete". On the MCP path that annotation **never fired**.

The middleware sanitizes before dispatch (`runPreChecks`), so the builder
re-sanitized already-clean text and counted 0. The inversion is what makes it
matter: the MCP path is the one that **persists a governance record**, while the
CI and script paths — where the annotation does fire — persist nothing. The
removal was in the middleware log, so it was not unrecorded; it was absent from
the artifact a later reviewer actually reads.

`HandlerContext` now carries a `sanitization: { wasModified, commentsRemoved }`.
Counts only, never bytes: handing raw or stripped content back to a handler would
partially defeat sanitize-before-dispatch, which is the property the middleware
exists to guarantee. The field is **required rather than optional** on purpose —
an optional one invites `ctx.sanitization?.commentsRemoved ?? 0`, which renders
"the middleware did not tell me" as "nothing was removed", a default reported as
a measurement. Making it required also made the compiler name all five existing
call sites instead of leaving them to fail at runtime.

`buildPrReviewProposal` takes `removedBeforeThisCall` and **sums** both stages,
which is correct on every path: the MCP path strips upstream (this call counts
0), the CI and script paths strip here (nothing before).

## Chosen by panel, and the dissent

`consensus_vote`, `higher_order`, 7 live voters: **6/6 among approvers for
binding the pre-sanitization hash and disclosing the difference**. Four voters
independently supplied the refinement that made it safe — the middleware
computes any digest itself and exposes only digests and counts, so the option
cannot become "expose raw args" by the back door.

The contrarian proposed an option that was not on the ballot: make the _gate_
sanitize the canonical git diff before hashing, so both sides hash the same
bytes and the agents sign exactly what they read. Its non-repudiation argument
is real. It was not taken because it makes the gate's verdict depend on the
producer's sanitizer build, so a sanitizer change would retroactively invalidate
every historical record. Recorded on #5385 rather than buried, since it is the
strongest counter-argument.

## Scope: symptom 1 only

This ships the disclosure half. The **hash** half — `reviewedDiffHash` binding
sanitized bytes while `scripts/check-governor-review.ts` recomputes raw ones —
touches `src/audit/` and its tamper-evident chain, which is the hard
never-auto-merge gate. It stays on #5385 for owner ratification.

That half is **live today**, not latent as the issue originally said: measured on
this repo's own governance-regeneration diff shape, the gate hashes
`62619489…` and the producer `261cefa1…`. It is masked only because the gate
warns rather than blocks, and #3831's warn→enforce flip is blocked on it.

## Verification

Three mutations, run separately:

| mutation                                            | caught by              |
| --------------------------------------------------- | ---------------------- |
| builder ignores the middleware's count              | 2 unit tests           |
| middleware always reports zero removals             | 1 unit test            |
| **handler passes 0 instead of the disclosed count** | **only the seam test** |

That third row is why `pr-review-disclosure.test.ts` exists. Mutating both
handler call sites to pass `0` left all **158** unit tests green — the tests
either side of the wiring pass while the wiring is broken, which is the defect
itself in miniature.

`buildPrReviewProposal` moved to `pr-review-proposal.ts` — `pr-review-tool.ts`
was at 398 of its 400-line budget and the threading pushed it over. Pure move;
the symbol is re-exported so both barrels, the published `exports/mcp.ts` and
the two consuming scripts import it unchanged. The cost rollup in
`executePrReviewBody` (which was at exactly its 50-line cap) came out into
`rollUpDecisionCost`.

`src/mcp`: 4368 tests passing.
