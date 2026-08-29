---
'nexus-agents': patch
---

fix(mcp): declare every key research_synthesize returns

Its `outputSchema` declared four of the six keys `SynthesisResult` returns —
`totalPapers`, `topicCount` and `featureGates` were emitted and undeclared. The
MCP SDK applies `additionalProperties: false` to a declared `outputSchema`, so a
client that validates structured content rejects the response with `-32602`.

The failure is client-dependent, not universal: the SDK `Client` validates and
fails; a permissive client succeeds, which is why the tool appeared to work.
Either way the schema misdescribed the response for anyone reading it.

`generatedAt` was declared and never produced; dropped rather than left as a
claim nothing supports.

The originating comment — "model the envelope only" — is not achievable under
`additionalProperties: false`, since declaring a subset is exactly what breaks.
Inner shapes stay `unknown`; it is the key set that must be complete.

`research_synthesize` also leaves the `KNOWN_UNSTRUCTURED` baseline in
`mcp-standalone-tools.test.ts`, and the #5008 envelope test moves to a real
error source — it had been using this tool's schema violation as its fixture,
so the bug was load-bearing for a passing test.
