---
'nexus-agents': patch
---

**chore(deps):** bump qs override to ≥6.15.2 to close GHSA-q8mj-m7cp-5q26 (Dependabot alert 102).

`qs.stringify` with `arrayFormat: 'comma'` and `encodeValuesOnly: true` throws `TypeError` on `null`/`undefined` array elements (CVE-2026-8723, medium-severity DoS). Patched in qs 6.15.2.

Transitive via `@modelcontextprotocol/sdk` → `express` → `body-parser` → `qs` (and via `express-rate-limit`). The existing `qs: ">=6.14.2"` pnpm override admitted the vulnerable 6.15.1; bumped to `>=6.15.2`. `pnpm install` now resolves every qs site to 6.15.2.

We don't pass `arrayFormat: 'comma'` + `encodeValuesOnly: true` from this codebase, so the practical impact was bounded — but transitive npm deps can change call patterns silently, and a patch-level pnpm-override bump is cheap.
