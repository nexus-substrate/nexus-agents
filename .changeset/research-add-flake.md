---
'nexus-agents': patch
---

test(mcp): stop research_add flaking the standalone-tools schema check (#5288)

`mcp-standalone-tools.test.ts` calls `research_add` with a real arXiv id, and
`addResearchPaper` fetches arxiv.org — `dryRun` suppresses the registry *write*,
not the fetch. So the tool emits structured content when arxiv.org answers and a
`toolStructuredError` envelope with **none** when it does not, landing it in the
suite's `notExercised` bucket and failing the strict comparison. CI hits the
second case often enough to fail on PRs touching nothing near it.

This is not a new defect class — the file already carves out `research_synthesize`
for the same reason with registry state in place of the network, and says so:

> Data-dependent tools may legitimately land in either bucket; everything else
> must match the pinned list exactly.

`research_add` joins `DATA_DEPENDENT_STRUCTURED`, with a comment naming the
network as the varying input.

**The exemption removes coverage, so it is replaced, not simply dropped.**
`research-add.test.ts` gains a deterministic schema-parity test with no network
at all — the declared `outputSchema` key set must equal the one
`handleResearchAdd` returns — following the same instrument
`research-synthesize.test.ts` uses. Mutation-verified in both directions:
declaring a key the handler never returns fails, and dropping one it does return
fails.
