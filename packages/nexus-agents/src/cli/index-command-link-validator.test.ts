/**
 * Tests for index-command-link-validator.ts
 *
 * Covers extractLinks and validateLinks, including link type detection,
 * reference-style links, URL skipping, directory traversal, and validation flow.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { extractLinks, validateLinks } from './index-command-link-validator.js';

vi.mock('./index-command-link-validation-helpers.js', () => ({
  validateLink: vi.fn(),
  validateInternalLink: vi.fn(),
  validateExternalLink: vi.fn(),
  validateAnchorLink: vi.fn(),
}));

import { validateLink } from './index-command-link-validation-helpers.js';

describe('extractLinks', () => {
  describe('inline links', () => {
    it('extracts a single inline link', () => {
      const result = extractLinks('[Click here](https://example.com)');
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        url: 'https://example.com',
        type: 'external',
        text: 'Click here',
        line: 1,
      });
    });

    it('extracts multiple inline links from one line', () => {
      const result = extractLinks('[A](a.md) and [B](b.md)');
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ url: 'a.md', text: 'A' });
      expect(result[1]).toMatchObject({ url: 'b.md', text: 'B' });
    });

    it('extracts links from multiple lines', () => {
      const result = extractLinks('[Line 1](one.md)\n\n[Line 3](three.md)');
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ line: 1 });
      expect(result[1]).toMatchObject({ line: 3 });
    });

    it('returns correct column for inline links', () => {
      const result = extractLinks('prefix [Link](url.md)');
      expect(result).toHaveLength(1);
      expect(result[0]?.column).toBe(8);
    });

    it('returns empty array for content with no links', () => {
      expect(extractLinks('Just plain text.\nAnother line.')).toHaveLength(0);
    });

    it('returns empty array for empty content', () => {
      expect(extractLinks('')).toHaveLength(0);
    });
  });

  describe('link type classification', () => {
    it('classifies anchor links starting with #', () => {
      const result = extractLinks('[Section](#my-section)');
      expect(result[0]?.type).toBe('anchor');
    });

    it('classifies http links as external', () => {
      expect(extractLinks('[Site](http://example.com)')[0]?.type).toBe('external');
    });

    it('classifies https links as external', () => {
      expect(extractLinks('[Site](https://example.com)')[0]?.type).toBe('external');
    });

    it('classifies relative paths as internal', () => {
      expect(extractLinks('[Doc](./README.md)')[0]?.type).toBe('internal');
    });

    it('classifies absolute paths as internal', () => {
      expect(extractLinks('[Doc](/docs/guide.md)')[0]?.type).toBe('internal');
    });

    it('classifies path with anchor as internal', () => {
      expect(extractLinks('[Doc](file.md#heading)')[0]?.type).toBe('internal');
    });
  });

  describe('URL skipping', () => {
    it('skips mailto: links', () => {
      expect(extractLinks('[Email](mailto:user@example.com)')).toHaveLength(0);
    });

    it('skips javascript: links', () => {
      expect(extractLinks('[Action](javascript:void(0))')).toHaveLength(0);
    });

    it('does not skip normal links when mailto/javascript links are present', () => {
      const result = extractLinks('[Email](mailto:a@b.com) [Site](https://x.com)');
      expect(result).toHaveLength(1);
      expect(result[0]?.url).toBe('https://x.com');
    });
  });

  describe('reference-style links', () => {
    it('extracts reference-style links with explicit ref', () => {
      const content = 'See [the guide][guide-ref]\n\n[guide-ref]: https://example.com/guide';
      const result = extractLinks(content);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        url: 'https://example.com/guide',
        type: 'external',
        text: 'the guide',
        line: 1,
      });
    });

    it('does not resolve empty-bracket reference links (refId is empty string)', () => {
      // [My Ref][] has refId="" which is not nullish, so ?? doesn't fallback to text
      const result = extractLinks('[My Ref][]\n\n[my ref]: ./local.md');
      expect(result).toHaveLength(0);
    });

    it('resolves reference link when refId matches a definition key', () => {
      const result = extractLinks('[Click][my ref]\n\n[my ref]: ./local.md');
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ url: './local.md', type: 'internal', text: 'Click' });
    });

    it('handles case-insensitive reference keys', () => {
      const result = extractLinks('[Link][REF]\n\n[ref]: https://example.com');
      expect(result).toHaveLength(1);
      expect(result[0]?.url).toBe('https://example.com');
    });

    it('ignores reference links with no matching definition', () => {
      expect(extractLinks('[Link][undefined-ref]')).toHaveLength(0);
    });

    it('extracts multiple reference definitions', () => {
      const content = '[A][ref-a] and [B][ref-b]\n\n[ref-a]: a.md\n[ref-b]: b.md';
      const result = extractLinks(content);
      expect(result).toHaveLength(2);
      expect(result[0]?.url).toBe('a.md');
      expect(result[1]?.url).toBe('b.md');
    });
  });

  describe('mixed content edge cases', () => {
    it('handles inline and reference links in the same content', () => {
      const content = '[Inline](inline.md) and [Ref][my-ref]\n\n[my-ref]: ref.md';
      expect(extractLinks(content)).toHaveLength(2);
    });

    it('handles link text with special characters', () => {
      const result = extractLinks('[Link with `code` & symbols!](page.md)');
      expect(result).toHaveLength(1);
      expect(result[0]?.text).toBe('Link with `code` & symbols!');
    });

    it('handles URLs with query parameters', () => {
      const result = extractLinks('[Search](https://example.com?q=test&page=1)');
      expect(result).toHaveLength(1);
      expect(result[0]?.url).toBe('https://example.com?q=test&page=1');
    });

    it('handles empty link text', () => {
      const result = extractLinks('[](empty-text.md)');
      expect(result).toHaveLength(1);
      expect(result[0]?.text).toBe('');
    });
  });
});

describe('validateLinks', () => {
  const tmpDir = '/tmp/nexus-link-validator-test-' + String(process.pid);
  const mockedValidateLink = vi.mocked(validateLink);

  beforeEach(async () => {
    await fs.mkdir(tmpDir, { recursive: true });
    mockedValidateLink.mockReset();
    mockedValidateLink.mockImplementation(() => Promise.resolve({ valid: true }));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns empty results for directory with no markdown files', async () => {
    const result = await validateLinks({ baseDir: tmpDir });
    expect(result.summary.totalFiles).toBe(0);
    expect(result.summary.totalLinks).toBe(0);
    expect(result.files).toHaveLength(0);
  });

  it('finds and validates markdown files recursively', async () => {
    const subDir = path.join(tmpDir, 'sub');
    await fs.mkdir(subDir, { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'root.md'), '[Link](https://a.com)');
    await fs.writeFile(path.join(subDir, 'nested.md'), '[Link](https://b.com)');
    const result = await validateLinks({ baseDir: tmpDir });
    expect(result.summary.totalFiles).toBe(2);
    expect(result.summary.totalLinks).toBe(2);
  });

  it('skips node_modules directory', async () => {
    const nmDir = path.join(tmpDir, 'node_modules');
    await fs.mkdir(nmDir, { recursive: true });
    await fs.writeFile(path.join(nmDir, 'pkg.md'), '[Link](https://a.com)');
    await fs.writeFile(path.join(tmpDir, 'root.md'), '[Link](https://b.com)');
    const result = await validateLinks({ baseDir: tmpDir });
    expect(result.summary.totalFiles).toBe(1);
  });

  it('skips dist directory', async () => {
    const distDir = path.join(tmpDir, 'dist');
    await fs.mkdir(distDir, { recursive: true });
    await fs.writeFile(path.join(distDir, 'built.md'), '[Link](https://a.com)');
    await fs.writeFile(path.join(tmpDir, 'src.md'), '[Link](https://b.com)');
    const result = await validateLinks({ baseDir: tmpDir });
    expect(result.summary.totalFiles).toBe(1);
  });

  it('counts broken links in summary', async () => {
    await fs.writeFile(path.join(tmpDir, 'test.md'), '[Good](good.md)\n[Bad](bad.md)');
    mockedValidateLink
      .mockResolvedValueOnce({ valid: true })
      .mockResolvedValueOnce({ valid: false, error: 'File not found' });
    const result = await validateLinks({ baseDir: tmpDir });
    expect(result.summary.totalLinks).toBe(2);
    expect(result.summary.brokenLinks).toBe(1);
  });

  it('populates brokenLinks array in file result', async () => {
    await fs.writeFile(path.join(tmpDir, 'test.md'), '[Bad](missing.md)');
    mockedValidateLink.mockResolvedValueOnce({
      valid: false,
      error: 'File not found: missing.md',
    });
    const result = await validateLinks({ baseDir: tmpDir });
    expect(result.files[0]?.brokenLinks).toHaveLength(1);
    expect(result.files[0]?.brokenLinks[0]?.error).toContain('File not found');
  });

  it('uses "Unknown error" when validateLink error is undefined', async () => {
    await fs.writeFile(path.join(tmpDir, 'test.md'), '[Bad](missing.md)');
    mockedValidateLink.mockResolvedValueOnce({ valid: false });
    const result = await validateLinks({ baseDir: tmpDir });
    expect(result.files[0]?.brokenLinks[0]?.error).toBe('Unknown error');
  });

  it('defaults baseDir to "docs" when not provided', async () => {
    const result = await validateLinks();
    expect(result.summary).toBeDefined();
  });

  it('skips external links when checkExternal is false', async () => {
    await fs.writeFile(path.join(tmpDir, 'test.md'), '[Ext](https://example.com)\n[Int](local.md)');
    mockedValidateLink.mockResolvedValue({ valid: true });
    const result = await validateLinks({ baseDir: tmpDir, checkExternal: false });
    expect(result.summary.totalLinks).toBe(2);
    expect(mockedValidateLink).toHaveBeenCalledTimes(1);
  });

  it('checks external links when checkExternal is true', async () => {
    await fs.writeFile(path.join(tmpDir, 'test.md'), '[Ext](https://example.com)\n[Int](local.md)');
    mockedValidateLink.mockResolvedValue({ valid: true });
    const result = await validateLinks({ baseDir: tmpDir, checkExternal: true });
    expect(result.summary.totalLinks).toBe(2);
    expect(mockedValidateLink).toHaveBeenCalledTimes(2);
  });

  it('tracks broken link counts by type', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'test.md'),
      '[Int](missing.md)\n[Anchor](#gone)\n[Ext](https://bad.com)'
    );
    mockedValidateLink.mockResolvedValue({ valid: false, error: 'broken' });
    const result = await validateLinks({ baseDir: tmpDir });
    expect(result.summary.byType.internal.broken).toBe(1);
    expect(result.summary.byType.anchor.broken).toBe(1);
    expect(result.summary.byType.external.broken).toBe(1);
  });

  it('tracks total link counts by type', async () => {
    await fs.writeFile(path.join(tmpDir, 'test.md'), '[A](a.md)\n[B](#anchor)\n[C](https://c.com)');
    mockedValidateLink.mockResolvedValue({ valid: true });
    const result = await validateLinks({ baseDir: tmpDir });
    expect(result.summary.byType.internal.total).toBe(1);
    expect(result.summary.byType.anchor.total).toBe(1);
    expect(result.summary.byType.external.total).toBe(1);
  });

  it('handles non-existent baseDir gracefully', async () => {
    const result = await validateLinks({
      baseDir: '/tmp/nonexistent-dir-' + String(Date.now()),
    });
    expect(result.summary.totalFiles).toBe(0);
    expect(result.files).toHaveLength(0);
  });

  it('skips non-markdown files', async () => {
    await fs.writeFile(path.join(tmpDir, 'readme.md'), '[Link](a.md)');
    await fs.writeFile(path.join(tmpDir, 'code.ts'), '[Link](b.md)');
    await fs.writeFile(path.join(tmpDir, 'data.json'), '{"key": "value"}');
    mockedValidateLink.mockResolvedValue({ valid: true });
    const result = await validateLinks({ baseDir: tmpDir });
    expect(result.summary.totalFiles).toBe(1);
  });

  it('handles file that becomes unreadable between discovery and read', async () => {
    await fs.writeFile(path.join(tmpDir, 'temp.md'), '[Link](a.md)');
    await fs.chmod(path.join(tmpDir, 'temp.md'), 0o000);
    const result = await validateLinks({ baseDir: tmpDir });
    expect(result.files).toHaveLength(0);
    await fs.chmod(path.join(tmpDir, 'temp.md'), 0o644);
  });

  it('includes file path in each file result', async () => {
    const mdPath = path.join(tmpDir, 'specific.md');
    await fs.writeFile(mdPath, '[Link](a.md)');
    mockedValidateLink.mockResolvedValue({ valid: true });
    const result = await validateLinks({ baseDir: tmpDir });
    expect(result.files[0]?.filePath).toBe(mdPath);
  });

  it('includes found links in each file result', async () => {
    await fs.writeFile(path.join(tmpDir, 'test.md'), '[A](a.md)\n[B](b.md)');
    mockedValidateLink.mockResolvedValue({ valid: true });
    const result = await validateLinks({ baseDir: tmpDir });
    expect(result.files[0]?.links).toHaveLength(2);
  });

  it('aggregates links across multiple files correctly', async () => {
    await fs.writeFile(path.join(tmpDir, 'a.md'), '[L1](x.md)\n[L2](y.md)');
    await fs.writeFile(path.join(tmpDir, 'b.md'), '[L3](z.md)');
    mockedValidateLink.mockResolvedValue({ valid: true });
    const result = await validateLinks({ baseDir: tmpDir });
    expect(result.summary.totalLinks).toBe(3);
    expect(result.files).toHaveLength(2);
  });

  it('initializes all byType counters to zero when no links exist', async () => {
    await fs.writeFile(path.join(tmpDir, 'empty.md'), 'No links here.');
    const result = await validateLinks({ baseDir: tmpDir });
    expect(result.summary.byType.internal).toEqual({ total: 0, broken: 0 });
    expect(result.summary.byType.external).toEqual({ total: 0, broken: 0 });
    expect(result.summary.byType.anchor).toEqual({ total: 0, broken: 0 });
  });
});
