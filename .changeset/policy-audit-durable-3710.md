---
'nexus-agents': patch
---

Durably persist pipeline policy events (#3710). The dev-pipeline
consensus→execute gate now dual-emits each `policy.evaluated` decision: the
in-memory `IEventBus` → `TraceWriter` emit is unchanged (back-compat,
observability-only), and when the MCP server's durable `auditLogger` is threaded
it ALSO appends one hash-chained `policy_gate` record per violation carrying the
enforcement `mode` (warn=soak vs block=enforce), `ruleIds`, and `stageType`. The
durable record is the canonical source for tune/readiness aggregation and
survives process exit; `trace.jsonl` stays per-run observability and must not be
summed with it. The pure-CLI path threads no logger, so its behavior is
unchanged.
