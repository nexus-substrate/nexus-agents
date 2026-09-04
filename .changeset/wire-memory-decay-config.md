---
'nexus-agents': patch
---

Wire the coordinated memory-decay knobs to `nexus-agents.yaml` (#5097 finding 2). `MemoryDecayManager` was constructed with a hardcoded `{}`, so all nine `MemoryDecayConfig` fields were permanently default and `enabled: false` was reachable only from a test. A new `memory.decay` section (validated: positive safe integers, `[0, 1]` thresholds, offending path named on failure) now reaches the manager via `configureToolMemory`, and the `MemoryDecayManager activated` startup line reports the effective value of every knob, read back from the manager. Defaults are unchanged.
