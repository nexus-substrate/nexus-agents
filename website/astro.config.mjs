import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';

export default defineConfig({
  site: 'https://williamzujkowski.github.io',
  base: '/nexus-agents',
  integrations: [svelte()],
});
