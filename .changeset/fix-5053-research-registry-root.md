---
'nexus-agents': patch
---

Research tools resolve the registry from the workspace/repo root, not cwd (#5053).

`getProjectRoot()` and the four registry load/save helpers in `cli/research-helpers-io.ts` defaulted to `process.cwd()`, and no MCP caller passed `rootDir`, so the six `research_*` tools read and wrote a different `docs/research/registry` depending on where the server was started — a server launched inside `packages/nexus-agents` scaffolded and consulted an empty shadow registry there. The new `resolveRegistryRoot(rootDir?)` resolves once per process: an explicit `rootDir` wins; otherwise the nearest ancestor of the active MCP workspace root (or cwd) that already contains `docs/research/registry`; otherwise the enclosing git repo root; otherwise cwd with a single warning. `research_query` stats, the research index commands, and the first-run scaffold (#2470) all anchor at that root. The committed shadow registry under `packages/nexus-agents/docs/research/registry` is removed and a ratchet test asserts the repo holds exactly one registry, at the root.
