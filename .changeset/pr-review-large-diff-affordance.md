---
'nexus-agents': minor
---

`pr_review` large-diff affordance (#4140, epic #4130). A PR diff over the 50KB voter
PANEL budget is no longer hard-failed at the schema or lossily hand-truncated
mid-hunk: it is now accepted (new `MAX_DIFF_INPUT_LENGTH = 2_000_000` DoS bound) and
reviewed on a REAL, security-prioritized subset of WHOLE files. A new pure module
(`pr-review-diff-budget.ts`) splits the diff on `diff --git` file boundaries
(fragment-safe: robust to rename-only / binary / no-newline entries), orders
sensitive-path files first (`auth`, `crypto`, `secret`, `credential`, `security`,
`exec`, `spawn`, `password`, `token`, `.env`, `permission`, `sql` — a documented
substring list, not scored weights), and greedily packs whole files into the budget;
a single over-budget file is included truncated-with-marker AND listed as
partially-seen.

The review is HONESTLY labeled: a partial-review NOTE is prepended to the voter
proposal, and machine-readable `coverage` (`{ reviewedFiles, totalFiles, droppedFiles,
partial, strategy: 'budget' }`) rides the response and is stamped into the audit
record summary. C1 (load-bearing): a partial review is BARRED from a
verified-approve — a would-be `{ approve, verified:true }` degrades to the #4132
`{ abstain, verified:false, reason: 'no_quorum: partial diff …' }` shape, while a
`request_changes` blocker from a reviewed file still wins. A partial review can
BLOCK but never verified-APPROVE. Diffs within budget are byte-identical to before;
`reviewedDiffHash` still binds the canonical first 50KB of `prDiff` (unchanged).
Options C (#4151), B (#4152), and a scored ranker are deferred.
