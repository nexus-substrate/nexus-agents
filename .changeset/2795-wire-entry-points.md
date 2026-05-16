---
'nexus-agents': minor
---

**Closes #2795. Phase 3 of #2792 (cross-cutting memory access).**

Wires `getContextForTask` into three high-leverage entry points so every task starts informed by accumulated memory:

- **`CompositeRouter.route`** — consults the unified context before routing; stashes the result on `lastUnifiedContext` for observability. Fire-and-forget for now; later phases plumb the signal into routing stages.
- **`orchestrate` MCP tool** — fetches context at the top of `runOrchestratePipeline`, logs the shape. When `NEXUS_CONTEXT_RETRIEVER_INJECT=1`, stashes `priorMemorySummary` on `input.context` for downstream stages.
- **`executeGraph`** — fetches context at graph start, stashes the typed `UnifiedContext` under `state[GRAPH_UNIFIED_CONTEXT_KEY]` so node implementations can consume it without a second fetch.

All three call sites are best-effort: failure to read memory never blocks the work.

Two new helpers:

- `inferTaskCategory(task)` — keyword-based fallback mapper from free-text to `TaskCategory`. Used by the entry-point wiring when the caller doesn't carry a structured category. Returns `'exploration'` when nothing matches.
- `summarizeContextForPrompt(ctx)` — compact human-readable rendering for prepending to system prompts. Skips empty sections so the prefix never wastes tokens on "no signal."

Both exported from `nexus-agents` via `context/index.ts`.

14 new tests cover the helpers; the wiring is exercised by the existing 569 entry-point tests passing without regression. Phase 5 (#2797) populates `priorStrategies`; Phase 6 (#2798) feeds more signal into the substrate.
