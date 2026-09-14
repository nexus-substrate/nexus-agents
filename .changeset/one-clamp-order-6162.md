---
'nexus-agents': patch
---

Every operation-class runaway guard now resolves in one order: the per-class override (or the declared default) is floored at 1000 ms, multiplied by `NEXUS_TIMEOUT_MULTIPLIER`, then clamped once to the class ceiling — 3600000 ms for a class that runs inside an MCP request, 7200000 ms for `async-job-body`. Before, a request-bound class clamped the override to 7200000 ms before the multiplier, so an operator who set, say, `NEXUS_TIMEOUT_CLASS_PIPELINE_MS=20000000` with `NEXUS_TIMEOUT_MULTIPLIER=0.25` got 1800000 ms and no startup report. That same configuration now resolves to the 3600000 ms ceiling, and the startup `had no effect` report names the override as the knob that asked for more. Every override at or below 7200000 ms, and every multiplier of 1 or above, resolves exactly as it did before; no guard can exceed its ceiling.
