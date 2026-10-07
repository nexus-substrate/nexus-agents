/**
 * Tests for the build-time page-pattern coverage gate (#7285, #7288).
 *
 * @module website/src/integrations/pattern-coverage.test
 */

import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { assertPatternCoverage, patternCoverage } from './pattern-coverage.ts';

const BOX = '<section class="summary-box" aria-labelledby="before-you-start"></section>';

describe('patternCoverage', () => {
  it('counts the pages that render the summary box', () => {
    const report = patternCoverage([
      { path: 'a/index.html', html: `<h1>A</h1>${BOX}` },
      { path: 'b/index.html', html: '<h1>B</h1>' },
    ]);
    expect(report.summaryBox).toEqual(['a/index.html']);
    expect(report.scanned).toBe(2);
  });

  it('does not count the class name in prose or a stylesheet', () => {
    const report = patternCoverage([
      { path: 'a/index.html', html: '<style>.summary-box{}</style><p>summary-box</p>' },
    ]);
    expect(report.summaryBox).toEqual([]);
  });
});

describe('assertPatternCoverage', () => {
  let dir = '';
  afterEach(async () => {
    if (dir !== '') await rm(dir, { recursive: true, force: true });
    dir = '';
  });

  async function site(pages: Record<string, string>): Promise<string> {
    dir = await mkdtemp(join(tmpdir(), 'pattern-coverage-'));
    for (const [path, html] of Object.entries(pages)) {
      await mkdir(join(dir, path, '..'), { recursive: true });
      await writeFile(join(dir, path), html);
    }
    return dir;
  }

  it('passes when a built page renders the summary box', async () => {
    const root = await site({ 'docs/x/index.html': BOX, 'index.html': '<h1>Home</h1>' });
    await expect(assertPatternCoverage(root)).resolves.toMatchObject({
      summaryBox: ['docs/x/index.html'],
    });
  });

  it('fails when no built page renders the summary box', async () => {
    const root = await site({ 'docs/x/index.html': '<h1>X</h1>' });
    await expect(assertPatternCoverage(root)).rejects.toThrow(/summary box/);
  });

  it('fails as unmeasured on an empty build, not as a pass', async () => {
    const root = await site({});
    await expect(assertPatternCoverage(root)).rejects.toThrow(/unmeasured/);
  });
});
