---
'nexus-agents': patch
---

fix(deps): raise the `fast-uri` and `qs` override floors past six open advisories

Six open Dependabot alerts, four high and two moderate, across two transitive
packages:

| severity | package  | advisory       | first patched |
| -------- | -------- | -------------- | ------------- |
| high     | fast-uri | CVE-2026-75931 | 4.1.3         |
| high     | fast-uri | CVE-2026-75975 | 4.1.3         |
| high     | fast-uri | CVE-2026-75899 | 4.1.3         |
| high     | fast-uri | CVE-2026-76172 | 4.1.3         |
| moderate | qs       | CVE-2026-82562 | 6.16.0        |
| moderate | qs       | CVE-2026-82417 | 6.16.0        |

**Neither package is a new dependency, and that is the point.** Both were
already pinned in `pnpm.overrides` — `fast-uri: ">=3.1.2"` and
`qs: ">=6.15.2"` — floors added for _earlier_ advisories in the same packages.
A `>=` floor keeps resolving to whatever the tree wants above it, so once a new
advisory landed above the floor, the override went on looking like active
mitigation while mitigating nothing: resolution sat at `fast-uri 4.1.2` against
a required 4.1.3, and `qs 6.15.3` against a required 6.16.0. An override that
names a package you have an open alert for is easy to read as "handled."

Raised to `>=4.1.3` and `>=6.16.0`. Resolution verified after install rather
than assumed from the manifest:

```
fast-uri 4.1.4
qs 6.16.0
```

Both arrive through `@modelcontextprotocol/sdk` — `fast-uri` under `ajv` /
`ajv-formats`, `qs` under `express` and `body-parser` — so they are in the
runtime dependency graph of the published package, not dev-only. (`fast-uri`
also appears dev-only under `@commitlint/cli`; that copy is covered by the same
override.) Both bumps stay within their existing major, so no consumer contract
changes.

Only `package.json` and `pnpm-lock.yaml` change; no source is touched.
