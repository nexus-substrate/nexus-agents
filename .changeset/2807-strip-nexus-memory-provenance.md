---
'nexus-memory': patch
---

Remove `publishConfig.provenance: true` from the manifest. Manifest-level provenance enforcement blocked local bootstrap publishes because Sigstore signing requires an OIDC token (only available in CI/GitHub Actions). The `nexus-agents` Release workflow already sets `NPM_CONFIG_PROVENANCE: true` env-var, so Sigstore provenance attestation is preserved on every CI-driven publish — the manifest setting was redundant + harmful for the v0.1.0 bootstrap.

Refs #2807.
