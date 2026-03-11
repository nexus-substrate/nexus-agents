import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const docs = defineCollection({
  loader: glob({
    pattern: '**/*.md',
    base: new URL('../../docs', import.meta.url),
  }),
  schema: z
    .object({
      title: z.string().optional(),
      description: z.string().optional(),
      tier: z.number().optional(),
      keywords: z.array(z.string()).optional(),
      related_files: z.array(z.string()).optional(),
    })
    .passthrough(),
});

export const collections = { docs };
