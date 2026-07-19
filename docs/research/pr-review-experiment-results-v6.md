---
title: pr_review experiment v6 — per-voter precision/recall from the eval batch harness
description: Placeholder for the v6 batch run of the pr_review panel against the rubric-adjudicated corpus (#3846/#3847), scored per-voter via the #3848 scorer. Populated by scripts/pr-review-eval-run.ts (#4311, epic #3845, unblocks #3849) once a live pass is run.
tier: 2
keywords: [pr-review, eval, v6, precision, recall, autonomous-sdlc]
---

# pr_review experiment v6 — per-voter precision/recall from the eval batch harness

**Status: PENDING — no live run has been executed against this doc yet.**

## Why this doc is a placeholder

This issue (#4311, epic #3845; unblocks #3849) builds the missing **harness** —
`scripts/pr-review-eval-run.ts` — that feeds the rubric-adjudicated corpus
(`testing/datasets/pr-review-sample.json`, n=19; #3846/#3847) through the live
5-voter `pr_review` panel and scores each voter's verdict against ground truth
via the #3848 scorer (`scoreVoterCase` / `computePerVoterPrecisionRecall`).

The harness itself is fully built and unit-tested with a **deterministic stub
panel** (`scripts/pr-review-eval-run-core.test.ts`,
`scripts/pr-review-eval-run.test.ts`) — the corpus load, rubric Rule 2
location-tolerance matching, per-voter scoring, aggregation, store append, and
doc-rendering plumbing are all verified without touching a model. Per the
task's non-negotiable constraint, no `simulateVotes` output or stub-panel
result is presented here as real evidence, and no live model calls happen in
CI or in this package's automated test suite.

**The actual v6 numbers require a live pass**, which needs model auth (a CLI
adapter — `claude`/`gemini`/`codex` — or `ANTHROPIC_API_KEY`) that this build
environment does not have. Running it is explicitly out of scope for this PR;
see [#3849](https://github.com/nexus-substrate/nexus-agents/issues/3849) for
the tracked follow-up that consumes these numbers (a voter promotion
criterion) once they exist.

## How to run the live v6 pass

```bash
npm run eval:run
# or: npx tsx scripts/pr-review-eval-run.ts
```

This runs the LIVE 5-voter `pr_review` panel — 5 LLM calls per case (19 cases
in the current corpus, ~95 calls total) — against every case in
`testing/datasets/pr-review-sample.json`. For synthetic cases it reviews the
stored `customDiff` directly; for the three real-PR cases with no stored diff
(#2228, #2235, #2238) it fetches the diff live via `gh`. Results are:

- appended to the #3848 JSONL eval store
  (`~/.nexus-agents/learning/pr-review-eval.jsonl` by default,
  `NEXUS_DATA_DIR`-relocatable), and
- written to **this file**, replacing this placeholder with the real
  per-voter precision/recall tables (see `renderResultsDoc` in
  `scripts/pr-review-eval-run-core.ts` for the exact shape: a per-voter
  TP/FP/FN/precision/recall table, a per-case verified-findings table, and the
  reproduction command).

> **Metric-honesty guardrail (#3903).** Once populated, n=19 is still a small
> corpus — the resulting numbers must be reported as directional, not
> statistically significant, the same guardrail that governs every prior
> pr_review eval doc in this series
> (`pr-review-experiment-results-v5.md`). Always carry the n and the class
> split (buggy/clean/borderline) when citing any figure from this run.
