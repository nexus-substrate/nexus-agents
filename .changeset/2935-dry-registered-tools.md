---
'nexus-agents': patch
---

**chore(mcp):** kill the duplicate `REGISTERED_TOOLS` array.

Before: `cli-server-tools.ts:REGISTERED_TOOLS` and `mcp/tools/index.ts:REGISTERED_TOOL_NAMES` were two hand-maintained 38-entry arrays — both consumed by separate dispatch paths (allowlist log + `extractMcpTools` → `server.json`). Issue #2935 originally tracked them being out of sync; that drift was independently fixed but the duplication remained, ready to drift again.

Now: `REGISTERED_TOOL_NAMES` is the single source of truth (exported from `mcp/tools/index.ts`, re-exported through `mcp/index.ts`), and `cli-server-tools.ts` aliases it as `REGISTERED_TOOLS` for backwards compatibility with `tool-annotations.test.ts` and the `registerToolCategories` allowlist-status log. `inject-governance.ts:extractMcpTools` already reads the same canonical const, so server.json sync is unaffected. Closes #2935.

**Drive-by — registry-coverage gate hardening (#2406).** The v1 line-based detection in `scripts/check-registry-coverage.ts` fires when any added/removed diff line contains the marker token. Adding `export` to the marker const tripped the false-positive class the v1 docstring explicitly called out ("Comment-only touches that mention the marker would false-positive — acceptable for v1; promote to AST-based detection if the noise rate gets high"). Added a structural-equivalence exemption: when the marker line is touched, extract the array contents from the PR pre-image and the working tree and skip the violation if the sorted-deduped lists are identical. Conservative — any extraction failure falls back to v1 line-based detection rather than incorrectly skipping a real wiring miss.

Test contract change: the cli-server-tools test now compares the two arrays order-insensitively (sort-then-equal). The canonical const declares names in a different order than the legacy duplicate did, and the order has never been semantically meaningful — it's a name list, not a priority list.
