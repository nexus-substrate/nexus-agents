/**
 * Small, pure helpers over Sätteri's materialized hast nodes, shared by the
 * docs-site hast plugins (#7285). Every plugin that restructures a page reads
 * plain node objects and builds new ones; these keep that code declarative.
 *
 * @module website/src/plugins/hast-tree
 */

import type { HastNode, HastVisitorContext } from 'satteri';

export type HastElement = Extract<HastNode, { type: 'element' }>;
/** A node that can sit in an element's children. */
export type HastChild = HastElement['children'][number];

export function isElement(node: unknown, tagName?: string): node is HastElement {
  if (typeof node !== 'object' || node === null) return false;
  const n = node as { type?: unknown; tagName?: unknown };
  return n.type === 'element' && (tagName === undefined || n.tagName === tagName);
}

/** Concatenated text of a node's descendants (DOM textContent). */
export function textOf(node: unknown): string {
  if (typeof node !== 'object' || node === null) return '';
  const n = node as { type?: unknown; value?: unknown; children?: unknown };
  if (n.type === 'text' && typeof n.value === 'string') return n.value;
  if (!Array.isArray(n.children)) return '';
  return n.children.map(textOf).join('');
}

/** Whitespace-only text between block elements. */
export function isBlankText(node: unknown): boolean {
  if (typeof node !== 'object' || node === null) return false;
  const n = node as { type?: unknown; value?: unknown };
  return n.type === 'text' && typeof n.value === 'string' && n.value.trim() === '';
}

export function el(
  tagName: string,
  properties: Record<string, unknown>,
  children: HastChild[] = []
): HastElement {
  return { type: 'element', tagName, properties, children } as HastElement;
}

export function text(value: string): HastChild {
  return { type: 'text', value };
}

/** Raw HTML, passed through by the serializer (used for static inline SVG). */
export function raw(value: string): HastChild {
  return { type: 'raw', value } as unknown as HastChild;
}

/**
 * The page's frontmatter, as Astro's Sätteri processor hands it to plugins
 * (`data.astro.frontmatter`). An empty object when compiled outside Astro.
 */
export function frontmatterOf(ctx: Pick<HastVisitorContext, 'data'>): Record<string, unknown> {
  const astro: unknown = (ctx.data as Record<string, unknown>)['astro'];
  if (typeof astro !== 'object' || astro === null) return {};
  const fm: unknown = (astro as Record<string, unknown>)['frontmatter'];
  return typeof fm === 'object' && fm !== null ? (fm as Record<string, unknown>) : {};
}

/**
 * A plugin hook that rewrites the document's top-level children. `rewrite`
 * returns the SAME array when it has nothing to do, and the tree is then left
 * untouched, so an inapplicable page renders byte-for-byte as before.
 */
export function rewriteRoot(
  rewrite: (children: HastChild[], ctx: HastVisitorContext) => HastChild[]
): (root: { children: unknown[] }, ctx: HastVisitorContext) => void {
  return (root, ctx) => {
    const children = root.children as HastChild[];
    const next = rewrite(children, ctx);
    if (next === children) return;
    ctx.replaceNode(root as Parameters<HastVisitorContext['replaceNode']>[0], {
      type: 'root',
      children: next,
    });
  };
}
