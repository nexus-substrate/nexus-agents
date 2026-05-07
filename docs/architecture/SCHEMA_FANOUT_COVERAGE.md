---
title: Schema-Fan-Out Coverage Check Design
description: Catch schema-change cascades where one PR ships a schema change and downstream consumers ship broken in follow-up PRs
tier: tier2
keywords: [governance, ci, schema, zod, fanout, coverage]
---

# Schema-Fan-Out Coverage Check

> Design doc for issue [#2407](https://github.com/williamzujkowski/nexus-agents/issues/2407). Implementation tracked in [#2408](https://github.com/williamzujkowski/nexus-agents/issues/2408).

## Problem

When a Zod schema changes, one PR ships the change and 1–2 follow-up PRs fix consumers that weren't updated. Receipts:

- **#2253** — voter `maxTokens` 500→2000 (truncation root cause)
- **#2254** — move findings to top-level (next layer of the same bug)
- **#2255** — JSON-native findings (final layer)

Three PRs over multiple days, all fixing one bug. The first PR was technically correct in isolation; it broke a consumer that nobody re-tested. By the time the wrong-shape data reached a downstream parser, the failure mode was opaque.

The pattern: schema changes are **localized**, but consumer assumptions are **spread**. Type-checking catches type-shape mismatches but not **runtime-shape** mismatches that come from `JSON.parse` boundaries or `z.parse` validation that hasn't been retuned for the new shape.

## Goals

1. **Catch the cascade** — when a schema changes, fail (or warn) if consumers haven't been updated.
2. **Low false-positive rate** — most schema changes are uneventful. Hard fail on every Zod edit would be useless.
3. **Mechanical** — the check should be deterministic, not reliant on judgment.

## Non-goals

- Replacing typecheck. TS catches type-only changes; this catches **runtime parse boundaries**.
- Mutation testing. Out of scope (cost too high for v1).
- Consumer detection by type-shape inference. Stuck at type-import noise; runtime detection is the cleaner signal.

## Approach: parse-callsite consumer detection

Instead of "anyone who imports the schema," the contract surface is **anyone who calls `.parse()` or `.safeParse()`**. That's the runtime boundary; that's where the new shape actually has to be tolerated.

### Algorithm

A new script `scripts/check-schema-fanout.ts` runs in CI. For a PR diff:

1. Find every `*.ts` file changed in the PR.
2. Extract every Zod schema **modified** in the diff. Detection: file exports a `z.object(...)` or extends one, AND the diff touches the schema's call expression. Use `ts-morph` (already a dependency).
3. For each modified schema `X`:
   1. Find all files that call `X.parse(...)` or `X.safeParse(...)`.
   2. Find the test files co-located with each consumer (same directory, `*.test.ts`).
   3. Assert at least one test file in the consumer set is **also changed** in the PR.
   4. If not, emit a warning (v1) or fail (v2 once calibrated).

### Failure mode: warn first, fail later

Hard fail in v1 would be brittle. False positives are unavoidable for v1 (see Risks below). Ship as a warning that surfaces in PR check output, observe the false-positive rate over ~2 weeks, then promote to hard fail if the rate is acceptable. Track via a dashboard signal (or a simple marker counter logged in the check output).

This matches how `improvement_review` (#2402) lands — observability before enforcement.

### Test-coverage assertion

"At least one test in the consumer set is changed" is a coarse proxy for "consumer test re-validates the new shape." It catches the obvious miss without requiring semantic analysis. Refinements (best to worst):

- **v1 (proxy)**: any test file in consumer's directory was touched in the PR — accept.
- **v2 (snapshot)**: schema's `.shape` snapshot stored in `__snapshots__/`; require update if shape diff. Forces explicit acknowledgment of every shape change.
- **v3 (fixture parsing)**: walk test fixtures that go through `X.parse()`; assert at least one fixture was touched. Highest confidence, highest implementation cost.

v1 is enough to validate the design. Promote to v2 if the shape-snapshot adds caught-bugs without significant friction.

## Bootstrap consumers

Three schemas to track in the first ship. Each has a documented receipt of a cascade.

### 1. PR-review voter findings (#2253–#2255)

**Schema**: `packages/nexus-agents/src/mcp/tools/pr-review-types.ts` (or wherever the voter `findings` Zod schema lives)
**Why**: cleanest receipt of a 3-PR cascade.
**Consumers**: any `.parse(findings)` or aggregator code that builds findings.

### 2. MCP tool input schemas

**Schemas**: every `*ToolInputSchema` in `packages/nexus-agents/src/mcp/tools/*.ts`
**Why**: these are the **public contract** of the MCP server. A schema change here is a breaking change for plugin consumers. Fan-out: tool handler, MCP transport, integration tests.
**Consumers**: tool handler in the same file, plus `src/mcp/index.test.ts`.

### 3. Adapter outcome schema

**Schema**: `TaskOutcome` schema in `packages/nexus-agents/src/orchestration/outcomes/`
**Why**: weather-report, improvement_review, fitness-audit all consume `TaskOutcome`. The 2026-05-05 fix to `improvement_review` (#2404) hit this — `timestamp` was string in TaskOutcome but tests passed numbers, requiring runtime coercion. A change to `TaskOutcome` should fan out to all three consumers.
**Consumers**: weather-report, improvement-review, fitness-audit.

## Risks and tradeoffs

- **False positives on schema renames.** A rename touches the schema definition + every consumer; the check would flag rename-only changes as "consumer tests not updated" if the rename touches no test files. Mitigation: detect "rename-only" diffs (no semantic shape change) and skip — implementation detail in #2408.
- **False positives on type-only edits.** Adding a comment, formatting, or reordering imports in a schema file would trip the check. Mitigation: `ts-morph` AST-based detection (only flag when the schema's call-expression node is touched), not raw line diffs.
- **False negatives on aliased schemas.** If a consumer imports `X as Y` and calls `Y.parse(...)`, naive grep misses it. Mitigation: ts-morph resolves aliases — necessary feature, not optional.
- **Manifest-style scope creep.** Adding every schema to the check produces noise. Curate the bootstrap list carefully, expand only when a new cascade-PR provides a receipt.

## Implementation cost

- New script: `scripts/check-schema-fanout.ts` (~300 LOC, uses ts-morph; mirrors `check-model-string-drift.ts` shape).
- Manifest: a small `docs/ops/schema-fanout-manifest.json` that names the 3 bootstrap schemas, their source files, and rationale.
- New CI job in `.github/workflows/docs-check.yml` (run as warning-only initially).
- Unit tests for the script (in-memory ts-morph fixtures).

Estimated work: ~1 day. Implementation tracked in #2408.

## Acceptance for the design (this doc)

- [ ] Picks one approach (parse-callsite consumer detection: yes)
- [ ] Lists the bootstrap schemas with rationale (3 entries above)
- [ ] Names the failure mode (warn-only for v1, promote to fail in v2)
- [ ] Identifies risks and mitigations
- [ ] Names the version progression (v1 proxy → v2 shape snapshot → v3 fixture parsing)

Implementation begins in #2408 once this design lands.
