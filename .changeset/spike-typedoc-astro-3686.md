---
---

chore: spike typedoc-plugin-markdown → Astro for one module (#3686)

Docs-tooling spike only — no runtime/`src` change, no release impact. Adds a
second TypeDoc config (`typedoc.markdown.json`) + `docs:api:md` script that emits
Markdown (with Astro-compatible frontmatter) for `src/core/result.ts` into the
`docs/api` Astro content collection. Proves the generation pipeline before the
full cutover (#3688).
