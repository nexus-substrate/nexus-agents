import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import remarkRewriteLinks from './src/plugins/remark-rewrite-links.ts';

export default defineConfig({
  site: 'https://williamzujkowski.github.io',
  base: '/nexus-agents',
  integrations: [svelte()],
  markdown: {
    remarkPlugins: [remarkRewriteLinks],
  },
});
