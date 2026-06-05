---
'nexus-agents': patch
---

test(sdk): de-flake the "missing AI SDK export" cases (#3449)

The two `SdkAdapter` "missing generateObject/jsonSchema export" tests used
`vi.doMock('ai')` + `vi.resetModules()` to simulate a partial module, which leaked
module-registry state across the parallel suite and intermittently failed CI on
unrelated PRs. `extractAiSdkFunctions` is now exported and the cases are
unit-tested directly with hand-built partial module objects (table-driven via
`it.each`) — no global mock mutation, fully hermetic.
