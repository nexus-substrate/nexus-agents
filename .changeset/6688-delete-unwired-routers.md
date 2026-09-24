---
'nexus-agents': patch
---

Removed two internal routing modules that no production path used: `AgreementCascadeRouter` (with `createAgreementCascadeRouter`, `createDefaultCascadeStages`, `AgreementCascadeConfigSchema`, `DEFAULT_CASCADE_CONFIG` and their types) and the `router-scoring` constants (`CAPABILITY_MATRIX`, `SCORING_WEIGHTS`, `SCORING_THRESHOLDS`). Routing goes through `CompositeRouter`, which never read either. Agreement-based early close for consensus votes lives in the consensus engine and is unchanged. Neither module was part of the published API surface.
