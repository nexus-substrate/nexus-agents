---
'nexus-agents': patch
---

fix(mcp): strip HTML comments from untrusted input instead of refusing the call (#5258)

`pr_review` refused to review any PR whose body still carried GitHub's default
template. The `hidden_instruction` detector matched `/execute|delete|merge|apply/i`
inside `<!-- ... -->`, and the template GitHub itself ships says _"Please delete
options that are not relevant"_. With `securityTier: 'external'` (added in #5251),
a detection is a hard `permission` refusal — no flag, no degraded review, no
override. The only remedy was editing the PR body.

Two prior attempts tried to make the classifier precise (#5262, #5270). Both
failed: containment did not help, because the trigger sits inside a single
comment, and every regex form backtracked catastrophically — cubic, so a body at
GitHub's 65,536-character cap wedged the event loop for minutes.

A supermajority panel (audit #144, 5 of 6 approve; all 5 approvers selected this
option) chose to **strip** comments rather than judge them. The vector is an
asymmetry, not a vocabulary: a comment is invisible in rendered markdown, so a
human reviewer never sees it while a model reading the raw body does. Removing
the comment removes the asymmetry outright, is strictly stronger than any trigger
list, and cannot false-positive into a refusal because it produces no detection.

The `hidden_instruction` detector is therefore **deleted**, not narrowed. Applied
at every tier, with no exemption for fenced code blocks — exempting fences would
hand an attacker a one-line bypass, so the dissenting voter's objection (a
markdown PR legitimately showing comment syntax) is an accepted cost rather than
a hole.

**Sanitization also moved to where the data is, not where one entry point is.**
`securityTier` only ever guarded the MCP path, because the middleware is
constructed inside `registerPrReviewTool`. Three other callers reached the five
voters with no sanitizer, no tag stripping, no size limit and no audit log, each
importing the builder straight from `dist/index.js`: `.github/workflows/pr-review.yml`,
`scripts/pr-review-local.ts` (the documented default path) and
`scripts/pr-review-eval-run.ts`. `buildPrReviewProposal` is the one chokepoint all
four share, so it now sanitizes its own untrusted fields. The tier check still runs
earlier on the MCP path; this is the floor beneath it.

**The removal is reported rather than silent**, in two places. `sanitizeToolInput`
returns a `commentsRemoved` count and `logSanitizationResult` logs it separately
from tag stripping — it is routine, not necessarily an attack. And the proposal
itself carries a note when content was removed, because the CI and script paths
have no secure-handler log, and a voter asked to approve only if the diff is
"correct and complete" would otherwise judge a silently shortened body as whole.

The tests that pinned the old behaviour were renegotiated rather than quietly
contradicted, and the benign population is now the bar: GitHub's default template
and this repo's own `GENERATED:FROM_AGENTS` markers must survive with their prose
intact. The seam test gained the missing half — every previous assertion checked
that hostile input is _refused_, so a detector that refused everything would have
passed the whole suite.

Mutation-tested in four independent directions: no-op stripping fails 13 tests,
discarding the count fails 10, reinstating the old detector fails the
default-template seam test, and bypassing the builder's sanitize fails 4.
