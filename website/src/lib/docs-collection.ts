/**
 * Collection access shared by the docs routes and DocsLayout's nav (#7199),
 * so the set of pages the nav links to is exactly the set the routes build.
 *
 * @module website/src/lib/docs-collection
 */

import { getCollection, type CollectionEntry } from 'astro:content';
import type { NavPage } from './docs-nav.ts';

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
  const { title, nav_title, diataxis, audience, order } = entry.data;
  return {
    id: entry.id,
    href: docsHref(entry.id),
    title: title ?? entry.id,
    navTitle: nav_title,
    diataxis,
    audience,
    order,
  };
}
