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

  it('labels every body cell with its column header, for the stacked phone layout', async () => {
    const html = await render('| Name | `Default` |\n| - | - |\n| a | 1 |\n| b | |\n');
    expect(html.match(/<td data-label="Name">/g)).toHaveLength(2);
    expect(html.match(/<td data-label="Default">/g)).toHaveLength(2);
  });

  it('marks header cells as column headers', async () => {
    expect((await render(TABLE)).match(/<th scope="col">/g)).toHaveLength(2);
  });

  it('keeps column alignment while adding the label', async () => {
    const html = await render('| n |\n| -: |\n| 1 |\n');
    expect(html).toMatch(
      /<td (?=[^>]*style="text-align: right")(?=[^>]*data-label="n")[^>]*>1<\/td>/
    );
  });

  it('adds no label where the header is empty or the row is wider than the header', async () => {
    const html = await render('|   | b |\n| - | - |\n| 1 | 2 |\n');
    expect(html).toContain('<td>1</td>');
    expect(html).toContain('<td data-label="b">2</td>');
  });

  it('lets an identifier in a cell break after each underscore', async () => {
    const html = await render('| Name |\n| - |\n| `NEXUS_ALLOW_SIMULATE` |\n');
    expect(html).toContain('<code>NEXUS_<wbr>ALLOW_<wbr>SIMULATE</code>');
  });

  it('adds no break after a trailing underscore or in code outside a table', async () => {
    const html = await render('`A_B`\n\n| n |\n| - |\n| `X_` |\n');
    expect(html).toContain('<p><code>A_B</code></p>');
    expect(html).toContain('<code>X_</code>');
  });

  it('leaves a document with no table unchanged', async () => {
    expect(await render('just *text*\n')).toBe(markdownToHtml('just *text*\n').html);
  });
});
