---
title: pr_review eval dataset curation pipeline
description: How the pr_review eval dataset grows — the curate-pr-review-dataset.ts pipeline, the sourcing procedure for real labeled cases, provenance and rubric-version stamping, and an honest assessment of what reaching n≥50 requires.
tier: 2
keywords: [pr-review, eval, dataset, curation, provenance, autonomous-sdlc]
---

# pr_review eval dataset curation pipeline

**Issue:** #3847 (part of epic #3845). Depends on #3846 (the
[labeling rubric](./pr-review-eval-labeling-rubric.md)).
**Pipeline:** `scripts/curate-pr-review-dataset.ts`
**Dataset:** `testing/datasets/pr-review-sample.json`

## Goal

Grow the eval set from n=10 toward n≥50 (target 100) **without fabricating
cases**. A fabricated PR/bug corrupts the eval — it teaches us nothing about
whether the panel catches _real_ bugs. So the pipeline is built to make adding a
_genuinely-sourced_ case a one-step, provenance-stamped operation, and the doc is
explicit about what cannot be automated.

## The pipeline (`curate-pr-review-dataset.ts`)

One reproducible entry point. Subcommands:

- `validate` — load the dataset, validate every entry against the rubric schema,
  and check the dataset `rubricVersion` matches the rubric doc header. This is
  what the Vitest test and any CI gate call. Exit non-zero on any violation.
- `stats` — print n and the class balance (buggy / clean / borderline) plus the
  provenance-source breakdown (historical / synthetic / historical-clean). Use
  this to track progress toward n≥50 and to document class balance per #3847's
  acceptance criteria.
- `add <kind>` — emit a correctly-stamped skeleton entry (`rubricVersion`,
  pre-filled `adjudication`/`provenance` shape) to stdout for a new case, so
  "adding case N+1" is a documented one-step that cannot forget the stamp.
  `<kind>` is `buggy | clean | borderline | synthetic-buggy | synthetic-clean`.
  The author fills the diff/bug fields and the rationale (`TODO` placeholders);
  the skeleton guarantees the shape is rubric-valid.

The schema module (`scripts/curate-pr-review-dataset-schema.ts`, exporting
`parseDataset`) is the single source of truth for the dataset shape — used by
`validate`, `add`, and the test — so the dataset cannot drift from what the
rubric documents. It is a hand-rolled validator (not Zod) because `zod` resolves
from the package, not the repo root where the script runs.

## Sourcing procedure (how a real case is born)

Cases come from three honest sources, in priority order:

1. **Historical PRs with a real post-merge bug fix (gold).** Find a merged PR
   whose diff contained a defect that was fixed by a _later_ PR/commit. The later
   fix is the ground-truth label — the bug is real and was confirmed by a human
   shipping a fix. Procedure:
   - `gh pr list --state merged --search "fix"` / mine the issue tracker for
     "fixes #N" where #N's regression was introduced by an earlier merged PR.
   - Record `number` (the buggy PR), the `location` (file:line in that PR's
     diff), `severity` (rubric Rule 1), and `provenance.fixReference` (the fixing
     PR/commit). Adjudicate per rubric Rule 5.
   - #2235 is the worked example: shipped a wrong env-var name, fixed in #2255.
2. **Synthetic diff-readable bugs (generalize v5's 5).** Hand-crafted diffs with a
   single planted, statable defect at a known `file:line` (ReDoS, off-by-one,
   missing await, null deref, resource leak …). These are honestly labeled
   `provenance.source: "synthetic"` and never presented as real. They test
   diff-reading capability, not real-world prevalence. Use `customDiff`.
3. **Verified-clean PRs (honest proportion).** Merged PRs that shipped with no
   post-merge fix and no defensible medium+ objection from the diff (rubric Rule
   3). These are the strict-FP denominator — without enough of them an FP rate is
   not measurable.

**Class balance is documented, not assumed.** `curate-pr-review-dataset.ts stats`
prints the buggy/clean/borderline split. The target proportion is roughly
50% buggy / 35% clean / 15% borderline so both recall (needs buggy) and strict
precision (needs clean) are measurable.

## Mining #3675 (alibaba/open-code-review)

Issue #3847 calls for mining #3675's open-code-review evaluation for transferable
cases/method. That eval set is an external corpus: its cases must be
re-adjudicated under _this_ rubric before import (their severity/location
conventions differ), and license/provenance must be recorded
(`provenance.source: "external:open-code-review"`, original-ref retained). This
is a sourcing input, not an automated import — see the blocker below.

## Honest assessment: reaching n≥50 autonomously

**Current n = 10** (7 buggy, 2 clean, 1 borderline after the #3846
re-adjudication). The pipeline, schema, and stamping are in place. The remaining
40 cases to n≥50 **cannot be generated autonomously without corrupting the
eval**, for concrete reasons:

- **Real historical/clean cases require live GitHub history mining + human
  judgment.** Identifying a merged PR + its later regression fix, then confirming
  the defect was in-diff, needs `gh` access to the full repo history and a
  reviewer to adjudicate severity/reachability (rubric Rule 5). It is exactly the
  kind of label that, if guessed, poisons the metric.
- **Synthetic cases could be mass-produced, but they must not dominate.** If we
  padded to 50 with synthetics we would measure diff-reading on toy code, not the
  real-world bug-catch claim the epic is about. Honest proportion (source 3 above)
  caps how many synthetics belong in the set.
- **The #3675 corpus needs license/provenance review + per-case
  re-adjudication** before any entry is admissible.

Therefore this iteration delivers the **framework** and adds **no fabricated
entries**. The genuinely-verifiable case already present (#2235, sourced from a
real post-merge fix) is retained and re-stamped; the four other synthetics and
two historical/clean entries are retained as-is.

### What n≥50 needs (the explicit blocker)

A real PR-sourcing effort, which is human/live-data-bound:

1. A pass over `nexus-substrate/nexus-agents` merged-PR history to find ~25
   buggy PRs with post-merge fixes (gold cases), each adjudicated per rubric.
2. ~15 verified-clean merged PRs (no post-merge fix, no medium+ objection).
3. License + provenance review of the #3675 corpus, then per-case
   re-adjudication of any transferable cases.
4. Optionally a bounded number of additional synthetics (≤ the honest-proportion
   cap) for defect types not represented in the historical set.

Each of (1)–(4) is a `curate-pr-review-dataset.ts add` invocation followed by
filling real, verifiable fields and re-running `validate` + `stats`. None of it
should be auto-generated. This effort is tracked under #3847; this PR scaffolds
it and does not close it.
