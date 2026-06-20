---
'nexus-agents': minor
---

feat(eval): pr_review candidate-mining curation pipeline — mines merged PRs for owner adjudication toward n>=50 (#3847)

A curation pipeline that mines THIS repo's merged-PR history into CANDIDATE
pr_review eval cases for the owner to adjudicate, to grow the dataset
(`testing/datasets/pr-review-sample.json`) from n=19 toward n>=50. The pipeline
produces candidates + weak labels ONLY; it never fabricates an adjudicated
verdict (the owner adjudicates each candidate per the rubric).

- New miner `scripts/mine-pr-review-candidates.ts` (npm: `eval:mine-candidates`)
  shells out to `gh` LOCALLY (owner auth; CI never runs it). It pulls a window of
  recently-merged PRs, excludes bot PRs (changeset-release/dependabot/
  github-actions/renovate/`[bot]`) and PRs already in the dataset/candidates file,
  extracts each PR's real (bounded) diff + objective signals, and emits NEW
  candidates to `testing/datasets/pr-review-candidates.json`.
- **Weak-label heuristic (triage hint, NOT a verdict):** reuses the tested rubric
  labeler so the mining heuristic matches adjudication. A confirmed defect-fix/
  revert on the same source file → `likely-buggy`; a refinement-only follow-up or
  no corrective PR within the 42-day long-tenure window → `likely-clean`; an
  ambiguous `fix(` or a too-young no-fix PR → `unknown`. Conservative by design;
  `weakLabelEvidence` records the objective basis.
- **No-fabrication guarantee:** every emitted case is `adjudicated: false` with a
  neutral placeholder `class: "borderline"`, empty `knownBugs`, an UNADJUDICATED
  rationale, and a `customDiff` that is a real bounded slice of `gh pr diff`
  (never synthesized). The signal lives only in `weakLabel`.
- **Idempotent + safe:** re-running dedups against both the dataset and the
  candidates file, and never overwrites an `adjudicated: true` candidate.
- Pure logic factored into `mine-pr-review-candidates-core.ts` (bot exclusion,
  tenure math, weak label, diff bounding) + `mine-pr-review-candidates-assemble.ts`
  (candidate assembly, dedup, adjudication-preserving merge), unit-tested against
  fixtures with NO live gh (`mine-pr-review-candidates.test.ts`, 18 tests).
- Doc `docs/research/pr-review-eval-curation.md` explains the
  mine -> adjudicate -> promote flow, the weak-label heuristic, and the
  no-fabrication guarantee.
