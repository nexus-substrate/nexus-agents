---
'nexus-agents': patch
---

chore(deps): bump `@google/genai` from 1.52 to 2.x (#4045)

Dependency `@google/genai` majors 1.x→2.x. The 2.x breaking changes are
Interactions-API-only and do not touch our `models.generateContent`,
`generateContentStream`, `models.list`, or `countTokens` usage
(upstream-guaranteed: "GenerateContent usage is unaffected"). No code
migration required — the adapter layer (`gemini-adapter.ts`,
`gemini-types.ts`) and `token-counter.ts` compile and pass unchanged.

Classified as a patch because the actual API-surface risk to this package
is nil. Node engines are satisfied (2.x requires >=20; this repo targets
22). This does NOT resolve the separate `node-domexception` transitive
fetch-blob edge.
