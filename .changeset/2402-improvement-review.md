---
'nexus-agents': minor
---

Add `improvement_review` MCP tool (PR 2 of epic #2402). Replaces the deleted self-development engine with a focused, threshold-gated observability-driven loop.

**What it does**: reads existing observability primitives (`OutcomeStore`, `fitness-audit`) and surfaces patterns that cross documented thresholds as candidate signals. When `fileIssues=true`, files candidate GitHub issues via `gh issue create` (rate-limited to 5 per run, deduped against open issues by signal key). Never auto-merges.

**Detectors**:

- `detectCliPerformanceFloor` — CLI × category success rate < 60% with ≥ minSampleSize observations (default 5)
- `detectFailureCategoryConcentration` — single failure category > 50% of failures with ≥ 10 failures
- `detectFitnessSignals` — fitness score below floor (default 90) AND/OR critical fitness findings

**Safety**:

- `gh issue create` invoked via `execFile` (no shell — safe against command injection from `errorMessage` content)
- Dedup query also via `execFile` with literal-phrase search of signal key in body
- Rate-limited per run; per-signal-class week-long throttle via the signal-key dedup
- Each filed issue includes the signal key in the body for stable cross-run dedup

**Inputs**: `lookbackDays` (default 7), `fileIssues` (default false → return signals only), `minSampleSize` (default 5), `fitnessFloor` (default 90).

**Outputs**: `{ window, totalOutcomes, signals[], issuesFiled[], issuesSkipped[] }`.

Skill count unchanged at 26. MCP tool count: 37 → 38. New file: `src/mcp/tools/improvement-review.ts` (~430 LOC) + `improvement-review.test.ts` (18 unit tests for the threshold detectors). Wired into `mcp/index.ts`, `mcp/tools/index.ts`, `cli-server-tools.ts`, and `tool-annotations.ts`.

Closes the build half of epic #2402. Replaces the unwired engine deleted in PR #2403 (~7,700 LOC). Net code delta: −7,000 LOC.
