---
'nexus-agents': patch
---

feat(eval): pr_review case-curation pipeline + pilot batch (#3847)

First increment of #3847: a curation pipeline that grows the `pr_review` eval set
from the org's OWN merged PRs + their real review outcomes as ground truth (not
public datasets, not synthetic injection), plus a validated pilot batch.

**Pipeline (two modules, the labeling logic unit-tested).**
`scripts/curate-pr-review-harvest.ts` is the thin gh-fetch I/O layer: it harvests
merged PRs via `gh`, and for each extracts OBJECTIVE signals — the changed source
files, the GitHub review decision, and (critically) whether a LATER `fix`/`revert`
PR referenced it AND touched the same source files (a confirmed post-merge
correction, the rubric Rule 5.3 "gold" signal). `scripts/curate-pr-review-labeling.ts`
is the PURE signal→label core (zero I/O, fully tested in
`scripts/curate-pr-review-labeling.test.ts`): it applies the labeling rubric
(`docs/research/pr-review-eval-labeling-rubric.md`, #3846) to PROPOSE a class +
severity per case.

**No invented labels.** A PR with no post-merge-fix signal is proposed `clean`
(Rule 3). A confirmed `fix`/`revert` in a correctness/integrity domain is proposed
`buggy` at the `medium` floor (never auto-escalated; Rule 5.1). An ambiguous
follow-up (heuristic refinement, no-behaviour-change hardening, or outside a
correctness domain) is proposed `borderline` with `needsAdjudication: true` —
flagged for a human, NEVER guessed into buggy/clean (Rule 4). Every proposal is
emitted with full provenance: the real source PR URL, the objective signals used,
and a confidence + justification.

**Pilot output (separate file, the validated v5 set untouched).** Running the
pipeline against `nexus-substrate/nexus-agents` produced a 10-case pilot in
`testing/datasets/pr-review-candidates-pilot.json` — 1 buggy / 5 clean / 4
borderline, 5 flagged for adjudication, every case citing a real merged PR. This
needs label-quality review before the eval set trusts it; scaling to n>=50 is a
follow-up under #3847.
