---
'nexus-agents': patch
---

Land the low-risk tooling majors from #4478.

`eslint-plugin-jsdoc` 63 → 64, `lint-staged` 16 → 17, `@commitlint/{cli,config-conventional,types}` 20 → 21, `@changesets/changelog-github` 0.7 → 1.0, `turbo` 2.10.9 → 2.10.10.

Each was verified against the behaviour it gates rather than a green typecheck. commitlint was checked in **both** directions — it accepts a conforming message and still exits non-zero on a malformed one, since a linter that quietly stopped rejecting would pass a one-sided smoke test. `@changesets/changelog-github` v1 was confirmed to load under CLI v3 via `changeset status`, because it sits on the release path. `eslint-plugin-jsdoc` v64 — the bump most likely to flood the tree with new rule violations — produced zero across `packages/nexus-agents/src` and `packages/nexus-memory/src`.

No runtime dependencies touched. `pnpm audit` clean.
