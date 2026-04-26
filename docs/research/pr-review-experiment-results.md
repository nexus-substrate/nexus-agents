---
title: pr_review experiment — 10-PR seed run results (#2241)
description: First empirical run of pr_review against historical PRs. Bug-catch rate 0%, false-positive rate 0%, avg duration 2.7min. Verified findings produced - 0 across 50 voter calls.
tier: 2
keywords: [pr-review, experiment, results, verification-gate, autonomous-sdlc]
---

# pr_review experiment — 10-PR seed run results

**Date:** 2026-04-26 (ET)
**Run:** `testing/results/pr-review-batch-2026-04-26T18-01-32-916.summary.json`
**Dataset:** `testing/datasets/pr-review-sample.json` (10 PRs: 5 buggy + 5 clean)

## Executive summary

The pr_review tool — built across #2236 (Children 1+2) and #2238 (Child 3 verification gate) — was run against a 10-PR historical sample. **Zero verified findings were produced across 50 voter calls (10 PRs × 5 voters).**

Headline metrics vs. the #2233 success criteria:

| Metric                                             | Result      | Target | Outcome        |
| -------------------------------------------------- | ----------- | ------ | -------------- |
| Bug-catch rate (request_changes on buggy PRs)      | **0%**      | ≥10%   | **FAIL**       |
| False-positive rate (request_changes on clean PRs) | **0%**      | <20%   | PASS (vacuous) |
| Avg time to decision per PR                        | **2.7 min** | <5 min | PASS           |

Net: **the experiment fails the bug-catch criterion**. Children 5 (this writeup) confirms it; Child 6 (promote to live PRs) is gated on success and therefore does NOT proceed.

## Per-PR results

| PR    | Class   | Tool decision          | Verified findings | Match? |
| ----- | ------- | ---------------------- | ----------------- | ------ |
| #2228 | buggy×1 | approve                | 0                 | ✗      |
| #2236 | buggy×2 | abstain                | 0                 | ✗      |
| #2237 | buggy×1 | abstain                | 0                 | ✗      |
| #2231 | buggy×1 | approve                | 0                 | ✗      |
| #2191 | buggy×1 | abstain (fetch failed) | 0                 | n/a    |
| #2235 | clean   | approve                | 0                 | ✓      |
| #2238 | clean   | abstain                | 0                 | ✗      |
| #2239 | clean   | abstain                | 0                 | ✗      |
| #2226 | clean   | abstain                | 0                 | ✗      |
| #2217 | clean   | abstain                | 0                 | ✗      |

Only #2235 (clean) was correctly classified. Every other PR ended in `abstain` or `approve` regardless of class — indistinguishable behavior between buggy and clean inputs.

## What the data actually says

### 1. Voters don't emit the YAML findings block

The signal that should have produced verified findings — the YAML-fenced \`\`\`yaml findings\`\`\` block specified in the proposal text and parsed by `pr-review-findings.ts:parseFindings` — appeared **zero times** across 50 calls.

This isn't a parser bug — the parser is unit-tested and works on synthetic input. It's that the voters didn't produce the format. Two non-exclusive explanations:

- **Prompt salience:** the format instructions are appended to the proposal but compete with the voters' built-in role system prompts (architect/security/devex/etc, in `voter-prompts.ts`). The role prompts predate Child 3 and don't reference the YAML format.
- **CLI flattening:** voters route through CLI subprocesses (claude/codex/gemini) that may strip code-fence formatting on some routing paths. Worth verifying with raw CLI output capture.

### 2. The verification gate worked as designed (and that's a problem here)

`aggregatePrDecisions` only escalates to `request_changes` when at least one voter has at least one **verified** finding. With 0 verified findings, the only path to `request_changes` is closed — even when voters emit free-form reasoning that contains real concerns (which they did; every PR had at least one voter raising flags in prose).

This is the gate functioning as specified by Child 3. The cost is that the 2026-04-25 verification gate (#2225) — designed to filter false positives — also filters true positives when voters don't follow the structured format. The experiment exposes the brittleness.

### 3. Dataset bias affected the buggy-PR classification

The seed dataset's "buggy" PRs are biased toward **CI-detectable failures** rather than diff-readable bugs:

- #2228: missing entry in a TypeScript `Record` type → caught by Type Check, not by reading the diff
- #2236: stale tool count in 5 prose locations → caught by content-drift gate
- #2237: missing entry in canonical-index README table → caught by index gate
- #2231: function-too-long lint violation → caught by ESLint
- #2191: turned out to be an **issue number, not a PR** — fetch failed; needs dataset correction

A diff-only reviewer (which is what pr_review is) cannot run a type checker or grep for prose drift across the repo. So the dataset is partly testing the wrong thing. A second-iteration dataset should bias toward **logic/correctness bugs** that ARE visible in the diff: null derefs, off-by-one, missing await, unguarded array access, etc.

### 4. Voter agreement was generally HIGH on clean PRs (4/5 approve)

8 of 10 PRs landed with 4-5 approve votes. The single dissenter was almost always reasoning about a quality concern rather than a bug — exactly what the verification gate is designed to suppress at the aggregator level. So the system correctly did NOT promote those to `request_changes`.

The ABSTAIN outcomes on clean PRs are arguably correct outputs of the design: "voters mostly approved but one had a soft concern" is correctly NOT a green light. The framing question is whether `abstain` should be the second-most-permissive default instead of `approve` when there's no verified blocker. This is a design tradeoff worth revisiting.

## Recommendation: do NOT proceed to Child 6

The four success criteria from #2233 are not met. Specifically:

- ❌ ≥1 missed-bug catch per 10 PRs — got 0
- ✓ <20% false-positive rate (vacuous: there were 0 false positives)
- ✓ <5 min/PR decision time
- ❌ "No hallucination incidents" cannot be evaluated when no findings were filed

**Child 6 (#2242) closes without action.**

## Recommended follow-ups

In rough priority order, files I'd open against the parent epic (#2233):

1. **Voter-prompt update** — append the YAML findings format to each role's system prompt in `voter-prompts.ts`, with a few-shot example showing what a verified finding looks like. Re-run the experiment after this lands.
2. **Verify CLI passthrough** — capture raw stdout from one voter's CLI subprocess invocation and confirm the YAML fence isn't being stripped. If it is, work around it (e.g., switch to a JSON output schema enforced by the CLI's structured output mode, where supported).
3. **Better dataset** — replace the CI-detectable-failure seed entries with diff-readable bugs. Mine the repo for "off-by-one fixed in #X" / "null check added in #Y" patterns. Target 20+ PRs with real correctness defects visible in the diff.
4. **Fix dataset entry for #2191** — confirmed as an issue number, not a PR; replace with the actual fix PR (#2216) or remove the entry.
5. **Aggregation tradeoff** — consider whether `abstain` should fall back to `approve` when no voter has a verified finding AND ≥75% approve. Current design is conservative; the experiment suggests it may be TOO conservative.

These follow-ups should be tried before any retest. The empirical data shows the multi-voter-as-PR-reviewer **pattern** isn't disproven — voters did engage with the diffs and produce reasoning — but the **structured-finding contract** between voters and the aggregator needs work.

## Cost / quota consumed

- 49 successful voter calls + 5 errored (across 9 successfully-fetched PRs; #2191 failed at fetch stage)
- Wall-clock: ~25 minutes
- LLM cost: $0 in metered dollars (all routed through CLI subprocesses against subscription quota per `NEXUS_BILLING_MODE=plan`)
- Subscription quota: ~50 messages consumed; comfortably within 5-hour rolling limit

## Status against the #2233 epic

- [x] Child 1: GitHub Actions workflow (#2236)
- [x] Child 2: pr_review MCP tool (#2236)
- [x] Child 3: Verification gate enforcement (#2238)
- [x] Child 4: Sample dataset + harness + scorer (#2243)
- [x] Child 5: Run + analyze experiment (this PR)
- ❌ Child 6: Promote to live PRs — **closed without action; success criteria not met**

The epic is **resolved with a "do not promote" outcome**, but the infrastructure (harness, scorer, dataset) remains in place for retest after the recommended follow-ups land. This is a legitimate negative result — the experiment did its job by surfacing a real failure mode before the tool went live on every PR.
