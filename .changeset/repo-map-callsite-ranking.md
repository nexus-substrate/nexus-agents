---
'nexus-agents': minor
---

repo-map: rank by real call-site edges from `search_usages` (#4268, epic #4251)

The repo-map context provider (`context/repo-map.ts`, behind default-off
`NEXUS_REPO_MAP`) now blends import-graph PageRank with a real **call-site
frequency** signal, so ranking surfaces modules that are actually _called_, not
just imported. The signal reuses the `search_usages` ast-grep machinery shipped
in #4265 (extracted to the shared `indexer/usage-ast.ts` — no duplication, no
new dependency) via a single-parse-per-file, top-N-bounded pass
(`context/repo-map-callsites.ts`). The stale "import-graph only, no call-site
data" caveat is replaced with an honest note about the remaining
structural/syntactic limitation (dynamic dispatch, computed/string-keyed calls,
same-named members). Default stays OFF; flag-off output is byte-for-byte
unchanged. Flipping the default to ON (#4262) remains out of scope.
