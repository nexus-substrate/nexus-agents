---
'nexus-agents': patch
---

Drop the dead `model.called` branch from the EventBus→OutcomeStore feedback subscriber (#3179). The bridge now subscribes to `stage.failed` only — its sole event with a producer. `model.called` was in the event vocabulary (#912) with consumers here and in trace-writer (#952), but no code ever emitted it, so the branch never fired; had a producer been added it would have double-counted against the cli-attributed outcomes `agent-executor.recordOutcome()` already writes directly. The `ModelCalledEvent` type and trace-writer handler are retained as valid vocabulary. Emitting `model.called` with real model/token attribution (the originally-intended #952 observability) is tracked in #3387. Also corrects the now-stale "auto-feedback never wired" framing of #3179 — #2938 already auto-wires the subscriber at server startup.
