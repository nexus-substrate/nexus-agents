/**
 * Tests for index-command-link-formatters.ts
 *
 * Covers formatLinkValidationTable and formatLinkValidationJson.
 */

import { describe, it, expect } from 'vitest';
import {
  formatLinkValidationTable,
  formatLinkValidationJson,
} from './index-command-link-formatters.js';
import type { LinkValidationResult } from './index-command-link-types.js';

// ============================================================================
// Fixtures
// ============================================================================

const CLEAN_RESULT: LinkValidationResult = {
  files: [],
  summary: {
    totalFiles: 5,
    totalLinks: 20,
    brokenLinks: 0,
    byType: {
      internal: { total: 10, broken: 0 },
      external: { total: 8, broken: 0 },
      anchor: { total: 2, broken: 0 },
    },
  },
};

const BROKEN_RESULT: LinkValidationResult = {
  files: [
    {
      filePath: 'docs/README.md',
      links: [],
      brokenLinks: [
        {
          url: 'https://example.com/missing',
          line: 10,
          column: 5,
          error: 'Not Found',
          type: 'external',
          text: 'link text',
        },
      ],
    },
  ],
  summary: {
    totalFiles: 1,
    totalLinks: 5,
    brokenLinks: 1,
    byType: {
      internal: { total: 3, broken: 0 },
      external: { total: 2, broken: 1 },
      anchor: { total: 0, broken: 0 },
    },
  },
};

// ============================================================================
// formatLinkValidationTable
// ============================================================================

describe('formatLinkValidationTable', () => {
  it('contains header', () => {
    const result = formatLinkValidationTable(CLEAN_RESULT);
    expect(result).toContain('Link Validation Report');
  });

  it('shows file count', () => {
    const result = formatLinkValidationTable(CLEAN_RESULT);
    expect(result).toContain('5');
  });

  it('shows link counts', () => {
    const result = formatLinkValidationTable(CLEAN_RESULT);
    expect(result).toContain('20');
  });

  it('shows type breakdown', () => {
    const result = formatLinkValidationTable(CLEAN_RESULT);
    expect(result).toContain('Internal:');
    expect(result).toContain('External:');
    expect(result).toContain('Anchor:');
  });

  it('shows broken links section when broken links exist', () => {
    const result = formatLinkValidationTable(BROKEN_RESULT);
    expect(result).toContain('Broken Links:');
    expect(result).toContain('README.md');
  });

  it('omits broken links section when no broken links', () => {
    const result = formatLinkValidationTable(CLEAN_RESULT);
    expect(result).not.toContain('Broken Links:');
  });

  it('has box drawing borders', () => {
    const result = formatLinkValidationTable(CLEAN_RESULT);
    expect(result).toContain('╭');
    expect(result).toContain('╰');
  });

  it('truncates long file paths', () => {
    const longPathResult: LinkValidationResult = {
      files: [
        {
          filePath: 'a/very/deeply/nested/directory/structure/with/many/levels/of/nesting/file.md',
          links: [],
          brokenLinks: [
            { url: 'x', line: 1, column: 1, error: 'err', type: 'internal', text: 'link' },
          ],
        },
      ],
      summary: {
        ...BROKEN_RESULT.summary,
        brokenLinks: 1,
      },
    };
    const result = formatLinkValidationTable(longPathResult);
    expect(result).toContain('...');
  });
});

// ============================================================================
// formatLinkValidationJson
// ============================================================================

describe('formatLinkValidationJson', () => {
  it('returns valid JSON', () => {
    const result = formatLinkValidationJson(CLEAN_RESULT);
    const parsed = JSON.parse(result) as unknown;
    expect(parsed).toBeDefined();
  });

  it('pretty-prints with indentation', () => {
    const result = formatLinkValidationJson(CLEAN_RESULT);
    expect(result).toContain('\n');
    expect(result).toContain('  ');
  });

  it('preserves all data', () => {
    const result = formatLinkValidationJson(CLEAN_RESULT);
    const parsed = JSON.parse(result) as LinkValidationResult;
    expect(parsed.summary.totalFiles).toBe(5);
    expect(parsed.summary.totalLinks).toBe(20);
  });
});
