---
'nexus-agents': minor
---

feat(pipeline): wire accumulated context into the run_pipeline research stage (#2795)

Closes the long-standing `#2795` TODO in `stage-wrappers.ts`: the research stage
of the `run_pipeline` MCP tool now prepends accumulated memory context
(beliefs, prior research, outcomes) to the task, completing the #2792 Phase-3
entry-point wiring for that path. Adds a shared `getContextPromptPrefix` helper
in `context-retriever.ts` that centralizes the `NEXUS_CONTEXT_RETRIEVER_INJECT`
rollout gate (default-off) and the fetch→summarize sequence reused by
orchestrate / execute_expert / stage-wrappers. Fail-soft and behavior-preserving
until the bake-in flips the flag on.
