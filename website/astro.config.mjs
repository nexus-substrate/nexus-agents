// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
  site: 'https://williamzujkowski.github.io',
  base: '/nexus-agents',
  integrations: [
    starlight({
      title: 'Nexus Agents',
      description: 'Multi-agent orchestration MCP server with Byzantine consensus, intelligent routing, and research-backed protocols.',
      logo: {
        light: './src/assets/logo-light.svg',
        dark: './src/assets/logo-dark.svg',
        replacesTitle: false,
      },
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/williamzujkowski/nexus-agents' },
      ],
      editLink: {
        baseUrl: 'https://github.com/williamzujkowski/nexus-agents/edit/main/website/',
      },
      customCss: [
        './src/styles/custom.css',
      ],
      head: [
        {
          tag: 'meta',
          attrs: {
            property: 'og:image',
            content: 'https://williamzujkowski.github.io/nexus-agents/og-image.png',
          },
        },
      ],
      sidebar: [
        {
          label: 'Getting Started',
          items: [
            { label: 'Introduction', slug: 'getting-started/introduction' },
            { label: 'Quick Start', slug: 'getting-started/quick-start' },
            { label: 'Installation', slug: 'getting-started/installation' },
            { label: 'Configuration', slug: 'getting-started/configuration' },
          ],
        },
        {
          label: 'Architecture',
          items: [
            { label: 'Overview', slug: 'architecture/overview' },
            { label: 'Agent System', slug: 'architecture/agent-system' },
            { label: 'Consensus Protocols', slug: 'architecture/consensus-protocols' },
            { label: 'Routing System', slug: 'architecture/routing-system' },
            { label: 'Memory System', slug: 'architecture/memory-system' },
            { label: 'MCP Protocol', slug: 'architecture/mcp-protocol' },
            { label: 'Security', slug: 'architecture/security' },
          ],
        },
        {
          label: 'Guides',
          items: [
            { label: 'CLI Usage', slug: 'guides/cli-usage' },
            { label: 'MCP Integration', slug: 'guides/mcp-integration' },
            { label: 'Workflow Templates', slug: 'guides/workflow-templates' },
            { label: 'Debugging & Observability', slug: 'guides/debugging-observability' },
            { label: 'Troubleshooting', slug: 'guides/troubleshooting' },
          ],
        },
        {
          label: 'Development',
          items: [
            { label: 'Contributing', slug: 'development/contributing' },
            { label: 'Agent Development', slug: 'development/agent-development' },
            { label: 'Tool Development', slug: 'development/tool-development' },
            { label: 'Memory Development', slug: 'development/memory-development' },
          ],
        },
        {
          label: 'Research',
          items: [
            { label: 'Research Index', slug: 'research/research-index' },
            { label: 'Consensus Research', slug: 'research/consensus' },
            { label: 'Routing Research', slug: 'research/routing' },
            { label: 'Memory Research', slug: 'research/memory' },
            { label: 'Contributing Research', slug: 'research/contributing' },
          ],
        },
        {
          label: 'API Reference',
          autogenerate: { directory: 'api' },
        },
      ],
      tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 4 },
      lastUpdated: true,
    }),
  ],
});
