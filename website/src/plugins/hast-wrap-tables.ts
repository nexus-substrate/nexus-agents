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
 * It also prepares the table for the stacked phone layout (#7285, finding 5):
 * header cells get `scope="col"`, and each body cell carries its column's
 * header text as `data-label`, which styles/components.css prints beside the
 * value once the columns stack below 30rem.
 *
 * @module website/src/plugins/hast-wrap-tables
 */

import { defineHastPlugin, type HastPluginDefinition } from 'satteri';
import { el, isElement, textOf, type HastChild, type HastElement } from './hast-tree.ts';

function cellsOf(row: HastElement, tagName: 'th' | 'td'): HastElement[] {
  return row.children.filter((c): c is HastElement => isElement(c, tagName));
}

function rowsOf(section: HastElement | undefined): HastElement[] {
  return section === undefined
    ? []
    : section.children.filter((c): c is HastElement => isElement(c, 'tr'));
}

/** Column header labels from the table's first header row; '' where empty. */
export function headerLabels(table: HastElement): string[] {
  const thead = table.children.find((c): c is HastElement => isElement(c, 'thead'));
  const firstRow = rowsOf(thead).at(0);
  if (firstRow === undefined) return [];
  return cellsOf(firstRow, 'th').map((th) => textOf(th).replace(/\s+/g, ' ').trim());
}

function withScope(row: HastElement): HastElement {
  return el(
    'tr',
    row.properties,
    row.children.map((c) =>
      isElement(c, 'th') ? el('th', { ...c.properties, scope: 'col' }, c.children) : c
    )
  );
}

function withLabels(row: HastElement, labels: readonly string[]): HastElement {
  let column = 0;
  const children = row.children.map((c): HastChild => {
    if (!isElement(c, 'td')) return c;
    const label = labels.at(column++);
    if (label === undefined || label === '') return c;
    return el('td', { ...c.properties, dataLabel: label }, c.children);
  });
  return el('tr', row.properties, children);
}

/** The table with header scopes and per-cell labels applied. */
export function labelTable(table: HastElement): HastElement {
  const labels = headerLabels(table);
  const children = table.children.map((section): HastChild => {
    if (!isElement(section)) return section;
    if (section.tagName === 'thead') {
      return el(
        'thead',
        section.properties,
        section.children.map((r) => (isElement(r, 'tr') ? withScope(r) : r))
      );
    }
    if (section.tagName === 'tbody') {
      return el(
        'tbody',
        section.properties,
        section.children.map((r) => (isElement(r, 'tr') ? withLabels(r, labels) : r))
      );
    }
    return section;
  });
  return el('table', table.properties, children);
}

export default function hastWrapTables(): HastPluginDefinition {
  return defineHastPlugin({
    name: 'nexus-wrap-tables',
    element: {
      filter: ['table'],
      visit(node, ctx) {
        ctx.replaceNode(node, el('div', { className: ['scroll-wrap'] }, [labelTable(node)]));
      },
    },
  });
}
