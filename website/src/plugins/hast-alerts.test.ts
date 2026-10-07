/**
 * Tests for the alert-callout hast plugin (#7285 finding 8). Runs the real
 * Sätteri compiler, so conversions are checked in rendered HTML.
 *
 * @module website/src/plugins/hast-alerts.test
 */

import { describe, expect, it } from 'vitest';
import { markdownToHtml } from 'satteri';
import hastAlerts from './hast-alerts.ts';

async function render(md: string): Promise<string> {
  return (await markdownToHtml(md, { hastPlugins: [hastAlerts()] })).html;
}

describe('hastAlerts — GitHub alert syntax', () => {
  it.each([
    ['NOTE', 'note', 'Note'],
    ['TIP', 'tip', 'Tip'],
    ['IMPORTANT', 'important', 'Important'],
    ['WARNING', 'warning', 'Warning'],
    ['CAUTION', 'caution', 'Caution'],
  ])('maps [!%s] to a %s callout with a visible label', async (marker, kind, label) => {
    const html = await render(`> [!${marker}]\n> Body **text**.\n`);
    expect(html).not.toContain('<blockquote');
    expect(html).not.toContain(`[!${marker}]`);
    expect(html).toContain(`<aside class="callout" data-kind="${kind}" role="note">`);
    expect(html).toMatch(new RegExp(`<p class="callout-title">.*${label}</p>`, 's'));
    expect(html).toContain('<p>Body <strong>text</strong>.</p>');
  });

  it('accepts a lower-case marker', async () => {
    expect(await render('> [!note]\n> x\n')).toContain('data-kind="note"');
  });

  it('keeps the icon out of the accessibility tree', async () => {
    const html = await render('> [!WARNING]\n> x\n');
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
  });

  it('drops the marker paragraph when the marker stands alone', async () => {
    const html = await render('> [!TIP]\n>\n> Second paragraph.\n');
    expect(html).not.toMatch(/<p>\s*<\/p>/);
    expect(html).toContain('<p>Second paragraph.</p>');
  });

  it('leaves an unknown marker as a plain blockquote', async () => {
    const md = '> [!FOO]\n> x\n';
    expect(await render(md)).toBe(markdownToHtml(md).html);
  });

  it('requires the marker on its own line', async () => {
    const md = '> [!NOTE] inline text\n';
    expect(await render(md)).toBe(markdownToHtml(md).html);
  });
});

describe('hastAlerts — bold-label blockquotes', () => {
  it('maps > **Note:** to a note callout and removes the redundant label', async () => {
    const html = await render('> **Note:** Model IDs `x` come from the registry.\n');
    expect(html).toContain('data-kind="note"');
    expect(html).toContain('<p>Model IDs <code>x</code> come from the registry.</p>');
    expect(html).not.toContain('<strong>Note:</strong>');
  });

  it('maps > **Note**: (colon outside the bold) too', async () => {
    const html = await render('> **Note**: text\n');
    expect(html).toContain('data-kind="note"');
    expect(html).toContain('<p>text</p>');
  });

  it('keeps a bold lead sentence after "Warning —"', async () => {
    const html = await render(
      '> **Warning — setting the flag alone does NOT activate the adapter.** Flipping\n> it does.\n'
    );
    expect(html).toContain('data-kind="warning"');
    expect(html).toContain(
      '<strong>Setting the flag alone does NOT activate the adapter.</strong>'
    );
    expect(html).toContain('Flipping\nit does.');
  });

  it('leaves bold text that is not an alert label alone', async () => {
    for (const md of ['> **SSRF guard:** x\n', '> **Notes on X:** y\n', '> plain quote\n']) {
      expect(await render(md)).toBe(markdownToHtml(md).html);
    }
  });

  it('only inspects the first paragraph', async () => {
    const md = '> intro\n>\n> **Note:** later\n';
    expect(await render(md)).toBe(markdownToHtml(md).html);
  });

  it('converts nested alerts inside list items', async () => {
    const html = await render('- item\n\n  > **Tip:** nested\n');
    expect(html).toContain('<li>');
    expect(html).toContain('data-kind="tip"');
  });

  it('handles an empty document and an empty blockquote', async () => {
    expect(await render('')).toBe('');
    expect(await render('>\n')).toBe(markdownToHtml('>\n').html);
  });
});
