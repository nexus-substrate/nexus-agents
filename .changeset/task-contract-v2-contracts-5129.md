---
'nexus-agents': minor
---

feat(pipeline): extend versioned task, capability and evidence contracts (#5129 / Task T05)

- Added `EnforcementModeSchema`, `CapabilityRequirementSchema`, `EvidenceObligationSchema`, and `EvidenceReceipt`
- Added `checkContractCompatibility` using installed `semver` dependency with fail-closed validation on malformed, unversioned (when strict), or out-of-range versions (Conformance Case C35: legacy client enforcing downgrade / schema version gateway)
- Added `validateObligationCompleteness` requiring exact `obligationId` and `artifactRef` matching for receipts (Conformance Case C06: evidence verification)
- Added `detectMissingCapabilities` matching required operations against available capabilities
