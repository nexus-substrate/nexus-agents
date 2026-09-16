---
'nexus-agents': patch
---

Production-dependency ranges move (re-land of the #6268 group bump, reverted in #6272): `zod` `^4.5.4` → `^4.6.2` (resolves 4.6.5; adds `ZodType.validate`/`validateAsync` to the API surface, additive), `@anthropic-ai/sdk` `^0.123.0` → `^0.125.0`, `@google/genai` `^2.21.0` → `^2.22.0`, `@ai-sdk/anthropic` `^3.0.116` → `^3.0.117`, `@ai-sdk/google` `^3.0.121` → `^3.0.122`, `@ai-sdk/openai` `^3.0.107` → `^3.0.112`, `ai` `^6.0.276` → `^6.0.280`, `@atproto/api` `^0.20.42` → `^0.20.44`, `fast-check` `^4.9.0` → `^4.10.0`, `typedoc-plugin-frontmatter` `1.3.1` → `1.3.2`. Dev tooling in the same group: `typescript-eslint` 8.70.0 (its new `no-generated-empty-object-type` rule is satisfied — `GuardResult`'s default payload type is now `unknown` instead of `Record<never, never>`, which resolves to the same `{ readonly ok: true }` for payload-free guards), `@types/node` ^25.9.6, `cspell` ^10.3.0, `eslint-plugin-jsdoc` ^64.3.9, `knip` ^6.35.1, `lint-staged` ^17.5.1.
