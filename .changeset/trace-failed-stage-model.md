---
'nexus-agents': patch
---

`query_trace` can now attribute a failed stage to the model that ran it.
`agent-executor` emits `stage.failed` with `model` (#4194) and
`ExecutionTraceEntry` has had a `modelId` field for it, but
`extractStageAttribution` re-packed the record without it, so the attribution
the emitter supplied reached no reader.
