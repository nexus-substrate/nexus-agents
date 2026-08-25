---
'nexus-agents': minor
---

fix(pipeline): a failed planner no longer looks like a successful one

`agent-executor.ts` returned `r.text || prompt` from the plan stage, so when the
model produced nothing the stage handed back **the prompt as the plan**. The
vote then ran against the input text, and — outside a dry run — decompose would
have too. `runExpert` already returns `{ success: false, text: '' }`, so the
failure was known one line earlier and discarded in favour of a fallback that
looked like output.

Found by running the same dry run twice: one planned well, one's planner
returned empty five times, and both produced identical result envelopes
(`completed: false, securityPassed: false, voteIterations: 1, tasks: []`).

- The plan stage returns the empty string on failure instead of the prompt.
- `planVoteLoop` stops before voting on an empty plan — a panel convened on no
  proposal wastes seven voters and yields a verdict about nothing.
- `DevPipelineResult.planStatus?: 'empty'` says why there is no plan.
- `DevPipelineResult.securityRan?: boolean` separates "the gate rejected this"
  from "the gate never ran". A dry run stops after plan+vote by design, so its
  `securityPassed: false` was reporting absence as a verdict.

Both new fields are additive and optional. Resolves #4772.

Also fixes a defect in the #4749 API-surface gate found while doing this:
TypeScript's type printer does not guarantee member order, so adding these two
fields reordered a zod enum in an untouched module and produced a spurious diff.
A gate that cries wolf on unrelated code teaches people to regenerate the
snapshot without reading it. Printed types are now canonically sorted;
determinism and real-change detection both re-verified.
