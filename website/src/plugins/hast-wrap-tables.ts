/**
 * hast-wrap-tables.ts
 *
 * Wraps every rendered Markdown table in remarque's `.scroll-wrap` container
 * (prose.css: "Wide tables should not force the reading column wider than
 * --content-reading — wrap them"). Without it, 2-, 3- and 5-column tables in
 * the docs pushed the page into horizontal scroll on a phone (#7199).
 *
 * The wrapper is deliberately plain. Making every one a focusable named
 * region produced 34 identical "Scrollable table" landmarks on one page (axe
 * landmark-unique); src/lib/scroll-regions.ts promotes only the wrappers that
 * actually overflow, with a unique name each.
 *
 * @module website/src/plugins/hast-wrap-tables
 */

import { defineHastPlugin, type HastPluginDefinition } from 'satteri';

export default function hastWrapTables(): HastPluginDefinition {
  return defineHastPlugin({
    name: 'nexus-wrap-tables',
    element: {
      filter: ['table'],
      visit(node, ctx) {
        ctx.wrapNode(node, {
          type: 'element',
          tagName: 'div',
          properties: { className: ['scroll-wrap'] },
          children: [],
        });
      },
    },
  });
}
