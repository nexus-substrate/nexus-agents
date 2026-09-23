---
'nexus-agents': patch
---

Removed three internal helpers that no production code called: the in-memory pipeline `CheckpointStore` (with `getCheckpointStore`, `resetCheckpointStore` and its `StageCheckpoint`, `CheckpointPort` and `CheckpointStoreOptions` types), the `orchestration/aorchestra/context-freshness` module (`isContextFresh`, `markContextVerified`, `getContextAge`, `DEFAULT_TTL_MS`, `ContextEntry`), and `groupByTopologicalWave`. Pipeline resume still goes through `saveStageCheckpoint`, and wave grouping through `groupByWave`. None of these were part of the published API surface, so nothing public changed.
