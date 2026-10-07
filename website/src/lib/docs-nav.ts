/**
 * docs-nav.ts — navigation model for the docs site (#7199).
 *
 * Pure functions over plain page records, so the grouping and ordering rules
 * are unit-tested without Astro. DocsLayout.astro maps `getCollection('docs')`
 * entries onto `NavPage` and renders what these return.
 *
 * Grouping is by the Diátaxis frontmatter field; `audience: project` wins over
 * the type. A page with no `diataxis` value lands in "Unsorted" rather than
 * dropping out of the nav — the schema field is optional until the backfill
 * check (#7196) lands, and a page missing from the nav is unreachable.
 *
 * @module website/src/lib/docs-nav
 */

export const DIATAXIS_TYPES = ['tutorial', 'how-to', 'reference', 'explanation', 'none'] as const;
export type Diataxis = (typeof DIATAXIS_TYPES)[number];

export const AUDIENCES = ['user', 'project'] as const;
export type Audience = (typeof AUDIENCES)[number];

export interface NavPage {
  /** Collection entry id, unique within the nav. */
  id: string;
  /** Absolute href, base path included. */
  href: string;
  title: string;
  /** Short label for the rail; falls back to `title`. */
  navTitle?: string | undefined;
  diataxis?: Diataxis | undefined;
  audience?: Audience | undefined;
  order?: number | undefined;
}

export type SectionKey =
  'start' | 'how-to' | 'reference' | 'concepts' | 'project' | 'other' | 'unsorted';

export interface NavSection {
  key: SectionKey;
  label: string;
  pages: NavPage[];
}

/** Render order of the sections, and their labels. */
const SECTIONS: ReadonlyArray<{ key: SectionKey; label: string }> = [
  { key: 'start', label: 'Start here' },
  { key: 'how-to', label: 'How-to guides' },
  { key: 'reference', label: 'Reference' },
  { key: 'concepts', label: 'Concepts' },
  { key: 'project', label: 'Project' },
  // `diataxis: none` is a deliberate "this is not one of the four types"
  // (an index, a pointer page); it is not backfill debt, so it does not share
  // the Unsorted bucket.
  { key: 'other', label: 'Other pages' },
  { key: 'unsorted', label: 'Unsorted' },
];

const SECTION_BY_TYPE: Record<Diataxis, SectionKey> = {
  tutorial: 'start',
  'how-to': 'how-to',
  reference: 'reference',
  explanation: 'concepts',
  none: 'other',
};

export function sectionFor(page: NavPage): SectionKey {
  if (page.audience === 'project') return 'project';
  if (page.diataxis === undefined) return 'unsorted';
  return SECTION_BY_TYPE[page.diataxis];
}

export function navLabel(page: NavPage): string {
  return page.navTitle ?? page.title;
}

function comparePages(a: NavPage, b: NavPage): number {
  // Pages with an explicit order come first, ascending; the rest follow.
  const ao = a.order ?? Number.POSITIVE_INFINITY;
  const bo = b.order ?? Number.POSITIVE_INFINITY;
  if (ao !== bo) return ao < bo ? -1 : 1;
  return navLabel(a).localeCompare(navLabel(b), 'en');
}

/**
 * Group pages into sections. Empty input yields no sections; a section with
 * no pages is omitted rather than rendered as an empty heading.
 *
 * @param pages The published docs collection, as nav records.
 * @param extras Pages that live outside the docs collection but belong in a
 *   section (the API reference index, in Reference). They sort with the rest.
 */
export function buildNav(
  pages: readonly NavPage[],
  extras: Partial<Record<SectionKey, readonly NavPage[]>> = {}
): NavSection[] {
  const buckets = new Map<SectionKey, NavPage[]>();
  for (const page of pages) {
    const key = sectionFor(page);
    const bucket = buckets.get(key) ?? [];
    bucket.push(page);
    buckets.set(key, bucket);
  }
  for (const [key, extra] of Object.entries(extras) as Array<[SectionKey, readonly NavPage[]]>) {
    buckets.set(key, [...(buckets.get(key) ?? []), ...extra]);
  }
  const sections: NavSection[] = [];
  for (const { key, label } of SECTIONS) {
    const bucket = buckets.get(key);
    if (bucket === undefined || bucket.length === 0) continue;
    sections.push({ key, label, pages: [...bucket].sort(comparePages) });
  }
  return sections;
}

function withSlash(href: string): string {
  return href.endsWith('/') ? href : `${href}/`;
}

export function samePage(a: string, b: string): boolean {
  return withSlash(a) === withSlash(b);
}

export function findSection(nav: readonly NavSection[], href: string): NavSection | undefined {
  return nav.find((section) => section.pages.some((p) => samePage(p.href, href)));
}

export interface Neighbors {
  prev: NavPage | undefined;
  next: NavPage | undefined;
}

/** Sections whose order is alphabetical fallback, not an authored sequence. */
const UNORDERED_SECTIONS: ReadonlySet<SectionKey> = new Set(['other', 'unsorted']);

/**
 * Previous and next page within the current page's section only. Unsorted
 * and Other get none: "next" in an alphabetical bucket is not a reading order.
 */
export function findNeighbors(nav: readonly NavSection[], href: string): Neighbors {
  const section = findSection(nav, href);
  if (section === undefined || UNORDERED_SECTIONS.has(section.key)) {
    return { prev: undefined, next: undefined };
  }
  const index = section.pages.findIndex((p) => samePage(p.href, href));
  return { prev: section.pages[index - 1], next: section.pages[index + 1] };
}

const TYPE_LABELS: Record<Diataxis, string> = {
  tutorial: 'Tutorial',
  'how-to': 'How-to guide',
  reference: 'Reference',
  explanation: 'Explanation',
  none: 'Not a Diátaxis type',
};

/** The "Page type" line in the side rail. Absence is named, not hidden. */
export function pageTypeLabel(type: Diataxis | undefined): string {
  return type === undefined ? 'Unclassified' : TYPE_LABELS[type];
}

const EDIT_BASE = 'https://github.com/nexus-substrate/nexus-agents/edit/main/';

/**
 * Docs written by a generator, so an "Edit this page" link would send a reader
 * to a file that is overwritten on the next run. The one place this list
 * lives. An entry ending in `/` matches the directory; any other matches the
 * file exactly. `partial`: only marked blocks are generated, but an edit link
 * would still invite edits inside them.
 */
const GENERATED_DOCS: ReadonlyArray<{ path: string; source: string; partial: boolean }> = [
  { path: 'docs/api/', source: 'packages/nexus-agents/src (TypeDoc)', partial: false },
  { path: 'docs/reference/tools/', source: 'scripts/generate-tool-reference.ts', partial: false },
  {
    path: 'docs/reference/strategies/',
    source: 'scripts/generate-strategy-reference.ts',
    partial: false,
  },
  {
    path: 'docs/reference/capabilities.md',
    source: 'scripts/generate-repo-index.ts',
    partial: false,
  },
  {
    path: 'docs/research/RESEARCH_INDEX.md',
    source: 'scripts/update-research-index.ts',
    partial: false,
  },
  { path: 'docs/ENTRYPOINTS.md', source: 'scripts/inject-governance.ts', partial: true },
  { path: 'docs/interfaces/agent.md', source: 'scripts/generate-docs-content.ts', partial: true },
];

export type PageSource =
  { kind: 'edit'; url: string } | { kind: 'generated'; source: string; partial: boolean };

/**
 * Where a docs page's content comes from, from its collection `filePath`
 * (relative to website/, e.g. `../docs/guides/X.md`): a GitHub edit URL for a
 * hand-written page, the generator for a generated one, undefined when the
 * path is not under docs/.
 */
export function pageSource(filePath: string | undefined): PageSource | undefined {
  if (filePath === undefined) return undefined;
  const match = /(?:^|\/)(docs\/.+\.md)$/.exec(filePath);
  const repoPath = match?.[1];
  if (repoPath === undefined) return undefined;
  const generated = GENERATED_DOCS.find((g) =>
    g.path.endsWith('/') ? repoPath.startsWith(g.path) : repoPath === g.path
  );
  if (generated !== undefined) {
    return { kind: 'generated', source: generated.source, partial: generated.partial };
  }
  return { kind: 'edit', url: `${EDIT_BASE}${repoPath}` };
}
