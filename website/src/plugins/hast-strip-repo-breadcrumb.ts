/**
 * hast-strip-repo-breadcrumb.ts — drop repo-navigation leftovers (#7285).
 *
 * Several architecture pages open with a line written for browsing the repo
 * on GitHub:
 *
 *   **Tier 2** | Deep technical documentation for …     (optional)
 *   **Hub:** [README.md](./README.md) | **Full Architecture:** [ARCHITECTURE.md](…)
 *
 *   ---
 *
 * On the site the rail and breadcrumb already do that job, so the paragraph
 * and the rule right after it are removed at render time. The source files
 * are untouched: they still read correctly on GitHub.
 *
 * Narrow on purpose: a top-level paragraph before the first H2, every line of
 * which is a `Hub:` or `Tier N |` line, with at least one `Hub:` line and a
 * link. A `Hub:` line that is a sentence (no link) is content and stays.
 *
 * @module website/src/plugins/hast-strip-repo-breadcrumb
 */

import { defineHastPlugin, type HastPluginDefinition } from 'satteri';
import { isBlankText, isElement, rewriteRoot, textOf, type HastChild } from './hast-tree.ts';

const HUB_LINE = /^Hub:\s/;
const TIER_LINE = /^Tier \d+\s*\|/;

function hasLink(node: unknown): boolean {
  if (isElement(node, 'a')) return true;
  return isElement(node) && node.children.some(hasLink);
}

export function isRepoBreadcrumb(node: HastChild): boolean {
  if (!isElement(node, 'p') || !hasLink(node)) return false;
  const lines = textOf(node)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
  if (!lines.some((line) => HUB_LINE.test(line))) return false;
  return lines.every((line) => HUB_LINE.test(line) || TIER_LINE.test(line));
}

export function stripBreadcrumb(children: HastChild[]): HastChild[] {
  const firstSection = children.findIndex((c) => isElement(c, 'h2'));
  const limit = firstSection === -1 ? children.length : firstSection;
  const at = children.slice(0, limit).findIndex(isRepoBreadcrumb);
  if (at === -1) return children;

  let next = at + 1;
  while (next < children.length && isBlankText(children[next])) next++;
  const end = isElement(children[next], 'hr') ? next + 1 : at + 1;
  return [...children.slice(0, at), ...children.slice(end)];
}

export default function hastStripRepoBreadcrumb(): HastPluginDefinition {
  return defineHastPlugin({
    name: 'nexus-strip-repo-breadcrumb',
    after: rewriteRoot((children) => stripBreadcrumb(children)),
  });
}
