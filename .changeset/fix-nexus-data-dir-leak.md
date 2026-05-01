---
'nexus-agents': patch
---

fix(cli): NEXUS_DATA_DIR leak in learning/sessions/tasks/beliefs/overlay paths (#2314)

Discovered while dogfooding v2.63.0 portable install. The v2.60.0 (#2302) refactor migrated 11 callsites to the `getNexusDataDir()` resolver but missed several others — most critically, `config/learning-persistence.ts` exported its paths as **module-level consts evaluated at import time**, so setting `NEXUS_DATA_DIR` from the env had no effect on outcome/rule storage.

Symptom: a fresh portable workspace's `nexus-agents doctor` reports the host's outcome history (e.g., "Outcomes: 10033 recorded" on a brand-new dir).

Fix:

- Convert `LEARNING_DIR` / `OUTCOMES_FILE` / `RULES_FILE` from module-level consts to getter functions (`getLearningDir()`, `getOutcomesFile()`, `getRulesFile()`) that call `getNexusDataDir()` at call time
- Update all callers (cli/doctor, orchestration/outcomes, pipeline/agent-executor, learning/strategy-distiller-persistence)
- Remove the deprecated const exports — keeping them as stubs would preserve the bug
- Migrate the remaining 6 missed callsites (config-loader, capability-overlay, session-journal, structured-task-state, belief-memory-persistence, orchestrate-reflection) from `homedir()` to `getNexusDataDir()` / `nexusDataPath()`

After the fix, a fresh portable workspace correctly reports 0 outcomes / empty learning dir / clean session log. Workspace-state isolation — one of the explicit goals of the #2301 epic — now works as advertised.

Patch release because this is a fix to v2.60.0–v2.63.0 leakage, not new functionality.
