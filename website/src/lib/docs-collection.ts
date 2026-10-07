/**
 * Collection access shared by the docs routes and DocsLayout's nav (#7199),
 * so the set of pages the nav links to is exactly the set the routes build.
 *
 * @module website/src/lib/docs-collection
 */

import { getCollection, type CollectionEntry } from 'astro:content';
import { buildNav, type NavPage, type NavSection } from './docs-nav.ts';

/** Base path without a trailing slash, e.g. `/nexus-agents`. */
export const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

/**
 * Docs with a frontmatter title are published; the rest (generated indexes
 * that open with an HTML comment, for instance) are not built (#5752).
 */
export async function getPublishedDocs(): Promise<Array<CollectionEntry<'docs'>>> {
  const all = await getCollection('docs');
  return all.filter((entry) => Boolean(entry.data.title));
}

export function docsHref(id: string): string {
  return `${BASE}/docs/${id}/`;
}

export const API_INDEX_HREF = `${BASE}/api/`;

export function toNavPage(entry: CollectionEntry<'docs'>): NavPage {
  const { title, description, nav_title, diataxis, audience, order } = entry.data;
  return {
    id: entry.id,
    href: docsHref(entry.id),
    title: title ?? entry.id,
    description,
    navTitle: nav_title,
    diataxis,
    audience,
    order,
  };
}

/** The API reference index lives outside the docs collection; it sits in Reference. */
const API_INDEX_PAGE: NavPage = {
  id: 'api',
  href: API_INDEX_HREF,
  title: 'API reference',
  description: 'Generated from the TypeScript source with TypeDoc: every public export.',
  order: 0,
};

/**
 * The site navigation: every published doc plus the API index, grouped by
 * buildNav. The nav rail, the section index pages and the landing page all
 * read this, so they cannot disagree about which page is in which section.
 */
export async function getSiteNav(): Promise<NavSection[]> {
  return buildNav((await getPublishedDocs()).map(toNavPage), { reference: [API_INDEX_PAGE] });
}
