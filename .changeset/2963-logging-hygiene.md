---
'nexus-agents': patch
---

**fix(logging):** three of four hygiene issues from #2963. Site 3 (subprocess-adapter taskId correlation) deferred — requires `CliTask` shape change.

- **Site 1 (MEDIUM) — `cli/hooks/handlers/session-end.ts:134`.** `logger.debug('Session metrics', metrics)` was leaking `metrics.tasks[].task`, which is the raw user-task prompt string. A user pasting `"deploy with API_KEY=sk-…"` would land their key in debug logs. Added `summarizeMetricsForDebug()` that emits only `id`, `status`, `durationMs`, `tokensUsed` per task — the load-bearing observables. Full metrics still written to the operator-requested `--export` file (no behavior change there).
- **Site 2 (MEDIUM) — `cli/hooks/handlers/pre-tool.ts:122`.** `logger.info('Sensitive file access', { filePath, warning })` was emitting at always-on `info` for every `Edit`/`Write` touching `.env`/`id_rsa`/AWS-cred paths — aggregated in log services this built a map of where secrets live. Dropped to `debug`; added `toolUseId` correlation field already present in the sibling `validateBashTool` call.
- **Site 4 (LOW) — `pipeline/dev-pipeline.ts:567,572,575`.** The plan-iteration loop's "Plan approved" / "Plan rejected, iterating" / "Max vote iterations reached" lines lacked the `sessionId` that's in scope at the caller. Threaded `sessionId` through `runPlanOrResume` → `planVoteLoop` so plan-loop post-mortems can correlate to checkpointed sessions on disk.

53 tests pass across the 3 affected test files; tsc + eslint clean.
