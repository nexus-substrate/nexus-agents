---
'nexus-agents': patch
---

docs(site): render generated TypeDoc markdown as the website API reference (#3763)

Wires the generated TypeDoc markdown (JSDoc -> typedoc + typedoc-plugin-markdown,
spike #3686) into the website as a dedicated, rendered API-reference section.

- Add an `api` Astro content collection (website/src/content.config.ts) loading the
  committed generated markdown from `docs/api`, sharing the docs frontmatter schema.
- Add `website/src/pages/api/[...slug].astro` rendering the collection (with the
  generated `index` page mapped to the `/api/` section root).
- Exclude `api/**` from the `docs` collection so the API reference renders only under
  `/api/` instead of being lumped into `/docs/api/`.
- Run `docs:api:md` as the website `prebuild` so the markdown is regenerated before
  `astro build`.

Frontmatter compatibility was already solved at generation time: the existing
typedoc-plugin-frontmatter + scripts/typedoc-astro-title.mjs inject the `title`/
`description`/`tier` frontmatter the Astro collection schema expects.

Scope: the API surface stays scoped to the spike's single canonical entry point
(`src/core/result.ts`); expanding entry points across the 8740-export surface is a
follow-up.
