import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import sitemap from '@astrojs/sitemap';
import { satteri } from '@astrojs/markdown-satteri';
import mdastRewriteLinks from './src/plugins/mdast-rewrite-links.ts';

export default defineConfig({
  site: 'https://nexus-substrate.github.io',
  base: '/nexus-agents',
  integrations: [svelte(), sitemap()],
  prefetch: true,
  markdown: {
    // Astro 7 replaced the remark/unified pipeline with Sätteri as the default
    // Markdown processor (#4359). `markdown.remarkPlugins` only works if the
    // legacy `@astrojs/markdown-remark` processor is pulled back in; the link
    // rewriter was ported to a native mdast plugin instead.
    processor: satteri({ mdastPlugins: [mdastRewriteLinks()] }),
  },
});
