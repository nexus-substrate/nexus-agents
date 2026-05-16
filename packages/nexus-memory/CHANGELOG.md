# nexus-memory

## 0.1.1

### Patch Changes

- [#2812](https://github.com/williamzujkowski/nexus-agents/pull/2812) [`c07a383`](https://github.com/williamzujkowski/nexus-agents/commit/c07a38373f7efcdd0f4d1315df17016433824d0a) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Remove `publishConfig.provenance: true` from the manifest. Manifest-level provenance enforcement blocked local bootstrap publishes because Sigstore signing requires an OIDC token (only available in CI/GitHub Actions). The `nexus-agents` Release workflow already sets `NPM_CONFIG_PROVENANCE: true` env-var, so Sigstore provenance attestation is preserved on every CI-driven publish — the manifest setting was redundant + harmful for the v0.1.0 bootstrap.

  Refs [#2807](https://github.com/williamzujkowski/nexus-agents/issues/2807).
