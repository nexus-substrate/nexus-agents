---
'nexus-agents': patch
'nexus-memory': patch
---

**Addresses #2832 (part of epic #2831).** chore(migrate): pre-transfer sweep for nexus-substrate org

Updates CI workflows, package.json repository fields, MCP server identity (`mcpName` + `server.json`), CLI URLs, docs, and the TypeDoc config to reference the new `nexus-substrate` org. CI workflow owner refs use `${{ github.repository_owner }}` so they follow the repo wherever it lives.

No behavior changes — this is metadata + string sweep ahead of `gh api -X POST repos/williamzujkowski/nexus-agents/transfer -f new_owner=nexus-substrate`. After transfer, npm trusted publishers for `nexus-agents` and `nexus-memory` need to be reconfigured on npmjs.com under the new repo path.

Intentional keeps documented in the PR body (#2835): personal maintainer @handle, contact email, GitHub Sponsors profile, website deploy URL, design-system refs, security-test fixtures, vulnerability-scanner-registry refs, non-migrating ECOSYSTEM.md links, CHANGELOG history, TypeDoc HTML output.
