# nexus-memory

## 0.1.2

### Patch Changes

- [#2835](https://github.com/nexus-substrate/nexus-agents/pull/2835) [`86ccc72`](https://github.com/nexus-substrate/nexus-agents/commit/86ccc7299d3867aa92f995d6e8a349c33af43715) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **Addresses [#2832](https://github.com/nexus-substrate/nexus-agents/issues/2832) (part of epic [#2831](https://github.com/nexus-substrate/nexus-agents/issues/2831)).** chore(migrate): pre-transfer sweep for nexus-substrate org

  Updates CI workflows, package.json repository fields, MCP server identity (`mcpName` + `server.json`), CLI URLs, docs, and the TypeDoc config to reference the new `nexus-substrate` org. CI workflow owner refs use `${{ github.repository_owner }}` so they follow the repo wherever it lives.

  No behavior changes — this is metadata + string sweep ahead of `gh api -X POST repos/williamzujkowski/nexus-agents/transfer -f new_owner=nexus-substrate`. After transfer, npm trusted publishers for `nexus-agents` and `nexus-memory` need to be reconfigured on npmjs.com under the new repo path.

  Intentional keeps documented in the PR body ([#2835](https://github.com/nexus-substrate/nexus-agents/issues/2835)): personal maintainer @handle, contact email, GitHub Sponsors profile, website deploy URL, design-system refs, security-test fixtures, vulnerability-scanner-registry refs, non-migrating ECOSYSTEM.md links, CHANGELOG history, TypeDoc HTML output.

## 0.1.1

### Patch Changes

- [#2812](https://github.com/williamzujkowski/nexus-agents/pull/2812) [`c07a383`](https://github.com/williamzujkowski/nexus-agents/commit/c07a38373f7efcdd0f4d1315df17016433824d0a) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Remove `publishConfig.provenance: true` from the manifest. Manifest-level provenance enforcement blocked local bootstrap publishes because Sigstore signing requires an OIDC token (only available in CI/GitHub Actions). The `nexus-agents` Release workflow already sets `NPM_CONFIG_PROVENANCE: true` env-var, so Sigstore provenance attestation is preserved on every CI-driven publish — the manifest setting was redundant + harmful for the v0.1.0 bootstrap.

  Refs [#2807](https://github.com/williamzujkowski/nexus-agents/issues/2807).
