---
'nexus-agents': patch
---

**fix(sprawl):** redirect three hardcoded relative paths so runtime artifacts land under `getNexusDataDir()` instead of sprawling at `cwd`. Closes #2873, #2874, #2875 (epic #2872).

- **`./runs/` → `getNexusDataDir()/runs/`** (`pipeline-runner.ts`). The previous `DEFAULT_RUNS_DIR = './runs'` const is replaced with `getDefaultRunsDir()` so trace output for every `PipelineRunner` execution lands under the centralized data dir. Function form (not const) so `NEXUS_DATA_DIR` env changes are honored at call time. Was the single biggest sprawl source (1063 entries observed in one example checkout).
- **`./.nexus-pipeline/` → `getNexusDataDir()/pipeline/`** (`task-tracker.ts`). The `JsonTaskTracker` JSON-fallback default no longer drops a `.nexus-pipeline/` directory at the repo root.
- **`./logs/run_evaluation/` default removed** (`cli-types.ts`). The only consumer of `--output-dir` (`handleSweBenchCommand`) is a deprecation shim that ignores the value, so the default was advertising a sprawl-creating fallback for no reason. Live callers should pass an explicit path or resolve through `getNexusDataDir()` at use time.

No behavior change for callers that pass `runsDir` / `outputDir` / `--output-dir` explicitly. Tests added covering the new defaults + the call-time env resolution.
