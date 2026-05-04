---
'nexus-agents': patch
---

Remove internal-only `@deprecated` markers (Batch A of #2368). No public-API impact at runtime.

- `StateManagerConfig.charsPerToken` — already ignored at runtime; consumers should use `getTokenEstimator()` from core.
- `TaskConstraints.outputFormat` and `TaskConstraints.allowedTools` — fields existed in both the Zod schema (`agent-schemas.ts`) and the TS interface (`core/types/agent.ts`) but were never enforced. Use prompt-level structured output and policy firewall rules instead.
- 6 `Swarm*` type aliases in `agents/observability/orchestration-observer-types.ts` (`SwarmStats`, `SwarmObserverEvent`, `SwarmObserverListener`, `SwarmObserverConfig`, `SwarmObserverOptions`, `ISwarmObserver`) plus the `SwarmObserverConfigSchema` const alias. None were re-exported on the public `src/exports/observability.ts` barrel; canonical `OrchestrationObserver*` names remain.
- `cli-adapters/task-analyzer.ts` deprecated module + its keyword constants. Internal-only; not in any public barrel. Use `SharedTaskAnalyzer` from `core/task-analysis/`.
- Dead barrel `agents/observability-exports.ts` (no importers anywhere).

Two known-deferred surfaces stay until Batch A2 / B / C: `BaseAgent.setState` (8 internal callers + state-event mapping helper), and `agents/experts/task-analyzer.ts` (publicly exposed via `analyzeTask` on the agents barrel — handled in the breaking-minor batch).
