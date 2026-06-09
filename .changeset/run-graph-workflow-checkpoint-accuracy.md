---
'nexus-agents': patch
---

docs(run_graph_workflow): correct the checkpoint/resume description (#3767). The tool description claimed checkpoints persist "for inspection/restart", implying a caller-driven MCP resume that does not exist. Per a 7/7 higher_order consensus vote, the accurate framing: restore/resume lives in the graph EXECUTOR (`resumeFromCheckpoint` for HITL interrupts, `tryResumeFromCheckpoint` for crash recovery, `priorResults` selective-retry), but the `run_graph_workflow` MCP call is fire-and-forget with NO resume input and an in-memory (non-durable) checkpoint store. Exposing caller-driven resume + a durable backend is deferred to #3803 (no named cross-process consumer yet — capability-bias). Description-only; runtime/doc-table/tool-reference kept in lockstep.
