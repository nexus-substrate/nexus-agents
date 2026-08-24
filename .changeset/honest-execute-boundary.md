---
'nexus-agents': patch
---

docs(pipeline): stop the core plugins and the v2 gate claiming capability they do not have

The three core pipeline plugins each advertised real behaviour they have never
had. `nexus:model-router` described itself as "Routes tasks to optimal model via
Budget→TOPSIS→LinUCB pipeline"; it is built by `createCorePlugin`, whose handler
returns `{ stub: true }` and routes nothing. Real routing is the V1 path. The
task-analyzer and cli-executor descriptions were wrong the same way.

That mattered beyond documentation. The v2-delegate entry policy gate guards
`route-model`, backed by that stub, inside a pipeline the delegate tool runs
fire-and-forget as `instrumentV2Pipeline`. The gate emits `policy.evaluated` on
every run and always allows, which reads in the #3653 autonomy soak as "policy
enforced at the stage boundary, no violations" — reassuring telemetry about a
boundary that does nothing.

The gate machinery itself is fine: `plan-compiler.test.ts` already proves a gate
in front of an `execute`-typed stage throws `PolicyBlockedError` in block mode.
What is missing is a production plan that gives it something to deny, and that
is now an asserted fact rather than something to rediscover — tests pin that the
guarded stage is `route`-typed, that no production stage is `execute`-typed, and
that the backing plugin is still a skeleton.

No behaviour change. `v2-orchestrate`'s `checkPipelinePolicy(task, 'execute')`
keeps its literal deliberately: passing the accurate stage type would make the
rule allow, removing a fail-closed refusal on untrusted input in exchange for
nothing but an accurate label. Its comment now states what a denial there does
and does not prove.
