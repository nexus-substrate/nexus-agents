import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

// Shared frontmatter schema. The generated TypeDoc markdown (docs/api) carries the
// same title/description/tier frontmatter as the hand-written docs (injected by
// scripts/typedoc-astro-title.mjs + typedoc-plugin-frontmatter), so both
// collections accept it. `looseObject` keeps any extra typedoc frontmatter.
const docSchema = z.looseObject({
  title: z.string().optional(),
  description: z.string().optional(),
  tier: z.number().optional(),
  keywords: z.array(z.string()).optional(),
  related_files: z.array(z.string()).optional(),
});

const docs = defineCollection({
  loader: glob({
    // Exclude the generated API reference (docs/api) — it has its own `api`
    // collection + /api route so it renders as a dedicated section rather than
    // being lumped under /docs.
    pattern: ['**/*.md', '!api/**'],
    base: new URL('../../docs', import.meta.url),
  }),
  schema: docSchema,
});

// Generated TypeDoc markdown (JSDoc -> typedoc + typedoc-plugin-markdown).
// Produced by `pnpm -C packages/nexus-agents docs:api:md` into docs/api, which is
// committed (matching the docs/reference generated-files convention). Rendered by
// website/src/pages/api/[...slug].astro.
const api = defineCollection({
  loader: glob({
    pattern: '**/*.md',
    base: new URL('../../docs/api', import.meta.url),
  }),
  schema: docSchema,
});

export const collections = { docs, api };
