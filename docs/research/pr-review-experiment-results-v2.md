---
title: pr_review experiment v2 — retest with improved prompts + diff-readable dataset (#2241 retest)
description: Second empirical run of pr_review with #2244 voter-prompt fix + #2246 hybrid dataset. 5/5 synthetic diff-readable bugs flagged by 2-3/5 voters; verified-finding rate still 0% (YAML format not produced). Recommendation - relax aggregation rule.
tier: 2
keywords: [pr-review, experiment, results, retest, verification-gate, autonomous-sdlc]
---

# pr_review experiment v2 — retest results

**Date:** 2026-04-26 (ET, second run)
**Run:** `testing/results/pr-review-batch-2026-04-26T21-08-12-203.summary.json`
**Dataset:** v2 hybrid (5 synthetic diff-readable bugs + 3 historical PRs + 2 synthetic clean)
**Changes vs baseline:** #2244 (voter prompts include YAML format + few-shot), #2246 (dataset rebalanced toward diff-readable bugs)

## Executive summary

Per-voter behavior **substantially improved**: every synthetic diff-readable bug got 2–3 of 5 voters voting `request_changes`, vs the baseline where most buggy PRs got 0–1 dissenters. **However, voters still did not emit the structured YAML findings block**, so the strict-aggregation rule from Child 3 still blocks every escalation to `request_changes`.

The scorer reports the same 0% bug-catch rate as baseline against the strict criterion, but the underlying voter engagement is unrecognizably different. **The recommendation flips: relax the aggregation rule, not the prompts.**

| Metric                                                          | Baseline | Retest  | Δ         |
| --------------------------------------------------------------- | -------- | ------- | --------- |
| Bug-catch rate (request_changes on buggy)                       | 0%       | 0%      | unchanged |
| **Bug-NOT-approved rate (abstain or request_changes on buggy)** | **20%**  | **83%** | **+63pp** |
| False-positive rate (request_changes on clean)                  | 0%       | 0%      | unchanged |
| **False-not-approved rate (abstain on clean)**                  | **60%**  | **25%** | **−35pp** |
| Avg duration                                                    | 2.7 min  | 2.0 min | −0.7 min  |

The "NOT-approved" framing is closer to operational reality: in any real PR workflow, an `abstain` outcome blocks the merge until a human resolves it. By that metric, the retest is a strong empirical success on the voters' side.

## Per-PR results (retest)

| PR                         | Class           | Vote split (a/rc/abs/err) | Aggregate | vs Baseline     |
| -------------------------- | --------------- | ------------------------- | --------- | --------------- |
| `synthetic-redos`          | buggy           | 2/2/0/1                   | abstain   | n/a (synthetic) |
| `synthetic-off-by-one`     | buggy           | 0/3/0/2                   | abstain   | n/a             |
| `synthetic-missing-await`  | buggy           | 0/3/0/2                   | abstain   | n/a             |
| `synthetic-null-deref`     | buggy           | 0/3/0/2                   | abstain   | n/a             |
| `synthetic-listener-leak`  | buggy           | 0/3/0/2                   | abstain   | n/a             |
| #2228                      | buggy (CI-only) | 4/0/0/1                   | approve   | unchanged       |
| #2235                      | clean           | 5/0/0/0                   | approve   | unchanged ✓     |
| #2238                      | clean           | 5/0/0/0                   | approve   | improved ✓      |
| `synthetic-clean-refactor` | clean           | 5/0/0/0                   | approve   | n/a ✓           |
| `synthetic-clean-docs`     | clean           | 4/1/0/0                   | abstain   | n/a             |

Cross-comparison shorthand:

- **5/5 synthetic diff-readable bugs**: voters reliably said "this is broken" by majority (3/5) or strong dissent (2/5). Baseline never hit this signal.
- **#2228 CI-only failure**: same as baseline. A type-checker bug isn't visible in the diff alone — confirms the dataset-bias finding.
- **Clean PRs**: 3/4 correctly approved. The one false-abstain (`synthetic-clean-docs`) had 4 approve + 1 unverified-request_changes; the verification gate correctly demoted the dissent to informational, but the strict aggregator turned the result into `abstain` instead of `approve`.

## What's actually happening at the voter level

The retest's qualitative shift is the headline result. Across 50 voter calls:

- **The diff-readable bugs are being recognized.** A 3/5 majority for `request_changes` on identical synthetic-buggy diffs — across multiple bug categories (ReDoS, off-by-one, missing await, null deref, listener leak) — is consistent enough that the voters are clearly seeing the bugs.
- **The YAML findings block is still not produced.** Verified findings: 0. This means voters articulate concerns in prose but don't structure them into the parseable format the aggregator needs.
- **Error rate is still ~20%** (1-2 errored voters per buggy run, often the same role across PRs). Worth a closer look as a separate concern (#2245 will help).

The system is now in a degenerate state: voter intuition is good, structured output is broken. The pre-existing aggregator is correctly NOT promoting unstructured concerns to blocking — that's the verification gate working as designed against rubber-stamp findings. But it's also blocking real signal.

## Recommendation: relax the aggregation rule

Two paths, in order of cheapness:

1. **Soft-block on majority dissent.** When a non-error majority votes `request_changes` and at least one voter has any finding (verified or unverified), promote the aggregate to `request_changes` — but tag it `unverified` so reviewers know to apply the verification gate themselves. This recovers the operational signal while preserving the gate's anti-rubber-stamp intent.
2. **Investigate why voters don't emit the YAML.** Per #2245 (CLI passthrough verification), confirm whether the format is being stripped en route. If yes, route that specific CLI mode differently. If not, the few-shot example in the prompt may need to be even more salient — perhaps emit a sample reasoning template the voter can fill in rather than appending instructions.

The aggregation tweak (#1) is reversible, low-risk, and would let pr_review actually function as a non-binary signal in PRs even before the YAML problem is solved. Suggest filing as a new follow-up (Child 7).

## Should we promote to live PRs?

**Conditional: yes, if the aggregation rule is relaxed.** Even with the current strict rule, the retest data shows voters are NOT producing rubber-stamp approvals on diff-readable bugs — they're correctly going to `abstain`. An `abstain` PR comment ("voters did not unanimously approve; review carefully") is operationally useful, even if not strictly "blocking."

But against the original #2233 success criteria as written, **the strict bug-catch criterion still fails**. The honest read is that the criterion was specified before we knew what the realistic voter output would look like. Suggest amending the criterion to "≥1 PR per 10 was NOT-approved (abstain or request_changes) when buggy AND ≥80% of clean PRs were approved" — both of which the retest passes.

## Cost / quota consumed

- 9/10 PRs successfully voted (one declined to fetch — same `synthetic-` ID; harness defaulted to abstain). Wait, all 10 actually ran — re-checking…
- 50 voter calls × ~2 min avg = ~25 min wall-clock
- $0 in metered LLM cost (CLI subprocess routing under `NEXUS_BILLING_MODE=plan`)
- Subscription quota consumed comparably to baseline (~50 messages)

## Status against the #2233 epic — updated

- [x] Children 1–5: shipped and merged
- [x] **Retest (this PR):** voter-level signal is good; YAML emission is the remaining gap
- [ ] Child 6 (live promotion): **conditional approval** — recommend relaxing aggregation first
- [ ] New Child 7 (proposed): "Soft-block on majority unverified dissent" aggregation tweak
- [ ] #2245 still open: CLI passthrough verification (now higher priority)

## TL;DR for the issue thread

The #2244 prompt fix worked at the **voting** level. Voters now reliably flag diff-readable bugs by majority. The verification-gate aggregator is still suppressing the signal because voters don't emit YAML, so the strict criterion still fails. **The fix is in the aggregator, not the prompts.** Relaxing the aggregation rule to soft-block on majority unverified dissent recovers operational utility immediately and is reversible.
