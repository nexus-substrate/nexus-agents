import { glob, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter } from 'astro/markdown';
import { z } from 'astro/zod';
import { describe, expect, it } from 'vitest';
import {
  AUDIENCES,
  DIATAXIS_TYPES,
  buildNav,
  type NavPage,
  type NavSection,
} from './docs-nav.ts';

const docsRoot = fileURLToPath(new URL('../../../docs/', import.meta.url));
const navFrontmatter = z.object({
  title: z.string().optional(),
  nav_title: z.string().optional(),
  audience: z.enum(AUDIENCES).optional(),
  diataxis: z.enum(DIATAXIS_TYPES).optional(),
  order: z.number().optional(),
});

/** Source paths are stable fixture IDs; this check concerns nav inclusion, not route slugs. */
async function publishedPages(): Promise<NavPage[]> {
  const pages: NavPage[] = [];
  for await (const path of glob('**/*.md', { cwd: docsRoot, exclude: ['api/**'] })) {
    const { frontmatter } = parseFrontmatter(await readFile(`${docsRoot}/${path}`, 'utf8'));
    const data = navFrontmatter.parse(frontmatter);
    // Match the title requirement used by getPublishedDocs and the docs route.
    if (!data.title) continue;
    pages.push({
      id: path,
      href: `/nexus-agents/docs/${path}/`,
      title: data.title,
      navTitle: data.nav_title,
      audience: data.audience,
      diataxis: data.diataxis,
      order: data.order,
    });
  }
  return pages;
}

function assertReachable(pages: readonly NavPage[], nav: readonly NavSection[]): void {
  const required = pages.filter((page) => page.audience !== 'project');
  expect(required.length, 'Reachability is unmeasured: no published user docs').toBeGreaterThan(0);
  const hrefs = new Set(nav.flatMap((section) => section.pages.map((page) => page.href)));
  const unlinked = required.filter((page) => !hrefs.has(page.href)).map((page) => page.id);
  expect(unlinked, 'Published user docs must be linked from the generated nav').toEqual([]);
}

function page(id: string, audience?: NavPage['audience']): NavPage {
  return { id, href: `/nexus-agents/docs/${id}/`, title: id, audience };
}

describe('published docs reachability gate', () => {
  it('links every real published user or unclassified-audience doc in the generated nav', async () => {
    const pages = await publishedPages();
    assertReachable(pages, buildNav(pages));
    console.info(`Reachability: ${pages.filter((page) => page.audience !== 'project').length} reader docs checked (${pages.length} published docs).`);
  });

  it('fails when no pages were measured', () => {
    expect(() => assertReachable([], [])).toThrow(/unmeasured/i);
  });

  it('fails when all pages are outside the measured audience', () => {
    const pages = [page('internal', 'project')];
    expect(() => assertReachable(pages, buildNav(pages))).toThrow(/unmeasured/i);
  });

  it.each([undefined, 'user'] as const)('fails when a published %s-audience page is omitted', (audience) => {
    expect(() => assertReachable([page('orphan', audience)], [])).toThrow(/orphan/);
  });

  it('allows project pages to be outside the reader reachability requirement', () => {
    const reader = page('reader', 'user');
    assertReachable([reader, page('internal', 'project')], buildNav([reader]));
  });
});
