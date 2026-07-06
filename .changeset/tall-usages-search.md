---
'nexus-agents': minor
---

feat(mcp): add `search_usages` — ast-grep structural usage/call-site search (#4265, epic #4249 Child A)

New read-only MCP tool `search_usages` returns structural usage/call-site matches
for a symbol (calls `foo()`, member calls `obj.foo()`, `new Foo()`, imports, and
bare references) with `file:line:column` + snippet — the gap `search_codebase`
cannot fill (it indexes declared symbol NAMES only). Backed by `@ast-grep/napi`
(pinned `0.44.1`, MIT, Rust + tree-sitter). Excludes the declaration itself and
is syntactic (not type-aware); the ts-morph symbol extractor is unchanged and
remains the type-checker-aware declaration index. Output is capped (default 50,
overridable to 500) with overflow reported, never silently dropped.
