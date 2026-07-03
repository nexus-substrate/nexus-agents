---
'nexus-agents': patch
---

Vestigial cleanup (#4177): remove dead one-shot harness `scripts/e2e-memory-validation.ts` (hardcoded pre-move absolute import path), delete five verified-dead barrel files (`src/exports/index.ts`, `src/scm/index.ts`, `src/security/index.ts`, `src/security/firewall/index.ts`, `src/benchmarks/index.ts`), and remove the never-used `allowSyntheticVote` option and `createFallbackVote` keyword-sniffing fallback from vote parsing — `parseVoteResponse` is now unconditionally fail-closed (throws `SyntheticVoteError` on unparseable output, as it already did by default). `createQaGate` is kept (it is the factory for `dispatchWorkers`' `asyncQualityGate` option) with its verdict mapping now pinned by tests. Orphan allowlist: rationale for the `**/index.ts` glob corrected and `scripts/typedoc-astro-title.mjs` (loaded via `typedoc.markdown.json`) added to `specific_files`. No public package export surface (`src/index.ts`) changes.
