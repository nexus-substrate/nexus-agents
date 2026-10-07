/**
 * hast-summary-box.ts — the "Before you start" box on how-to guides (#7285).
 *
 * A how-to page (`diataxis: how-to`) that lists `prerequisites:` in its
 * frontmatter gets a summary box right after its title, the USWDS summary-box
 * pattern rendered as plain semantic HTML. It is a named region rather than a
 * heading, so the page outline and the "on this page" list are unchanged.
 *
 * Implemented as a Markdown plugin rather than in the docs layout so the
 * layout stays a pure page shell. Prerequisites are plain text; a backtick
 * span becomes inline code. Nothing in them is parsed as HTML.
 *
 * @module website/src/plugins/hast-summary-box
 */

import { defineHastPlugin, type HastPluginDefinition } from 'satteri';
import { el, frontmatterOf, isElement, rewriteRoot, text, type HastChild } from './hast-tree.ts';

const HEADING_ID = 'before-you-start';

/** Valid prerequisite strings; an absent, empty or malformed list is none. */
export function prerequisitesOf(frontmatter: Record<string, unknown>): string[] {
  if (frontmatter['diataxis'] !== 'how-to') return [];
  const list = frontmatter['prerequisites'];
  if (!Array.isArray(list)) return [];
  return list.filter((item): item is string => typeof item === 'string' && item.trim() !== '');
}

/** Plain text with `backtick` spans as inline code. */
function inline(value: string): HastChild[] {
  return value
    .split(/(`[^`]+`)/)
    .filter((part) => part !== '')
    .map((part) =>
      part.startsWith('`') && part.endsWith('`') && part.length > 2
        ? el('code', {}, [text(part.slice(1, -1))])
        : text(part)
    );
}

export function summaryBox(prerequisites: readonly string[]): HastChild {
  return el('section', { className: ['summary-box'], ariaLabelledby: HEADING_ID }, [
    el('p', { className: ['summary-box-heading'], id: HEADING_ID }, [text('Before you start')]),
    el(
      'ul',
      {},
      prerequisites.map((p) => el('li', {}, inline(p)))
    ),
  ]);
}

export default function hastSummaryBox(): HastPluginDefinition {
  return defineHastPlugin({
    name: 'nexus-summary-box',
    after: rewriteRoot((children, ctx) => {
      const prerequisites = prerequisitesOf(frontmatterOf(ctx));
      if (prerequisites.length === 0) return children;
      const titleAt = children.findIndex((c) => isElement(c, 'h1'));
      const at = titleAt + 1; // 0 when there is no title: the box goes first.
      return [
        ...children.slice(0, at),
        summaryBox(prerequisites),
        text('\n'),
        ...children.slice(at),
      ];
    }),
  });
}
