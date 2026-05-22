---
'nexus-agents': patch
---

**feat(orchestrate):** wire the prior-memory context into the task prompt (behind the existing flag). Part of #2921 / #2792 Phase 3.

`injectMemoryContextForOrchestrate` fetched the unified memory context on every `orchestrate` call and, when `NEXUS_CONTEXT_RETRIEVER_INJECT=1`, stashed a `priorMemorySummary` on `input.context` — but nothing read it. A consensus vote on #2921 (2/1) decided to **wire the consumer** rather than delete the code.

`createTaskFromInput` now routes `priorMemorySummary` into the task's `context.history` as a synthetic entry, which the prompt builder already renders — so no per-adapter `buildPrompt` change is needed. The summary is wrapped in a clearly-delimited, length-capped (`PRIOR_MEMORY_MAX_CHARS`), explicitly **non-instructional** reference block: accumulated memory can contain untrusted content, so it is presented as background the model may consult, not as instructions.

`NEXUS_CONTEXT_RETRIEVER_INJECT` stays **default-off** — with the flag unset the key is never written and behavior is unchanged. Flipping the default on is a separate, bake-gated change (the security reviewer rejected default-on without measurement; tracked on #2921).
