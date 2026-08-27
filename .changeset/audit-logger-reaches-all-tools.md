---
'nexus-agents': patch
---

fix(mcp): the policy audit emit was unreachable for 38 of 44 tools

`secure-handler.ts:261` records a policy decision only when
`config.auditLogger` is present. `buildStandardDeps` gated that logger on
`toolName === 'run_dev_pipeline'`, which was correct when #3710 wrote it — that
was then the only tool consuming a durable audit logger.

#4987 changed the premise: the MCP `PolicyFirewall` now evaluates rules on
**every** tool. The gate was never revisited, so for the 38 tools registered
through `standardHandler`, a policy denial could not reach the audit chain — in
enforce mode or in warn. Five tools with bespoke registration (`execute_expert`,
`consensus_vote`, `pr_review`, `run`, `orchestrate`) already received it.

The logger is now threaded whenever the server has one. This emits nothing on
its own; it makes an existing emit reachable.

Prerequisite for #4991 and therefore for #4988 — the warn-mode soak that
decision rests on could not produce durable evidence while the emit was
unreachable for most of the surface.
