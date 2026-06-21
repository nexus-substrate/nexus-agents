---
---

docs(#3988): document that the `research` run-strategy intentionally aliases the `pipeline` engine

Comment-only clarification in `run-tool.ts` `buildDefaultExecutors`: the `research` strategy executor runs the same generic pipeline stage registry as `pipeline` (shaped by goal text, not a distinct research stage registry), matching the registry's research `entrypointTool` already pointing at `run_pipeline`. Corrects the overstated strategy-distinctness claim flagged in #3988; a real research-shaped registry is deferred as a no-consumer feature (YAGNI). No behavior change.
