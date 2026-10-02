---
'nexus-agents': patch
---

The server no longer republishes pipeline events onto the V1 agent event bus. No production subscriber or history reader consumed their content; they only contributed to V1 emission statistics and in-memory history. The only visible change is lower V1 event counts in the shutdown log.

The public `createEventBusBridge`, `EventBusBridgeOptions`, and `PipelineBridgeResult` exports remain available but are deprecated under #5120. Subscribe to the pipeline event bus directly; removal is scheduled for the 9.0 batch (#6291).
