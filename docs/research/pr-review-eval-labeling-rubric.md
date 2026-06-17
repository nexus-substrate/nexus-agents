---
title: pr_review eval labeling rubric (v1)
description: Objective labeling rules for the pr_review evaluation dataset — severity floor, location tolerance, clean-PR and borderline criteria, adjudication procedure, and rubric versioning. Makes "did pr_review catch the bug" measurable instead of a judgment call.
tier: 2
keywords: [pr-review, eval, rubric, labeling, methodology, autonomous-sdlc]
---

# pr_review eval labeling rubric (v1)

**Rubric version:** `1.0.0`
**Effective:** 2026-06-16 (ET)
**Applies to:** `testing/datasets/pr-review-sample.json` and any dataset curated by
`scripts/curate-pr-review-dataset.ts`.
**Issue:** #3846 (part of epic #3845). Supersedes the ad-hoc labeling described in
[pr-review-experiment-results-v5.md](./pr-review-experiment-results-v5.md).

## Why this exists

v5's headline 50% false-positive rate dissolved under triage: it was mostly the
dataset being wrong (#2235 was labeled `clean` but shipped a real bug the panel
caught) plus borderline judgment calls scored as failures. The labeling
methodology — not the panel — was the bottleneck. This rubric makes each label
objective so that v6 precision/recall is measurable, not arguable.

## Definitions

A **case** is one dataset entry (`prs[]`): a PR diff (real `number` fetched from
GitHub, or `customDiff` for synthetic cases) plus its `knownBugs` array and a
`class`. The class is derived from the rubric, not asserted by the author.

**Severity** of a known bug is one of (highest to lowest):

| Severity   | Meaning                                                                          |
| ---------- | -------------------------------------------------------------------------------- |
| `critical` | Security vuln, data loss, or guaranteed crash/incorrect result on the happy path |
| `high`     | Crash/incorrect result on a reachable non-happy path; CI-detectable type error   |
| `medium`   | Wrong behavior on an edge case; resource leak; correctness foot-gun              |
| `low`      | Style, naming, micro-perf, or a concern that needs author judgment to confirm    |

## Rule 1 — severity floor (what counts as a bug)

A case is **buggy** if and only if it contains at least one known bug at severity
`medium` or higher. The severity floor is **`medium`**.

- `low`-only findings do NOT make a case buggy. They are recorded (so we can still
  score whether the panel raised them) but the case's `class` stays `clean` or
  `borderline` per Rules 3–4.
- This floor is what "did pr_review catch THE bug" is measured against: a catch
  counts only when the panel's verified finding maps to a `>= medium` known bug
  within location tolerance (Rule 2).

## Rule 2 — location tolerance

A panel finding **matches** a known bug when both:

1. it cites the same file as the known bug's `location`, AND
2. the cited line is within **±5 lines** of the known bug's line (the v5 window).

Notes:

- For bugs that are not line-local (e.g. #2228 — a missing entry in a `Record`
  union relationship), set `locationTolerance: "structural"` on the bug. A
  structural bug matches when the finding names the same symbol/relationship
  (the missing key, the union member), regardless of line. This prevents a real
  catch from being scored as a miss just because the defect has no single line.
- The `location` string must be `path:line` (line required) for line-local bugs,
  or `path` (no line) for `structural` bugs.

## Rule 3 — clean-PR criteria

A case is **clean** if ALL of:

- it has zero known bugs at or above the severity floor, AND
- a careful reviewer reading only the diff would have **no defensible
  `medium`+ correctness/security objection** (low-severity nits may exist but do
  not disqualify clean), AND
- (for real PRs) it shipped without a post-merge fix that targets the diff.

A clean case's expected panel outcome is `approve`. A verified `medium`+ finding
on a clean case is a **strict false positive**.

## Rule 4 — the borderline class (explicit)

A case is **borderline** when a careful reviewer could _defensibly_ raise a
`medium`+ concern from the diff, but it depends on context not present in the
diff (no callers visible, locale/runtime assumptions, intentional-but-unusual
code). v5's `synthetic-clean-refactor` is the archetype: catfish flagged "unused
helper — no callers in diff" and devex flagged "`toLocaleDateString` is
locale-dependent in principle." Neither is a hallucination; neither is a
confirmed bug.

Borderline cases:

- carry `class: "borderline"` and `knownBugs: []` (the concern is recorded in
  `borderlineConcerns[]`, not as a confirmed bug),
- are **excluded from both the bug-catch numerator and the strict-FP
  numerator**. A finding on a borderline case is scored as `borderline`, neither
  a catch nor a false positive.

This is the key v5 correction: borderline findings were counted as false
positives, inflating the FP rate. They now have their own bucket so v6 FP is
"strict FP on clean cases only."

## Rule 5 — adjudication procedure for ambiguous cases

When a case's class is contested (e.g. is this `medium` or `low`? clean or
borderline?):

1. **Default to the lower-severity / more-conservative class.** A bug is only
   `medium`+ if its failing condition is concretely reachable and statable as a
   failing test or exploit. If you cannot write the failing assertion, it is
   `low` (Rule 1) or `borderline` (Rule 4).
2. **Require a written rationale** in the entry's `adjudication.rationale`. State
   the reachable failure (or why none exists).
3. **Real bugs caught post-hoc are gold.** If a finding led to a real follow-up
   fix (PR/commit), the case is buggy and the `fixReference` is the evidence —
   this is what reclassified #2235.
4. **Reclassify, don't excuse.** If the panel was right and the dataset was
   wrong, fix the label (do not log it as a false positive). If the panel was
   wrong, the label stays and it is a real FP.
5. Stamp the entry: `rubricVersion`, `class`, `adjudication.adjudicatedAt`,
   `adjudication.adjudicatedUnder` (this rubric version), and `provenance`.

## Per-entry stamp (schema)

Every entry carries:

```jsonc
{
  "number": 2235,
  "rubricVersion": "1.0.0",
  "class": "buggy", // derived: buggy | clean | borderline
  "provenance": {
    "source": "historical", // historical | synthetic | historical-clean
    "fixReference": "PR #2255", // evidence for buggy cases; null for clean
    "discoveredBy": "pr_review v5 devex voter",
  },
  "knownBugs": [
    {
      "summary": "…",
      "severity": "medium", // critical | high | medium | low
      "location": "path/to/file.ts:108",
      "locationTolerance": "line", // line | structural
      "fixReference": "PR #2255",
    },
  ],
  "borderlineConcerns": [], // only for class: borderline
  "adjudication": {
    "adjudicatedAt": "2026-06-16",
    "adjudicatedUnder": "1.0.0",
    "rationale": "…reachable failure or why none…",
  },
}
```

Synthetic entries additionally keep `customDiff` / `customDescription`.

## Rubric versioning

- Semver. **Major** = a scoring rule changes (severity floor, tolerance window,
  class definitions) such that existing labels could flip. **Minor** = additive
  (new optional field, new severity note) that cannot flip a label. **Patch** =
  wording/typo.
- A major bump **requires re-adjudicating the whole dataset** and logging the
  diff in the results doc, the same way v1 re-adjudicated the v5 cases below.
- The version lives in two places that must agree (enforced by the dataset
  validator test): this doc's `Rubric version` header and the dataset's
  top-level `rubricVersion`. Each entry's `rubricVersion` records the version it
  was last adjudicated under.

## v5 → v1-rubric re-adjudication (the 10 cases)

Applying Rules 1–5 to the 10 v5 cases. "Changed?" = did the stamp/label move.

| Case                       | v5 class | v1 class   | Severity (floor=medium)       | Changed?                            |
| -------------------------- | -------- | ---------- | ----------------------------- | ----------------------------------- |
| `synthetic-redos`          | buggy    | buggy      | critical (ReDoS, CWE-1333)    | severity stamped                    |
| `synthetic-off-by-one`     | buggy    | buggy      | medium (off-by-one)           | severity stamped; line `:18` exact  |
| `synthetic-missing-await`  | buggy    | buggy      | high (stale-token auth)       | severity stamped                    |
| `synthetic-null-deref`     | buggy    | buggy      | high (TypeError on undefined) | severity stamped                    |
| `synthetic-listener-leak`  | buggy    | buggy      | medium (listener/mem leak)    | severity stamped                    |
| #2228                      | buggy    | buggy      | high (CI type error)          | `locationTolerance: structural`     |
| #2235                      | buggy\*  | buggy      | medium (wrong env var in 429) | provenance: caught by v5; confirmed |
| #2238                      | clean    | clean      | — (49/49 pass)                | provenance stamped                  |
| `synthetic-clean-refactor` | "clean"  | borderline | — (no confirmed bug)          | **reclassified clean → borderline** |
| `synthetic-clean-docs`     | clean    | clean      | — (docs-only)                 | provenance stamped                  |

\* #2235 was reclassified clean → buggy during v5 (already done per #3846 history,
and recorded in the dataset before this rubric). v1 confirms it buggy under
Rule 5.3 (real follow-up fix #2255 = evidence) and stamps severity `medium`.

### What changed, per case

- **All five synthetic buggy cases + #2228, #2235**: gained an explicit
  `severity` and the per-entry stamp (`rubricVersion`, `class`, `provenance`,
  `adjudication`). No label flipped — these were already correctly buggy. #2228
  gained `locationTolerance: "structural"` so the v5 "miss" (panel found a real
  issue at a different line) is scored correctly: the defect is a missing
  `Record` entry with no single line, so it should never have been a location
  miss in the first place.
- **#2235**: no class change (already buggy in the committed dataset). The rubric
  records the provenance — caught by the v5 devex voter, fixed in #2255 — as the
  Rule 5.3 evidence and stamps it `medium`.
- **`synthetic-clean-refactor`: reclassified `clean` → `borderline`.** This is the
  substantive correction. v5 counted its findings as false positives, which is
  the single biggest driver of the inflated 50% FP headline. Under Rule 4 the
  findings (unused helper, locale-dependent formatter) are defensible
  context-dependent concerns, not confirmed bugs and not hallucinations. As
  `borderline` it is excluded from the strict-FP numerator.
- **#2238, `synthetic-clean-docs`**: stay `clean`; only gained provenance +
  adjudication stamps.

### Effect on the scored metrics

Under v1 the v5 run re-scores as:

- **Buggy cases:** 7 (5 synthetic + #2228 + #2235).
- **Clean cases:** 2 (#2238, `synthetic-clean-docs`).
- **Borderline cases:** 1 (`synthetic-clean-refactor`).
- **Strict false-positive denominator:** the 2 clean cases. v5 emitted 0 verified
  findings on both → **strict FP = 0/2 (n=2 clean, 1 borderline excluded)**.
  Do NOT round this to a "0% false-positive rate." See the metric-honesty
  guardrail below: at n=2 this number is not a rate.
- Bug-catch and location-match are re-derived by v6 against these labels; this
  rubric only fixes the labels, not the panel run (running v6 is #3849, out of
  scope here).

### Metric-honesty guardrails (#3903, required by the #3901 6-1 ratification)

The 50% → 0% swing on the strict-FP figure is small-n adjudication noise, not a
measured improvement in the tool. Treat these as binding when citing the number:

- **The strict-FP "0%" is at n=2 and is statistically meaningless** — a single
  future FP would swing it to 50%. **Never cite a bare "0% false-positive
  rate."** Always report it WITH the n, the clean-denominator count, and the
  borderline count: "strict FP = 0/2 (n=2 clean cases, 1 borderline excluded),
  v5 re-adjudicated under rubric 1.0.0."
- The honest reading is: **"the 50% headline was an artifact of n and
  adjudication noise"** — not "pr_review has a 0% FP rate." The v5 numbers are
  directional only.
- **The `synthetic-clean-refactor` clean → borderline reclassification is the
  single lever that moved 50% → 0%, and it must be re-audited on its own merits
  before the 0% is cited anywhere external.** Its rationale (Rule 4:
  context-dependent concerns are not hard FPs; symmetrically excluded from BOTH
  numerators, so not gaming) must stand independently of its effect on the
  metric. The reclassification is defensible, but "defensible" is not the same
  as "audited."
- **Real, statistically meaningful FP/bug-catch numbers await #3847** (curate the
  dataset to n ≥ 50 with real PR data). Until then no FP rate from this dataset
  should be presented as a measured rate.

## Out of scope (tracked elsewhere)

- Growing the set to n≥50 with provenance: #3847 (curation pipeline —
  `scripts/curate-pr-review-dataset.ts`, see
  [pr-review-dataset-curation.md](./pr-review-dataset-curation.md)).
- Per-voter precision/recall in the outcome store: #3848.
- v6 run + promotion-criterion ADR: #3849.
