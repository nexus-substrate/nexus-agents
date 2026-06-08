---
'nexus-agents': patch
---

pipeline: thread the caller's real content-provenance trustTier into the consensus→execute policy snapshot (#3712)

`enforceConsensusExecutePolicy` previously fed an empty `pipelineState`, so the trust-tier rule always saw untrusted (tier 4) — block mode would have halted every dev-pipeline run. `DevPipelineOptions` now carries an optional `trustTier`; the MCP `run_dev_pipeline` handler and the `run` entry point thread the caller's real `RequestContext.trustTier` into it. This closes the run-path hole where a possibly-untrusted goal ran a real research stage with no tier. Trust here is content provenance, not caller identity: absence still fail-closes to tier 4. `NEXUS_POLICY_GATE_MODE=block` remains opt-in and is not enabled by this change.
