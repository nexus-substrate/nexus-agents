/**
 * Tests for the page-level pattern plugins (#7285): the how-to summary box,
 * the tutorial process list and the repo-breadcrumb strip. Frontmatter is
 * supplied the way Astro's Sätteri processor supplies it
 * (`data.astro.frontmatter`).
 *
 * @module website/src/plugins/hast-page-patterns.test
 */

import { describe, expect, it } from 'vitest';
import { markdownToHtml } from 'satteri';
import hastSummaryBox from './hast-summary-box.ts';
import hastProcessList from './hast-process-list.ts';
import hastStripRepoBreadcrumb from './hast-strip-repo-breadcrumb.ts';

type Plugin = ReturnType<typeof hastSummaryBox>;

async function render(
  md: string,
  plugin: Plugin,
  frontmatter?: Record<string, unknown>
): Promise<string> {
  const data =
    frontmatter === undefined
      ? {}
      : {
          astro: {
            frontmatter,
            headings: [],
            localImagePaths: new Set<string>(),
            remoteImagePaths: new Set<string>(),
          },
        };
  return (await markdownToHtml(md, { hastPlugins: [plugin], data })).html;
}

describe('hastSummaryBox', () => {
  const MD = '# Set up X\n\nIntro.\n\n## Steps\n';
  const HOW_TO = {
    diataxis: 'how-to',
    prerequisites: ['Node 24', 'A `GITHUB_TOKEN` with repo scope'],
  };

  it('adds a "Before you start" box after the title of a how-to that declares prerequisites', async () => {
    const html = await render(MD, hastSummaryBox(), HOW_TO);
    expect(html).toMatch(/<h1>Set up X<\/h1>\s*<section class="summary-box"/);
    expect(html).toContain('aria-labelledby="before-you-start"');
    expect(html).toContain(
      '<p class="summary-box-heading" id="before-you-start">Before you start</p>'
    );
    expect(html).toContain('<li>Node 24</li>');
    expect(html).toContain('<li>A <code>GITHUB_TOKEN</code> with repo scope</li>');
  });

  it('does not create a heading, so the page outline is unchanged', async () => {
    const html = await render(MD, hastSummaryBox(), HOW_TO);
    expect(html.match(/<h[1-6]/g)).toHaveLength(2);
  });

  it('escapes prerequisite text rather than parsing it as HTML', async () => {
    const html = await render(MD, hastSummaryBox(), {
      diataxis: 'how-to',
      prerequisites: ['<img src=x>'],
    });
    expect(html).not.toContain('<img');
    expect(html).toContain('<li>&lt;img src=x&gt;</li>');
  });

  it('puts the box first when the page has no title', async () => {
    const html = await render('Intro.\n', hastSummaryBox(), HOW_TO);
    expect(html).toMatch(/^<section class="summary-box"/);
  });

  it.each([
    ['a non-how-to page', { diataxis: 'tutorial', prerequisites: ['x'] }],
    ['a how-to with no prerequisites field', { diataxis: 'how-to' }],
    ['a how-to with an empty prerequisites list', { diataxis: 'how-to', prerequisites: [] }],
    [
      'a how-to whose prerequisites are not strings',
      { diataxis: 'how-to', prerequisites: [1, null] },
    ],
    ['a page compiled without frontmatter', undefined],
  ])('adds nothing to %s', async (_label, frontmatter) => {
    expect(await render(MD, hastSummaryBox(), frontmatter)).toBe(markdownToHtml(MD).html);
  });
});

describe('hastProcessList', () => {
  const MD = [
    '# Tour',
    'Intro.',
    '## 1. Install',
    'Run it.',
    '### Detail',
    'More.',
    '## 2. Start',
    'Go.',
    '## What you did',
    'Recap.',
    '',
  ].join('\n\n');
  const TUTORIAL = { diataxis: 'tutorial' };

  it('groups the numbered H2 steps of a tutorial into one process list', async () => {
    const html = await render(MD, hastProcessList(), TUTORIAL);
    expect(html.match(/<ol class="process-list">/g)).toHaveLength(1);
    expect(html.match(/<li class="process-list-item">/g)).toHaveLength(2);
    // The intro stays before the list and the recap after it.
    expect(html.indexOf('Intro.')).toBeLessThan(html.indexOf('<ol class="process-list">'));
    expect(html.indexOf('</ol>')).toBeLessThan(html.indexOf('<h2>What you did</h2>'));
    // A step owns everything up to the next H2, sub-headings included.
    expect(html).toMatch(
      /<li class="process-list-item">\s*<h2>.*Install<\/h2>[\s\S]*<h3>Detail<\/h3>[\s\S]*More\.[\s\S]*?<\/li>/
    );
  });

  it('keeps the step headings as real H2s whose text is unchanged, so the outline and anchors stay', async () => {
    const html = await render(MD, hastProcessList(), TUTORIAL);
    expect(html).toContain(
      '<h2><span class="process-list-num">1<span class="visually-hidden">.</span></span> Install</h2>'
    );
    expect(html.match(/<h2>/g)).toHaveLength(3);
  });

  it('ends the list at the first unnumbered H2 and does not resume after it', async () => {
    const md = '## 1. A\n\n## Aside\n\n## 2. B\n';
    const html = await render(md, hastProcessList(), TUTORIAL);
    expect(html.match(/<li class="process-list-item">/g)).toHaveLength(1);
    expect(html).toContain('<h2>2. B</h2>');
  });

  it.each([
    ['a how-to', { diataxis: 'how-to' }],
    ['a page compiled without frontmatter', undefined],
  ])('leaves %s alone', async (_label, frontmatter) => {
    expect(await render(MD, hastProcessList(), frontmatter)).toBe(markdownToHtml(MD).html);
  });

  it('leaves a tutorial with no numbered steps alone', async () => {
    const md = '## Step one\n\ntext\n';
    expect(await render(md, hastProcessList(), TUTORIAL)).toBe(markdownToHtml(md).html);
  });

  it('ignores numbered H2s nested below the top level', async () => {
    const md = '> ## 1. Quoted\n';
    expect(await render(md, hastProcessList(), TUTORIAL)).toBe(markdownToHtml(md).html);
  });
});

describe('hastStripRepoBreadcrumb', () => {
  it('removes a leading Hub breadcrumb line and the rule after it', async () => {
    const md =
      '# Memory\n\n**Hub:** [README.md](./README.md) | **Full Architecture:** [ARCHITECTURE.md](../../ARCHITECTURE.md)\n\n---\n\n## Overview\n';
    const html = await render(md, hastStripRepoBreadcrumb());
    expect(html).not.toContain('Hub:');
    expect(html).not.toContain('<hr');
    expect(html).toMatch(/<h1>Memory<\/h1>\s*<h2>Overview<\/h2>/);
  });

  it('removes a Tier line that shares the breadcrumb paragraph', async () => {
    const md =
      '# R\n\n**Tier 2** | Deep technical documentation\n**Hub:** [README.md](./README.md) | **Full Architecture:** [A](../A.md)\n\n---\n\ntext\n';
    const html = await render(md, hastStripRepoBreadcrumb());
    expect(html).not.toContain('Tier 2');
    expect(html).not.toContain('<hr');
    expect(html).toContain('<p>text</p>');
  });

  it('keeps the rule when it does not directly follow the breadcrumb', async () => {
    const md = '**Hub:** [R](./R.md)\n\ntext\n\n---\n';
    const html = await render(md, hastStripRepoBreadcrumb());
    expect(html).not.toContain('Hub:');
    expect(html).toContain('<hr>');
  });

  it.each([
    [
      'a Hub line with no link (it is a description)',
      '**Hub:** Research on skill loading.\n\n---\n',
    ],
    ['prose that mentions a hub', 'The **Hub:** [R](./R.md) pattern.\n'],
    ['a paragraph with other lines', '**Hub:** [R](./R.md)\nAnd then a sentence.\n'],
    ['a nested breadcrumb-looking line', '> **Hub:** [R](./R.md)\n'],
    ['a breadcrumb-shaped line below the first H2', '## Links\n\n**Hub:** [R](./R.md)\n\n---\n'],
    ['an empty document', ''],
  ])('leaves %s alone', async (_label, md) => {
    expect(await render(md, hastStripRepoBreadcrumb())).toBe(markdownToHtml(md).html);
  });
});
