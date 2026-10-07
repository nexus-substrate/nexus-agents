/**
 * Tests for the table scroll-wrap hast plugin (#7199). Runs the real Sätteri
 * compiler so the wrapper is checked in rendered HTML, not on a fake context.
 *
 * @module website/src/plugins/hast-wrap-tables.test
 */

import { describe, expect, it } from 'vitest';
import { markdownToHtml } from 'satteri';
import hastWrapTables from './hast-wrap-tables.ts';

// markdownToHtml's return type widens to a Promise union when plugins are
// passed; this plugin is synchronous, but awaiting covers both shapes.
async function render(md: string): Promise<string> {
  return (await markdownToHtml(md, { hastPlugins: [hastWrapTables()] })).html;
}

const TABLE = '| a | b |\n| - | - |\n| 1 | 2 |\n';

describe('hastWrapTables', () => {
  it('wraps a table in a plain scroll container', async () => {
    expect(await render(TABLE)).toMatch(/^<div class="scroll-wrap"><table>/);
  });

  it('does not make every wrapper a focusable landmark (scroll-regions.ts does, on overflow only)', async () => {
    expect(await render(TABLE)).not.toMatch(/tabindex|role=|aria-label/);
  });

  it('wraps every table, once each', async () => {
    const html = await render(`${TABLE}\ntext\n\n${TABLE}`);
    expect(html.match(/class="scroll-wrap"/g)).toHaveLength(2);
    expect(html.match(/<table>/g)).toHaveLength(2);
  });

  it('leaves a document with no table unchanged', async () => {
    expect(await render('just *text*\n')).toBe(markdownToHtml('just *text*\n').html);
  });
});
