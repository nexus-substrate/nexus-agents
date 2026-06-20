---
title: pr_review eval candidate-mining curation pipeline
description: How merged-PR history is mined into CANDIDATE pr_review eval cases for owner adjudication — the weak-label triage heuristic, the no-fabrication guarantee, idempotent dedup, and the mine -> adjudicate -> promote flow toward n>=50.
tier: 2
keywords: [pr-review, eval, dataset, curation, candidate-mining, weak-label, autonomous-sdlc]
---

# pr_review eval candidate-mining curation pipeline

**Issue:** #3847 (part of epic #3845). Depends on #3846 (the
[labeling rubric](./pr-review-eval-labeling-rubric.md)).
**Miner:** `scripts/mine-pr-review-candidates.ts` (npm: `eval:mine-candidates`)
**Candidates file:** `testing/datasets/pr-review-candidates.json`
**Curated dataset:** `testing/datasets/pr-review-sample.json`

This complements the dataset-validation/stamping pipeline
([pr-review-dataset-curation.md](./pr-review-dataset-curation.md),
`scripts/curate-pr-review-dataset.ts`). That pipeline validates + stamps cases
the owner has already adjudicated; this one **mines candidates** to put in front
of the owner. Both share the pure rubric labeler (`curate-pr-review-labeling.ts`)
so the mining heuristic stays consistent with the adjudication rubric.

## The mine -> adjudicate -> promote flow

```text
  merged PRs (gh)                                pr-review-candidates.json
        │   eval:mine-candidates                          │
        ▼   (weak label = triage hint only)               ▼   OWNER reads, adjudicates
  ┌───────────────┐                              ┌────────────────────────┐
  │ CANDIDATE     │  adjudicated:false           │ owner sets the REAL    │
  │ cases         │ ───────────────────────────► │ class buggy/clean/     │
  │ + weakLabel   │                              │ borderline per rubric  │
  └───────────────┘                              └───────────┬────────────┘
                                                             │ promote
                                                             ▼
                                              pr-review-sample.json (toward n>=50)
```

1. **Mine.** The owner runs `npm run eval:mine-candidates` **locally** (it shells
   out to `gh` with the owner's auth — CI never runs it). It pulls a window of
   recently-merged PRs, excludes bot PRs and PRs already in the dataset/candidates
   file, extracts each PR's real diff (bounded) + objective signals, computes a
   **weak label** (triage hint), and appends NEW candidates to
   `testing/datasets/pr-review-candidates.json`.
2. **Adjudicate.** The owner reads each candidate and assigns the REAL class
   (`buggy` / `clean` / `borderline`) per the
   [rubric](./pr-review-eval-labeling-rubric.md) — filling `knownBugs` (with
   severity + location), the `adjudication.rationale`, and flipping
   `adjudicated: true`. The `weakLabel` only orders this queue; it is never the
   verdict.
3. **Promote.** Adjudicated candidates are moved into
   `testing/datasets/pr-review-sample.json` (re-using
   `curate-pr-review-dataset.ts add` for a rubric-valid skeleton, then filling the
   real fields), then `curate-pr-review-dataset.ts validate` + `stats` confirm the
   set is still rubric-valid and report progress toward n>=50.

## The weak-label heuristic (triage hint, NOT a verdict)

The miner attaches one `weakLabel` per candidate, derived purely from objective
signals via the same rubric labeler the adjudication uses. It is a **triage hint
to order the owner's queue**, never a label that ships:

| weakLabel      | Objective signal that produces it                                                                                                                                                            |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `likely-buggy` | A later `fix(`/`revert` PR that touches the same source file AND reads as a genuine defect correction (adds a guard / fail-loud / resolution, or is a revert). Evidence names the fixing PR. |
| `likely-clean` | Either a later follow-up that only **refines** (tunes heuristics / no-behavior-change hardening), OR **no** corrective PR within the long-tenure window (>= 42 days since merge).            |
| `unknown`      | A `fix(` whose nature can't be established from its title (neither defect nor refinement marker), OR no corrective PR but the PR is **too young** (< 42 days) to be a clean signal.          |

It is deliberately **conservative**: `unknown` whenever the signal is ambiguous or
not yet established. The 42-day long-tenure window mirrors the dataset's existing
clean rationale (a defect would usually have surfaced a corrective PR within ~6
weeks), and deliberately avoids the rejected short (~1-week) no-fix window whose
false-clean risk was too high.

`weakLabelEvidence` records the exact objective basis (the fixing PR number, the
refinement marker, or the tenure) so the owner can verify the hint quickly.

## The no-fabrication guarantee

The pipeline produces **candidates + weak labels only**. It does NOT fabricate
adjudicated eval data — the entire value of the eval is REAL owner-adjudicated
cases; a guessed verdict would poison the metric. Concretely, every emitted case:

- is `adjudicated: false` with a neutral placeholder `class: "borderline"`, empty
  `knownBugs` / `borderlineConcerns`, and an `adjudication.rationale` that says
  `UNADJUDICATED`;
- carries the signal **only** in `weakLabel` / `weakLabelEvidence` — the miner
  asserts no buggy/clean class;
- has a `customDiff` that is a **bounded slice of the REAL `gh pr diff`** output
  (truncated with an explicit marker when long), never synthesized.

This invariant is stated in the script header and enforced by the test
(`adjudicated:false`, neutral class, real diff).

## Idempotent + safe

Re-running `eval:mine-candidates` is safe:

- **Dedup against both** the curated dataset (`pr-review-sample.json`) and the
  already-emitted candidates file — a PR is never proposed twice.
- **Bot PRs excluded** (changeset-release, dependabot, github-actions, renovate,
  any `[bot]`).
- **Never overwrites an adjudicated candidate** — a candidate the owner has marked
  `adjudicated: true` is preserved verbatim; a freshly-mined case that collides on
  PR number is dropped.
- **Never invents a diff** — if `gh pr diff` fails for a PR, the excerpt is empty
  rather than fabricated.

## How the owner runs it

```bash
# Local only — uses your gh auth. Default: 50 most-recent merged PRs.
npm run eval:mine-candidates
# Or with options:
npx tsx scripts/mine-pr-review-candidates.ts --limit 80 --diff-cap 6000
```

Then adjudicate the populated `testing/datasets/pr-review-candidates.json`
in-place (set the real class, fill `knownBugs`, flip `adjudicated: true`), and
promote the adjudicated cases into `pr-review-sample.json`. Run
`npx tsx scripts/curate-pr-review-dataset.ts validate` and `… stats` to confirm
rubric validity and track the n>=50 target.

## Architecture (pure core, gh at the edges)

Mirrors the `curate-pr-review-harvest` / `-labeling` split so the rubric logic is
unit-tested without a live GitHub round-trip:

- `scripts/mine-pr-review-candidates-core.ts` — pure: bot exclusion, tenure math,
  the weak-label heuristic (delegating to the rubric labeler), diff bounding.
- `scripts/mine-pr-review-candidates-assemble.ts` — pure: candidate-case assembly
  (schema mirrors `pr-review-sample.json` + `weakLabel` / `weakLabelEvidence` /
  `adjudicated`), bot/dedup filtering, adjudication-preserving merge.
- `scripts/mine-pr-review-candidates.ts` — the thin `gh` I/O edge + CLI (untested
  by unit, like `build-model-registry.ts`).
- `scripts/mine-pr-review-candidates.test.ts` — fixtures only, **no network**;
  collected by the CI Script Tests job.
