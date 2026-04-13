---
'nexus-agents': patch
---

Fix install-time crash by adding `typescript` to runtime dependencies (#1841).

`src/indexer/symbol-extractor.ts` imports `typescript` directly (used by `ts-morph` internals), but the dep was missing from the published 2.29.0 bundle. Anyone running `npm install -g nexus-agents` or `npx -y nexus-agents --mode=server` (the marketplace install path) hit `ERR_MODULE_NOT_FOUND: typescript` on first invocation, blocking all Claude Code plugin installs.

Also adds Docker-based pre-publish smoke testing (`Dockerfile.npm-verify` + `scripts/verify-npm-install.sh` + `.github/workflows/npm-verify.yml`) so the same regression cannot reach npm again. The 6-phase smoke runs on every PR touching `package.json` or `src/`, packs the source tarball, installs it in a clean container, and verifies the binary works + MCP stdio handshake returns 30 tools.
