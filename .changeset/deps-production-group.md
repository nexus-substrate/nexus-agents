---
'nexus-agents': patch
---

chore(deps): bump the production-dependencies group (20 updates)

Includes `zod` 4.4.3 → 4.5.2, `@anthropic-ai/sdk` 0.120 → 0.122, `@google/genai`
2.18 → 2.19, the `@ai-sdk/*` trio, `ai` 6.0.261 → 6.0.271, `@ast-grep/napi`
0.45.1 → 0.45.2, and `@atproto/api` 0.20.41 → 0.20.42.

`api-surface.txt` moves by one line, and the change originates upstream rather
than here. `zod`'s `ZodType.apply` gained a variadic-args overload:

```
- apply<T>(fn: (schema: this) => T) => T
+ apply<T, TArgs extends unknown[] = []>(fn: (schema: this, ...args: TArgs) => T, ...args: TArgs) => T
```

`ZodType` is legitimately part of our surface — `validateToolInput(schema:
ZodType<T>, ...)` is published API, so a consumer's call is typed against it.
The gate flagged this correctly; it reports a change and leaves the semver call
to a human.

**Classified as non-breaking.** `TArgs` defaults to `[]` and the new parameters
are rest args, so every existing `apply(fn)` call still typechecks. This is an
additive widening for callers, not a narrowing.

Verified against the bumped tree, not assumed: `tsc --noEmit` clean and 28,833
tests pass across 1224 files.
