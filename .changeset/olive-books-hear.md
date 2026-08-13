---
'nexus-agents': patch
---

Report `failed` when workflow steps or graph nodes failed (#4351, partial)

`run_workflow` and `run_graph_workflow` both hardcoded `status: 'completed'` once their runner returned. Neither runner signals overall success: `WorkflowResult` carries no success field at all — only per-step `status: 'success' | 'failed' | 'skipped'` — and the graph executor returns `ok()` even when nodes failed, because its `err()` paths cover checkpoint, validation, and timeout only.

So a run in which **every** step or node failed was surfaced to the caller as a completed workflow. That is the fail-closed gap #4351 reported from a live session where adapter capacity was exhausted: "the MCP orchestration surfaces can report a successful/complete outer job even when no model work completed".

Both now derive the reported status from what actually happened. Any failed step or node ⇒ `failed`; `skipped` is a deliberate control-flow outcome and does not fail a run; an empty step list is `failed`, since nothing ran.

`interrupted` graph nodes are deliberately **not** treated as failures — the executor signals interrupts separately via `halted`, and conflating the two would change interrupt semantics this change did not study.

This is the statically verifiable part of #4351. The issue's broader ask — representing exhausted adapter capacity in routing and explaining it in the result — remains open.
