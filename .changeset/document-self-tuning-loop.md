---
'nexus-agents': patch
---

docs(tune): document the self-tuning loop and NEXUS_TUNE_ENFORCE (#3323)

Adds a `NEXUS_TUNE_ENFORCE` entry to CONFIGURATION.md (shadow default vs enforce,
the bounded-safety invariants, the `health` "Self-Tuning Demotions" telemetry,
and the opt-out) and a "The self-tuning loop (#3143)" architecture section in
EVENT_BUS_BOUNDARIES.md (producers → TuneStage → store → router, end-to-end,
replacing the stale shadow-only description). The last default-on exit criterion
from #3323.
