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
  /** Frontmatter description, shown on section index pages. */
  description?: string | undefined;
  /** Short label for the rail; falls back to `title`. */
  navTitle?: string | undefined;
  diataxis?: Diataxis | undefined;
  audience?: Audience | undefined;
  order?: number | undefined;
}

export type SectionKey =
  'start' | 'how-to' | 'reference' | 'concepts' | 'project' | 'other' | 'unsorted';

/** A labelled run of pages inside a section (Reference only, today). */
export interface NavGroup {
  key: string;
  label: string;
  pages: NavPage[];
}

export interface NavSection {
  key: SectionKey;
  label: string;
  /** Every page of the section, in reading order (the groups' order when grouped). */
  pages: NavPage[];
  /** Sub-groups, when the section is long enough to need them. */
  groups?: NavGroup[];
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

/**
 * Words a sentence-case pass must not lowercase: product and vendor names,
 * months. Words with internal capitals (OpenAI, GitHub), all-caps acronyms
 * (MCP, CLI) and code names (consensus_vote) are kept by shape, not listed.
 */
const PROPER_WORDS: ReadonlySet<string> = new Set([
  'Azure',
  'Bedrock',
  'Claude',
  'Codex',
  'Docker',
  'Gemini',
  'Linux',
  'Node',
  'Vertex',
  'Windows',
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]);

/** Multi-word names whose later words are capitalized too. */
const PROPER_PHRASES: ReadonlyArray<readonly [string, string]> = [
  ['Claude', 'Code'],
  ['Claude', 'Desktop'],
  ['Nexus', 'Agents'],
];

/** A plain capitalized word: one capital, then lowercase letters only. */
const CAPITALIZED = /^[A-Z][a-z]+$/;

function lowerPart(part: string): string {
  return CAPITALIZED.test(part) && !PROPER_WORDS.has(part) ? part.toLowerCase() : part;
}

/**
 * Title Case to sentence case for nav labels (#7285). Keeps the first word
 * and the first word after a colon, acronyms, mixed-case names, code names
 * and the proper nouns above; lowercases every other plain capitalized word,
 * hyphenated parts included.
 */
export function sentenceCase(title: string): string {
  const tokens = title.split(/(\s+)/);
  const words = tokens.map((t) => /^[^A-Za-z]*([A-Za-z][A-Za-z-]*)/.exec(t)?.[1] ?? '');
  let startOfPhrase = true;
  return tokens
    .map((token, i) => {
      if (/^\s+$/.test(token) || token === '') return token;
      const core = words[i] ?? '';
      const keepFirst = startOfPhrase;
      startOfPhrase = token.endsWith(':');
      if (core === '') return token;
      const prev = words[i - 2] ?? '';
      const next = words[i + 2] ?? '';
      const inPhrase = PROPER_PHRASES.some(
        ([a, b]) => (core === a && next === b) || (prev === a && core === b)
      );
      if (inPhrase) return token;
      const parts = core.split('-');
      const cased = parts
        .map((part, j) => (keepFirst && j === 0 ? part : lowerPart(part)))
        .join('-');
      return token.replace(core, cased);
    })
    .join('');
}

/** The rail label: an authored `nav_title` verbatim, else the title in sentence case. */
export function navLabel(page: NavPage): string {
  return page.navTitle ?? sentenceCase(page.title);
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
    const sorted = [...bucket].sort(comparePages);
    if (key === 'reference') {
      const groups = groupReference(sorted);
      sections.push({ key, label, pages: groups.flatMap((g) => g.pages), groups });
    } else {
      sections.push({ key, label, pages: sorted });
    }
  }
  return sections;
}

/**
 * Reference sub-groups (#7285), in render order. A page joins the first group
 * whose test matches its collection id; the last group takes the rest, so no
 * page can fall out of the nav.
 */
/** The directory itself (an index.md's id) or anything under it. */
function inDir(id: string, dir: string): boolean {
  return id === dir || id.startsWith(`${dir}/`);
}

const REFERENCE_GROUPS: ReadonlyArray<{
  key: string;
  label: string;
  test: (id: string) => boolean;
}> = [
  {
    key: 'cli-config',
    label: 'CLI and configuration',
    test: (id) =>
      id === 'entrypoints' ||
      id === 'getting-started/configuration' ||
      id === 'reference/environment' ||
      id === 'reference/cli' ||
      id.startsWith('reference/cli-'),
  },
  { key: 'mcp-tools', label: 'MCP tools', test: (id) => inDir(id, 'reference/tools') },
  { key: 'strategies', label: 'Strategies', test: (id) => inDir(id, 'reference/strategies') },
  {
    key: 'api',
    label: 'API and interfaces',
    test: (id) => id === 'api' || inDir(id, 'interfaces'),
  },
  { key: 'more', label: 'More reference', test: () => true },
];

function groupReference(pages: readonly NavPage[]): NavGroup[] {
  const byKey = new Map<string, NavPage[]>();
  for (const page of pages) {
    // The last group's test accepts every id, so find() cannot miss.
    const group = REFERENCE_GROUPS.find((g) => g.test(page.id));
    if (group === undefined) throw new Error(`no reference group for ${page.id}`);
    byKey.set(group.key, [...(byKey.get(group.key) ?? []), page]);
  }
  return REFERENCE_GROUPS.flatMap(({ key, label }) => {
    const grouped = byKey.get(key);
    return grouped === undefined ? [] : [{ key, label, pages: grouped }];
  });
}

export interface TocHeading {
  depth: number;
  slug: string;
  text: string;
}

/** Past this many entries the in-page nav lists H2s only (USWDS in-page nav). */
export const TOC_MAX_ENTRIES = 20;

/** The in-page nav entries: H2 and H3, or H2 only when that would exceed the cap. */
export function tocEntries(headings: readonly TocHeading[]): TocHeading[] {
  const both = headings.filter((h) => h.depth === 2 || h.depth === 3);
  return both.length > TOC_MAX_ENTRIES ? both.filter((h) => h.depth === 2) : both;
}

/**
 * Split rendered page HTML right after its first `</h1>`, so the layout can
 * place the in-page nav after the title in the DOM, not only visually.
 * Undefined when there is no h1 (escaped text such as `&lt;/h1&gt;` is not one).
 */
export function splitAfterFirstH1(html: string): [string, string] | undefined {
  const end = html.indexOf('</h1>');
  if (end === -1) return undefined;
  const cut = end + '</h1>'.length;
  return [html.slice(0, cut), html.slice(cut)];
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

/** The four reader-facing sections the Primary nav and the landing page offer. */
export const PRIMARY_SECTIONS = ['start', 'how-to', 'reference', 'concepts'] as const;
export type PrimarySectionKey = (typeof PRIMARY_SECTIONS)[number];

export function sectionLabel(key: SectionKey): string {
  const found = SECTIONS.find((s) => s.key === key);
  if (found === undefined) throw new Error(`unknown docs section: ${key}`);
  return found.label;
}

/**
 * URL segment of each section index page, under /docs/. A doc whose
 * collection id equals one of these would be shadowed by the index page, so
 * the section route fails the build on a collision (sectionRouteCollisions).
 */
const SECTION_SLUGS: Record<PrimarySectionKey, string> = {
  start: 'start-here',
  'how-to': 'how-to',
  reference: 'reference',
  concepts: 'concepts',
};

export function sectionSlug(key: PrimarySectionKey): string {
  return SECTION_SLUGS[key];
}

export function sectionIndexHref(base: string, key: PrimarySectionKey): string {
  return `${base}/docs/${SECTION_SLUGS[key]}/`;
}

/** Section slugs that a docs collection id would collide with. */
export function sectionRouteCollisions(docIds: readonly string[]): string[] {
  const ids = new Set(docIds);
  return PRIMARY_SECTIONS.map((key) => SECTION_SLUGS[key]).filter((slug) => ids.has(slug));
}

export interface SectionIntro {
  /** The Diátaxis need the section serves, as a one-word kicker. */
  kicker: string;
  summary: string;
}

const SECTION_INTROS: Record<PrimarySectionKey, SectionIntro> = {
  start: { kicker: 'Learning', summary: 'Start from nothing and finish with a working result.' },
  'how-to': { kicker: 'Tasks', summary: 'Steps for a goal you already have.' },
  reference: {
    kicker: 'Information',
    summary:
      'The CLI, the MCP tools, configuration and the API, much of it generated from the code.',
  },
  concepts: { kicker: 'Understanding', summary: 'Why it works the way it does.' },
};

export function sectionIntro(key: PrimarySectionKey): SectionIntro {
  return SECTION_INTROS[key];
}

/**
 * Directories whose unclassified pages stand in for a section that has no
 * classified page yet. A stopgap while the Diátaxis backfill (#7198) lands:
 * it switches itself off per section as soon as one page there declares the
 * type, and the listing is flagged `provisional` so the page can say so.
 */
const PROVISIONAL_PREFIXES: Record<PrimarySectionKey, readonly string[]> = {
  start: ['getting-started/'],
  'how-to': ['guides/'],
  reference: ['reference/'],
  concepts: ['architecture/'],
};

export interface SectionListing {
  pages: NavPage[];
  /** True when `pages` is the directory fallback, not classified pages. */
  provisional: boolean;
}

/**
 * The pages of one primary section, from the output of buildNav so the nav
 * rail, the section index pages and the landing page agree. Empty input
 * yields an empty, non-provisional listing.
 */
export function sectionListing(nav: readonly NavSection[], key: PrimarySectionKey): SectionListing {
  const classified = nav.find((s) => s.key === key)?.pages ?? [];
  if (classified.length > 0) return { pages: [...classified], provisional: false };
  const unsorted = nav.find((s) => s.key === 'unsorted')?.pages ?? [];
  const prefixes = PROVISIONAL_PREFIXES[key];
  const guessed = unsorted.filter((p) => prefixes.some((prefix) => p.id.startsWith(prefix)));
  return { pages: guessed, provisional: guessed.length > 0 };
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
    path: 'docs/reference/environment.md',
    source: 'scripts/generate-env-reference.ts',
    partial: false,
  },
  { path: 'docs/reference/cli.md', source: 'scripts/generate-cli-reference.ts', partial: false },
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
