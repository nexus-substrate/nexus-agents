---
'nexus-agents': patch
---

chore(deps): minor + patch bumps across monorepo (closes #1987)

Safe minor/patch bumps only — no major-version changes in this batch.

**nexus-agents (runtime)**

- @ai-sdk/anthropic → 3.0.71
- @ai-sdk/google → 3.0.64
- @ai-sdk/openai → 3.0.53
- @google/genai → 1.50.1
- ai (Vercel AI SDK) → 6.0.168
- better-sqlite3 → 12.9.0
- typescript → 6.0.3

**nexus-agents (dev)**

- @changesets/cli → 2.31.0
- eslint → 10.2.1
- prettier → 3.8.3
- typescript-eslint → 8.58.2

**website**

- astro → 6.1.8
- @astrojs/svelte → 8.0.5
- svelte → 5.55.4

Excluded from this batch (need separate review):

- cspell 9.8.0 → 10.0.0 (major bump — tracked in #1988)
- ts-morph 27 → 28 (major bump)
- typescript 5 → 6 for nexus-agents-website (major bump)
- @anthropic-ai/sdk 0.88 → 0.90 (pre-1.0 — semver-minor treated as major)
