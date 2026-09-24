---
'nexus-agents': minor
---

`run_pipeline` now honors `timeoutMs`, and the vote stage gets a deadline sized for a full panel.

- `timeoutMs` is a deadline for EACH stage, not a budget for the whole run. It was accepted and never read. It now applies to every stage, the vote included, and is clamped to the `pipeline` operation-class guard.
- Without `timeoutMs`, the vote stage runs under the `multi-llm-panel` class guard (900 s, adjustable with `NEXUS_TIMEOUT_CLASS_MULTI_LLM_PANEL_MS` and `NEXUS_TIMEOUT_MULTIPLIER`). Previously it used the 120 s graph default, so a full 7-seat panel, which took 190 s live, always failed with `vote: Node timed out after 120000ms`. Other stages keep the 120 s default.
- The run as a whole was also cut off at 120 s, because the graph executor checks the same value before every stage. It is now bounded by the `pipeline` class guard. This also applies to the `run` entry point's pipeline and research strategies. Because a run can now last up to the `pipeline` class guard, a non-vote stage that runs past 120 s fails as a stage timeout instead of being cut off by the old 120 s whole-run limit.
- New optional API: `compilePipelineGraph(template, stages, { stageTimeoutMs })` and `GraphPipelineOptions.stageTimeoutMs`.
- The `quickMode` description now says "3 agents instead of 7". The panel has 7 seats, not 6.
