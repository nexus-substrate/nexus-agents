---
'nexus-agents': patch
---

**feat(workflows):** `run_workflow` MCP tool now accepts an optional `timeoutMs` input to override the per-phase execution budget (closes #3017).

Pre-fix, the per-phase execution timeout was always `workflow.timeout` (set in the template YAML) or the engine's `defaultTimeoutMs` — known-long templates like `security-audit` over a large repo couldn't be given a one-off larger budget without editing the template. #2931 surfaced the need: a 120s default-tripped run was un-debuggable; #3017 follows up with the ability to extend the budget for legitimately-slow workloads.

### Wiring (top to bottom)

- **`RunWorkflowInputSchema`** (`mcp/tools/run-workflow-types.ts`): added optional `timeoutMs: z.number().int().min(1000).max(1_800_000)` — bounded to [1s, 30min] to prevent both flapping cancellations and unbounded hangs that would defeat the timeout-mismatch telemetry.
- **MCP tool schema** (`mcp/tools/run-workflow.ts`): added `timeoutMs` to the `inputSchema` so the field appears in the tool advertisement.
- **`handleRunWorkflow`**: extracts `timeoutMs` from validated args and threads it into `executeWorkflow` as `{ stepTimeoutMs: timeoutMs }` (renamed to `phaseTimeoutMs` internally — see the docstring update on `IWorkflowEngine.execute`).
- **`executeWorkflow`**: passes `{ phaseTimeoutMs }` to `workflowEngine.execute()`.
- **`IWorkflowEngine.execute`** (`core/types/workflow.ts`): added the optional third `options?: { phaseTimeoutMs?: number }` parameter (documented as winning over both `workflow.timeout` and the engine's `defaultTimeoutMs`).
- **`WorkflowEngine.execute` → `runExecution` → `executePhases`**: threads `phaseTimeoutMs` down to the `ExecutionOptions` builder, where it now wins over `workflow.timeout ?? this.config.defaultTimeoutMs`.

### Semantic clarification

This overrides the per-phase **overall** execution timeout — `executeParallel`'s `setupOverallTimeout`. It is NOT a per-step timeout (per-step uses `step.timeout` from the workflow definition, separately). The docstrings and schema descriptions explicitly say "per-phase" to avoid the same confusion that `run_dev_pipeline`'s identically-named-but-dead `timeoutMs` field already creates.

### Test coverage

2 new tests in `workflow-engine.test.ts`:

- `threads phaseTimeoutMs option down to executePhase ExecutionOptions` — passing `{ phaseTimeoutMs: 999_999 }` wins over a template with `timeout: 5000`.
- `falls back to workflow.timeout when phaseTimeoutMs is omitted` — omitting the option correctly uses `workflow.timeout`.

26 tests pass (was 24); `tsc + eslint` clean.

Closes #3017. #2931's other deferred follow-up (#3016, first-step adapter hang root cause) is separate.
