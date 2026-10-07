import { describe, expect, it } from 'vitest';
import { markdownToHtml } from 'satteri';
import hastTaskListStatus from './hast-task-list-status.ts';

async function render(md: string): Promise<string> {
  return (await markdownToHtml(md, { hastPlugins: [hastTaskListStatus()] })).html;
}

describe('task-list accessibility', () => {
  it('reads task status and text without exposing a disabled form control', async () => {
    const html = await render('- [x] **Ship** the gate\n- [ ] Review it\n');
    expect(html).not.toContain('<input');
    expect(html).toContain('<span class="visually-hidden">Done: </span>');
    expect(html).toContain('<span class="visually-hidden">Not done: </span>');
    expect(html).toContain('<strong>Ship</strong> the gate');
    expect(html).toMatch(/aria-hidden="true">☑/);
    expect(html).toMatch(/aria-hidden="true">☐/);
  });

  it('preserves nested and loose task text, links, and separate statuses', async () => {
    const html = await render('- [ ] Parent\n\n  Detail\n\n  - [x] [Child](https://example.org)\n');
    expect(html).not.toContain('<input');
    expect(html.match(/class="visually-hidden"/g)).toHaveLength(2);
    expect(html).toContain('Detail');
    expect(html).toContain('<a href="https://example.org">Child</a>');
  });

  it('leaves ordinary lists and author-supplied interactive controls alone', async () => {
    const md = '- Ordinary list\n\n<input type="checkbox" aria-label="Choose">\n';
    expect(await render(md)).toBe(markdownToHtml(md).html);
  });

  it('handles an empty document without inventing task statuses', async () => {
    expect(await render('')).toBe('');
  });
});
