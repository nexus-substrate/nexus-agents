---
'nexus-agents': patch
---

Take the supported-extension list from one place (#4640)

`codebase-search.ts` hardcoded its own copy of `['.ts','.tsx','.js','.jsx']`
while `symbol-extractor.ts` exports `SUPPORTED_EXTENSIONS` — whose JSDoc says it
is exported to be the single source.

The copies were not merely redundant: they sat on opposite sides of the same
decision. `extract_symbols` reaches the extension gate at
`symbol-extractor.ts:162`, while the `search_codebase` sweep filters _before_ it.
So adding a language to `SUPPORTED_EXTENSIONS` taught `extract_symbols` to parse
it while `search_codebase` silently indexed none of it — no error, just an index
quietly missing a language.

Adds a test that fails when the lists diverge, since a shared constant alone
cannot prevent someone reintroducing a local copy. Verified red/green: with a
fifth extension added to the canonical list the test fails before the fix and
passes after.
