---
'nexus-agents': patch
---

**fix:** two correctness bugs from the #2824 code-review audit. Closes #2862 and #2864.

**#2862 — `decomposeTask` crashed on markdown-fenced JSON.** The Orchestrator's `decomposeTask()` called `JSON.parse()` directly on the LLM response. LLMs routinely wrap the JSON array in a ` ```json … ``` ` fence; the fence made `JSON.parse` throw and `decomposeTask` silently fell back to heuristic decomposition — discarding the model's actual plan. It now strips the fence first via the existing `extractCodeBlock()` helper (the same path `parseJson()` already uses).

**#2864 — parallel tool calls dropped sibling outcomes on the first error.** `processToolCallsParallel()` used `Promise.all` (a single rejection aborts collection) and its reduction loop `return`ed on the first `stop-tool-error` outcome — so when one tool in a parallel batch failed, the turns from the _other_ tools (which ran fine) were never recorded in history. Now uses `Promise.allSettled` and drains _every_ outcome into `state.turns` before deciding to stop. A rejected promise (an unexpected escape from `invokeToolForParallel`'s own try/catch) is logged and treated as a stop signal without losing the siblings.

Tests: a markdown-fence decomposition test in `tech-lead.test.ts`, and a mid-batch-error parallel-drain test in `agentic-adapter.test.ts` asserting both tool turns are recorded.
