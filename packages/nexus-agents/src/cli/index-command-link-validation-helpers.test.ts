/**
 * Tests for index-command-link-validation-helpers.ts
 *
 * Covers link validation for internal, external, and anchor links.
 * Uses real filesystem for internal link tests, mocked fetch for external.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import {
  validateInternalLink,
  validateExternalLink,
  validateAnchorLink,
  validateLink,
} from './index-command-link-validation-helpers.js';
import type { FoundLink } from './index-command-link-types.js';

// ============================================================================
// validateInternalLink
// ============================================================================

describe('validateInternalLink', () => {
  it('validates existing file', async () => {
    // Use this test file itself as a known-existing file
    const thisFile = import.meta.url.replace('file://', '');
    const result = await validateInternalLink(path.basename(thisFile), thisFile);
    expect(result.valid).toBe(true);
  });

  it('returns error for non-existent file', async () => {
    const result = await validateInternalLink('nonexistent-file-12345.md', '/tmp/source.md');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('File not found');
  });

  it('treats pure anchor links as valid', async () => {
    const result = await validateInternalLink('#heading', '/tmp/source.md');
    expect(result.valid).toBe(true);
  });

  it('treats empty string file part as valid', async () => {
    const result = await validateInternalLink('', '/tmp/source.md');
    expect(result.valid).toBe(true);
  });
});

// ============================================================================
// validateExternalLink
// ============================================================================

describe('validateExternalLink', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns valid for successful HEAD request', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
    } as Response);
    const result = await validateExternalLink('https://example.com');
    expect(result.valid).toBe(true);
  });

  it('falls back to GET on 405', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: false, status: 405 } as Response)
      .mockResolvedValueOnce({ ok: true, status: 200 } as Response);
    const result = await validateExternalLink('https://example.com');
    expect(result.valid).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('returns error for non-ok status', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 404,
    } as Response);
    const result = await validateExternalLink('https://example.com/missing');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('404');
  });

  it('returns timeout error on abort', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('The operation was aborted'));
    const result = await validateExternalLink('https://example.com', 100);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Timeout');
  });

  it('returns error message for network failures', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const result = await validateExternalLink('https://example.com');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('ECONNREFUSED');
  });
});

// ============================================================================
// validateAnchorLink
// ============================================================================

describe('validateAnchorLink', () => {
  const tmpDir = '/tmp/link-validation-test';
  const mdFile = path.join(tmpDir, 'test.md');

  beforeEach(async () => {
    await fs.mkdir(tmpDir, { recursive: true });
    await fs.writeFile(
      mdFile,
      '# Hello World\n\n## Getting Started\n\nSome text\n\n### Deep Section\n'
    );
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('validates existing anchor', async () => {
    const result = await validateAnchorLink('#hello-world', mdFile);
    expect(result.valid).toBe(true);
  });

  it('validates nested heading anchor', async () => {
    const result = await validateAnchorLink('#getting-started', mdFile);
    expect(result.valid).toBe(true);
  });

  it('returns error for missing anchor', async () => {
    const result = await validateAnchorLink('#nonexistent-section', mdFile);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('not found');
  });
});

// ============================================================================
// validateLink
// ============================================================================

describe('validateLink', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('routes internal links to validateInternalLink', async () => {
    const link: FoundLink = {
      url: 'nonexistent-abc.md',
      type: 'internal',
      line: 1,
      column: 1,
      text: 'link',
    };
    const result = await validateLink(link, '/tmp/source.md');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('File not found');
  });

  it('routes external links to validateExternalLink', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
    } as Response);
    const link: FoundLink = {
      url: 'https://example.com',
      type: 'external',
      line: 1,
      column: 1,
      text: 'example',
    };
    const result = await validateLink(link, '/tmp/source.md');
    expect(result.valid).toBe(true);
  });

  it('routes anchor links to validateAnchorLink', async () => {
    const link: FoundLink = {
      url: '#some-heading',
      type: 'anchor',
      line: 1,
      column: 1,
      text: 'heading',
    };
    // Source file doesn't exist so anchor validation will fail
    const result = await validateLink(link, '/tmp/nonexistent-source.md');
    expect(result.valid).toBe(false);
  });
});
