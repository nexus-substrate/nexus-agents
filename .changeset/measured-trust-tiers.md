---
'nexus-agents': minor
---

The MCP server now records the transport it is connected over, so a stdio server measures its caller at trust tier 1 instead of reporting every request's tier as an unmeasured fallback (#6795). A transport the server cannot identify is not recorded, and its requests stay unmeasured.

The caller's tier no longer vouches for the task text. `run_dev_pipeline` and `run` take an optional `sourceTrustTier` (`'1'`–`'4'`, same meaning as `memory_write`'s) that declares where the task text came from. Omitted means `'3'` (untrusted). The dev-pipeline consensus→execute policy gate receives the least-trusted of the measured caller tier, the declared tier and every source the run fetched (research is `'3'`), so a declaration can lower trust but never raise it above the caller. With a stdio caller, `sourceTrustTier: '1'` and no fetched research, the gate now allows; any other combination escalates as before.

`memory_write` applies the same rule. With a measured caller, an omitted `sourceTrustTier` now means `'3'`, so an undeclared entry written over stdio is stored as tier 3. It is left out of privileged prompt prefixes unless `allowUntrustedMemory` is set. Declare `sourceTrustTier: '1'` for content you wrote yourself; the caller tier still caps it. An unmeasured caller behaves as before: the declared tier if given, otherwise unlabelled.

The gate's `pipelineState.trustProvenance` and a debug log record the declaration, the measured caller tier and whether the declaration was clamped. `orchestrate`'s V2 instrumentation gate now receives the task text's tier (`'3'`) rather than the caller's.

Library callers of `runDevPipeline` that pass `trustTier: '1'` must now also pass `sourceTrustTier: '1'` to reach the gate at tier 1. The unused internal `extractCallerInfo` helper is removed.
