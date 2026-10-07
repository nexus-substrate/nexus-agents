/**
 * hast-wrap-tables.ts
 *
 * Wraps every rendered Markdown table in remarque's `.scroll-wrap` container
 * (prose.css: "Wide tables should not force the reading column wider than
 * --content-reading — wrap them"). Without it, 2-, 3- and 5-column tables in
 * the docs pushed the page into horizontal scroll on a phone (#7199).
 *
 * The wrapper is a keyboard-focusable named region, so the overflow can be
 * scrolled without a pointer (axe: scrollable-region-focusable).
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
          properties: {
            className: ['scroll-wrap'],
            tabIndex: 0,
            role: 'region',
            ariaLabel: 'Scrollable table',
          },
          children: [],
        });
      },
    },
  });
}
