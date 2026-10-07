import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import sitemap from '@astrojs/sitemap';
import { satteri } from '@astrojs/markdown-satteri';
import pagefind from 'astro-pagefind';
import { createCssVariablesTheme } from 'shiki';
import mdastRewriteLinks from './src/plugins/mdast-rewrite-links.ts';
import hastWrapTables from './src/plugins/hast-wrap-tables.ts';
import hastTaskListStatus from './src/plugins/hast-task-list-status.ts';
import hastAlerts from './src/plugins/hast-alerts.ts';
import hastStripRepoBreadcrumb from './src/plugins/hast-strip-repo-breadcrumb.ts';
import hastSummaryBox from './src/plugins/hast-summary-box.ts';
import hastProcessList from './src/plugins/hast-process-list.ts';

// Code colors come from remarque's --color-syntax-* palette tokens, so they
// follow the light/dark toggle. Pass the theme OBJECT, not the
// 'css-variables' string: Astro renames the string form's prefix to
// --astro-code-*, which silently breaks the mapping (remarque REMARQUE.md,
// "Astro / Shiki wiring"). The `.astro-code` bridge block in
// src/styles/docs.css maps Shiki's token-* names onto the palette slots.
const remarqueShikiTheme = createCssVariablesTheme({
  name: 'remarque',
  variablePrefix: '--color-syntax-',
  fontStyle: true,
});

export default defineConfig({
  site: 'https://nexus-substrate.github.io',
  base: '/nexus-agents',
  // pagefind indexes dist/ in astro:build:done; only pages carrying
  // data-pagefind-body (the docs and API pages) are indexed.
  integrations: [svelte(), sitemap(), pagefind()],
  prefetch: true,
  markdown: {
    // Astro 7 replaced the remark/unified pipeline with Sätteri as the default
    // Markdown processor (#4359). `markdown.remarkPlugins` only works if the
    // legacy `@astrojs/markdown-remark` processor is pulled back in; the link
    // rewriter was ported to a native mdast plugin instead.
    processor: satteri({
      mdastPlugins: [mdastRewriteLinks()],
      // Page patterns (#7285): alert callouts, labelled stacking tables, the
      // repo-breadcrumb strip, the how-to summary box and the tutorial
      // process list. The last two read the page's frontmatter.
      hastPlugins: [
        hastTaskListStatus(),
        hastWrapTables(),
        hastAlerts(),
        hastStripRepoBreadcrumb(),
        hastSummaryBox(),
        hastProcessList(),
      ],
    }),
    shikiConfig: { theme: remarqueShikiTheme },
  },
});
