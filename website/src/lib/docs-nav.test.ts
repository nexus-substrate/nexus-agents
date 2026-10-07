import { describe, expect, it } from 'vitest';
import {
  buildNav,
  pageSource,
  findNeighbors,
  findSection,
  pageTypeLabel,
  PRIMARY_SECTIONS,
  sectionFor,
  sectionIndexHref,
  sectionIntro,
  sectionLabel,
  sectionListing,
  sectionRouteCollisions,
  type NavPage,
} from './docs-nav.ts';

function page(partial: Partial<NavPage> & { id: string }): NavPage {
  return { href: `/docs/${partial.id}/`, title: partial.id, ...partial };
}

describe('sectionFor', () => {
  it('maps each diataxis value to its section', () => {
    expect(sectionFor(page({ id: 'a', diataxis: 'tutorial' }))).toBe('start');
    expect(sectionFor(page({ id: 'a', diataxis: 'how-to' }))).toBe('how-to');
    expect(sectionFor(page({ id: 'a', diataxis: 'reference' }))).toBe('reference');
    expect(sectionFor(page({ id: 'a', diataxis: 'explanation' }))).toBe('concepts');
    expect(sectionFor(page({ id: 'a', diataxis: 'none' }))).toBe('other');
  });

  it('puts a page with no diataxis value under Unsorted, not nowhere', () => {
    expect(sectionFor(page({ id: 'a' }))).toBe('unsorted');
  });

  it('lets audience: project win over the diataxis type', () => {
    expect(sectionFor(page({ id: 'a', diataxis: 'how-to', audience: 'project' }))).toBe('project');
    expect(sectionFor(page({ id: 'a', audience: 'project' }))).toBe('project');
  });
});

describe('buildNav', () => {
  it('returns no sections for no pages', () => {
    expect(buildNav([])).toEqual([]);
  });

  it('keeps every page, in section order, dropping empty sections', () => {
    const pages = [
      page({ id: 'u' }),
      page({ id: 'c', diataxis: 'explanation' }),
      page({ id: 't', diataxis: 'tutorial' }),
      page({ id: 'p', audience: 'project' }),
    ];
    const nav = buildNav(pages);
    expect(nav.map((s) => s.key)).toEqual(['start', 'concepts', 'project', 'unsorted']);
    expect(nav.flatMap((s) => s.pages).length).toBe(pages.length);
  });

  it('sorts by order, then pages without order, then by nav title', () => {
    const nav = buildNav([
      page({ id: 'z', title: 'Zebra', diataxis: 'how-to' }),
      page({ id: 'b', title: 'Beta', diataxis: 'how-to', order: 2 }),
      page({ id: 'a', title: 'Alpha', diataxis: 'how-to' }),
      page({ id: 'o', title: 'Omega', diataxis: 'how-to', order: 1 }),
      page({ id: 'n', title: 'Long title', navTitle: 'Aardvark', diataxis: 'how-to' }),
    ]);
    expect(nav[0]?.pages.map((p) => p.id)).toEqual(['o', 'b', 'n', 'a', 'z']);
  });

  it('places extra reference entries (the API index) in Reference', () => {
    const nav = buildNav([page({ id: 'r', title: 'Env vars', diataxis: 'reference' })], {
      reference: [page({ id: 'api', title: 'API reference', href: '/api/' })],
    });
    expect(nav[0]?.key).toBe('reference');
    expect(nav[0]?.pages.map((p) => p.id)).toEqual(['api', 'r']);
  });
});

describe('findSection / findNeighbors', () => {
  const nav = buildNav([
    page({ id: 'one', diataxis: 'tutorial', order: 1 }),
    page({ id: 'two', diataxis: 'tutorial', order: 2 }),
    page({ id: 'three', diataxis: 'tutorial', order: 3 }),
    page({ id: 'solo', diataxis: 'how-to' }),
  ]);

  it('finds the section holding a page by href', () => {
    expect(findSection(nav, '/docs/two/')?.key).toBe('start');
    expect(findSection(nav, '/docs/missing/')).toBeUndefined();
  });

  it('matches hrefs with or without a trailing slash', () => {
    expect(findSection(nav, '/docs/two')?.key).toBe('start');
  });

  it('gives prev and next within the section only', () => {
    expect(findNeighbors(nav, '/docs/two/')).toEqual({
      prev: expect.objectContaining({ id: 'one' }),
      next: expect.objectContaining({ id: 'three' }),
    });
    expect(findNeighbors(nav, '/docs/one/').prev).toBeUndefined();
    expect(findNeighbors(nav, '/docs/three/').next).toBeUndefined();
  });

  it('gives no neighbours in Unsorted or Other: their order is alphabetical, not a reading order', () => {
    const loose = buildNav([
      page({ id: 'x' }),
      page({ id: 'y' }),
      page({ id: 'n1', diataxis: 'none' }),
      page({ id: 'n2', diataxis: 'none' }),
    ]);
    expect(findNeighbors(loose, '/docs/x/')).toEqual({ prev: undefined, next: undefined });
    expect(findNeighbors(loose, '/docs/n1/')).toEqual({ prev: undefined, next: undefined });
  });

  it('gives no neighbours for a single-page section or an unknown page', () => {
    expect(findNeighbors(nav, '/docs/solo/')).toEqual({ prev: undefined, next: undefined });
    expect(findNeighbors(nav, '/docs/missing/')).toEqual({ prev: undefined, next: undefined });
  });
});

describe('pageTypeLabel', () => {
  it('names each type and says plainly when a page is unclassified', () => {
    expect(pageTypeLabel('how-to')).toBe('How-to guide');
    expect(pageTypeLabel('explanation')).toBe('Explanation');
    expect(pageTypeLabel('none')).toBe('Not a Diátaxis type');
    expect(pageTypeLabel(undefined)).toBe('Unclassified');
  });
});

describe('pageSource', () => {
  it('offers the GitHub edit URL for a hand-written doc', () => {
    expect(pageSource('../docs/guides/MCP_INTEGRATION.md')).toEqual({
      kind: 'edit',
      url: 'https://github.com/nexus-substrate/nexus-agents/edit/main/docs/guides/MCP_INTEGRATION.md',
    });
  });

  it('returns undefined for a path outside docs/ or no path at all', () => {
    expect(pageSource('src/pages/index.astro')).toBeUndefined();
    expect(pageSource(undefined)).toBeUndefined();
  });

  it.each([
    ['../docs/api/core/index.md', 'packages/nexus-agents/src (TypeDoc)'],
    ['../docs/reference/tools/consensus_vote.md', 'scripts/generate-tool-reference.ts'],
    ['../docs/reference/strategies/index.md', 'scripts/generate-strategy-reference.ts'],
    ['../docs/reference/capabilities.md', 'scripts/generate-repo-index.ts'],
    ['../docs/reference/environment.md', 'scripts/generate-env-reference.ts'],
    ['../docs/reference/cli.md', 'scripts/generate-cli-reference.ts'],
    ['../docs/research/RESEARCH_INDEX.md', 'scripts/update-research-index.ts'],
  ])('names the generator instead of an edit link for %s', (path, source) => {
    expect(pageSource(path)).toEqual({ kind: 'generated', source, partial: false });
  });

  it('marks files with generated blocks as partly generated, with no edit link', () => {
    expect(pageSource('../docs/ENTRYPOINTS.md')).toEqual({
      kind: 'generated',
      source: 'scripts/inject-governance.ts',
      partial: true,
    });
    expect(pageSource('../docs/interfaces/agent.md')).toEqual({
      kind: 'generated',
      source: 'scripts/generate-docs-content.ts',
      partial: true,
    });
  });

  it('matches a directory entry by prefix only, not a sibling with the same stem', () => {
    expect(pageSource('../docs/reference/tools-guide.md')?.kind).toBe('edit');
  });
});

describe('section index routes', () => {
  it('gives each primary section a stable slug under /docs/', () => {
    expect(PRIMARY_SECTIONS.map((key) => sectionIndexHref('/base', key))).toEqual([
      '/base/docs/start-here/',
      '/base/docs/how-to/',
      '/base/docs/reference/',
      '/base/docs/concepts/',
    ]);
  });

  it('reports a doc id that would shadow a section index route', () => {
    expect(sectionRouteCollisions(['reference/cli', 'guides/x'])).toEqual([]);
    expect(sectionRouteCollisions(['how-to', 'concepts/a', 'start-here'])).toEqual([
      'start-here',
      'how-to',
    ]);
  });

  it('reports no collisions for no docs', () => {
    expect(sectionRouteCollisions([])).toEqual([]);
  });
});

describe('sectionListing', () => {
  it('lists the classified pages of a section in nav order, not provisional', () => {
    const nav = buildNav([
      page({ id: 'getting-started/b', diataxis: 'tutorial', order: 2 }),
      page({ id: 'getting-started/a', diataxis: 'tutorial', order: 1 }),
      page({ id: 'getting-started/unclassified' }),
    ]);
    const listing = sectionListing(nav, 'start');
    expect(listing.provisional).toBe(false);
    expect(listing.pages.map((p) => p.id)).toEqual(['getting-started/a', 'getting-started/b']);
  });

  it('falls back to unclassified pages from the section directory, marked provisional', () => {
    const nav = buildNav([
      page({ id: 'guides/zeta', title: 'Zeta' }),
      page({ id: 'guides/alpha', title: 'Alpha' }),
      page({ id: 'architecture/routing' }),
      // Classified elsewhere or project-facing: never borrowed by the fallback.
      page({ id: 'guides/explained', diataxis: 'explanation' }),
      page({ id: 'guides/internal', audience: 'project' }),
    ]);
    const listing = sectionListing(nav, 'how-to');
    expect(listing.provisional).toBe(true);
    expect(listing.pages.map((p) => p.id)).toEqual(['guides/alpha', 'guides/zeta']);
  });

  it('stops falling back once one page in the section is classified', () => {
    const nav = buildNav([page({ id: 'guides/a' }), page({ id: 'guides/b', diataxis: 'how-to' })]);
    expect(sectionListing(nav, 'how-to')).toEqual({
      pages: [expect.objectContaining({ id: 'guides/b' })],
      provisional: false,
    });
  });

  it('is empty and not provisional when nothing is classified or guessable', () => {
    expect(sectionListing([], 'concepts')).toEqual({ pages: [], provisional: false });
    expect(sectionListing(buildNav([page({ id: 'ops/x' })]), 'concepts')).toEqual({
      pages: [],
      provisional: false,
    });
  });

  it('counts nav extras (the API index) as classified pages of their section', () => {
    const apiIndex = page({ id: 'api', title: 'API reference', order: 0 });
    const nav = buildNav([page({ id: 'reference/x' })], { reference: [apiIndex] });
    expect(sectionListing(nav, 'reference')).toEqual({ pages: [apiIndex], provisional: false });
  });
});

describe('sectionIntro / sectionLabel', () => {
  it('describes every primary section with a kicker and a one-line summary', () => {
    for (const key of PRIMARY_SECTIONS) {
      const intro = sectionIntro(key);
      expect(intro.kicker.length).toBeGreaterThan(0);
      expect(intro.summary.length).toBeGreaterThan(0);
    }
    expect(sectionIntro('start').kicker).toBe('Learning');
  });

  it('labels sections from the one SECTIONS table and rejects unknown keys', () => {
    expect(sectionLabel('start')).toBe('Start here');
    expect(sectionLabel('concepts')).toBe('Concepts');
    expect(() => sectionLabel('nope' as never)).toThrow(/unknown docs section/);
  });
});
