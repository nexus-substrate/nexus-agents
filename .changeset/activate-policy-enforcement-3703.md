---
'nexus-agents': patch
---

feat(pipeline): activate #3177 stage-boundary policy enforcement in production (default WARN, #3703)

The v2-delegate pipeline now compiles with a real policy gate (`gate-delegate-entry`)
on the START boundary before the route stage, and supplies a **default-WARN**
`policyEnforcement` bundle into its own compile call. Stage-boundary policy is now
actually evaluated in production: WARN mode logs + emits one `policy.evaluated` event
per violation and never throws or blocks, generating the autonomy-soak evidence #3653
needs. Block mode stays opt-in via `NEXUS_POLICY_GATE_MODE=block`.

The shared `compilePlan` / `PlanCompileOptions` default is unchanged — enforcement is
threaded only from v2-delegate's compile call, so every other `compilePlan` caller is
unaffected (gates remain no-op passes). The plan compiler also now interposes an entry
gate (`afterStage === START`) on the START edge of a no-dependency stage.
