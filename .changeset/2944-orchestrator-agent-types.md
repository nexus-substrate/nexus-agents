---
'nexus-agents': patch
---

**refactor(types):** drop the `as unknown as` cast around `OrchestratorFactoryConfig.techLead`.

`cli-server-tools.ts:createOrchestratorForOrchestration` cast a real `Orchestrator` instance to `{ execute: (task: unknown) => Promise<Result<unknown, unknown>> }` because `OrchestratorFactoryConfig.techLead` and `orchestratorAgent` had that wide shape. The cast hid two type-safety regressions:

- **Input widening to `unknown`** — if any caller ever wired a non-`Task` value into the factory, `BaseAgent.execute` would surface opaque Zod/structural failures from inside the agent instead of a compile-time error.
- **Error erasure** — discriminating `AgentError` codes at catch sites was impossible because the surfaced error type was `unknown`.

Introduced `OrchestratorAgentLike = { execute(task: Task): Promise<Result<unknown, unknown>> }` (exported from `orchestrator-adapters.ts` — the same module that already used this exact shape internally on `OrchestratorAdapter.setOrchestrator`). Used it for both `techLead` and `orchestratorAgent` config fields. `puppeteerOrchestrator` stays `{ execute(task: unknown) => ... }` — Puppeteer takes arbitrary policy-shaped tasks, not the core `Task` type. `Result<TaskResult, AgentError>` → `Result<unknown, unknown>` is sound by covariance; kept the error wide because `orchestrator-adapters.test.ts` covers `err('string-error')` (non-`Error` failures the adapter is intentionally resilient to).

The cast and the now-unused `Result` import in `cli-server-tools.ts` are gone. Closes #2944.
