/**
 * Tests for Gemini Parser Resilient Helpers
 * @module cli-adapters/parsers/gemini-parser-resilient-helpers.test
 */

import { describe, it, expect } from 'vitest';
import {
  aggregateModelTokens,
  extractUsageFromRecord,
  extractSessionIdFromText,
  extractTextFromMarkdown,
  extractErrorMessage,
  isLikelyErrorOutput,
} from './gemini-parser-resilient-helpers.js';

// ============================================================================
// aggregateModelTokens
// ============================================================================

describe('aggregateModelTokens', () => {
  it('aggregates tokens from single model', () => {
    const models = {
      'gemini-2.0': {
        tokens: { input: 100, candidates: 50, cached: 10 },
      },
    };
    const totals = aggregateModelTokens(models);
    expect(totals.input).toBe(100);
    expect(totals.output).toBe(50);
    expect(totals.cached).toBe(10);
  });

  it('aggregates tokens from multiple models', () => {
    const models = {
      'model-a': { tokens: { input: 100, candidates: 50, cached: 0 } },
      'model-b': { tokens: { input: 200, candidates: 100, cached: 30 } },
    };
    const totals = aggregateModelTokens(models);
    expect(totals.input).toBe(300);
    expect(totals.output).toBe(150);
    expect(totals.cached).toBe(30);
  });

  it('handles missing tokens field', () => {
    const models = { 'model-a': { other: 'data' } };
    const totals = aggregateModelTokens(models);
    expect(totals.input).toBe(0);
    expect(totals.output).toBe(0);
    expect(totals.cached).toBe(0);
  });

  it('handles non-object model stats', () => {
    const models = { 'model-a': 'invalid' };
    const totals = aggregateModelTokens(models);
    expect(totals.input).toBe(0);
  });

  it('handles empty models object', () => {
    const totals = aggregateModelTokens({});
    expect(totals.input).toBe(0);
    expect(totals.output).toBe(0);
    expect(totals.cached).toBe(0);
  });

  it('handles null token fields', () => {
    const models = { 'model-a': { tokens: { input: null, candidates: null } } };
    const totals = aggregateModelTokens(models);
    expect(totals.input).toBe(0);
    expect(totals.output).toBe(0);
  });
});

// ============================================================================
// extractUsageFromRecord
// ============================================================================

describe('extractUsageFromRecord', () => {
  it('extracts usage from valid record', () => {
    const record = {
      stats: {
        models: {
          'gemini-2.0': { tokens: { input: 100, candidates: 50, cached: 10 } },
        },
      },
    };
    const usage = extractUsageFromRecord(record);
    expect(usage).toBeDefined();
    expect(usage?.inputTokens).toBe(100);
    expect(usage?.outputTokens).toBe(50);
    expect(usage?.totalTokens).toBe(150);
    expect(usage?.cachedInputTokens).toBe(10);
  });

  it('returns undefined when stats is missing', () => {
    expect(extractUsageFromRecord({})).toBeUndefined();
  });

  it('returns undefined when models is missing', () => {
    expect(extractUsageFromRecord({ stats: {} })).toBeUndefined();
  });

  it('returns undefined when all tokens are zero', () => {
    const record = {
      stats: { models: { m: { tokens: { input: 0, candidates: 0 } } } },
    };
    expect(extractUsageFromRecord(record)).toBeUndefined();
  });

  it('omits cachedInputTokens when cached is zero', () => {
    const record = {
      stats: {
        models: {
          m: { tokens: { input: 10, candidates: 5, cached: 0 } },
        },
      },
    };
    const usage = extractUsageFromRecord(record);
    expect(usage).toBeDefined();
    expect('cachedInputTokens' in (usage ?? {})).toBe(false);
  });
});

// ============================================================================
// extractSessionIdFromText
// ============================================================================

describe('extractSessionIdFromText', () => {
  it('extracts session ID from session_id pattern', () => {
    const result = extractSessionIdFromText('session_id: abc123');
    expect(result).toBe('gem_abc123');
  });

  it('extracts session ID from gem_ prefix pattern', () => {
    const result = extractSessionIdFromText('Connected to gem_xyz789');
    expect(result).toBe('gem_xyz789');
  });

  it('returns null when no pattern matches', () => {
    expect(extractSessionIdFromText('No session here')).toBeNull();
  });

  it('handles session-id with hyphen', () => {
    const result = extractSessionIdFromText('session-id: test456');
    expect(result).toBe('gem_test456');
  });
});

// ============================================================================
// extractTextFromMarkdown
// ============================================================================

describe('extractTextFromMarkdown', () => {
  it('removes code blocks', () => {
    const input = 'Text before\n```js\nconsole.log("hi");\n```\nText after';
    const result = extractTextFromMarkdown(input);
    expect(result).not.toContain('console.log');
    expect(result).toContain('Text before');
    expect(result).toContain('Text after');
  });

  it('removes heading markers', () => {
    const result = extractTextFromMarkdown('## Heading\nContent');
    expect(result).not.toContain('##');
    expect(result).toContain('Heading');
    expect(result).toContain('Content');
  });

  it('removes bold formatting', () => {
    const result = extractTextFromMarkdown('This is **bold** text');
    expect(result).toContain('bold');
    expect(result).not.toContain('**');
  });

  it('removes italic formatting', () => {
    const result = extractTextFromMarkdown('This is _italic_ text');
    expect(result).toContain('italic');
    expect(result).not.toContain('_italic_');
  });

  it('trims whitespace', () => {
    const result = extractTextFromMarkdown('  Content  \n');
    expect(result).toBe('Content');
  });

  it('handles empty string', () => {
    expect(extractTextFromMarkdown('')).toBe('');
  });
});

// ============================================================================
// extractErrorMessage
// ============================================================================

describe('extractErrorMessage', () => {
  it('extracts message after error: prefix', () => {
    const result = extractErrorMessage('Error: Connection refused');
    expect(result).toBe('Connection refused');
  });

  it('extracts from lowercase error prefix', () => {
    const result = extractErrorMessage('error: something failed');
    expect(result).toBe('something failed');
  });

  it('returns first line as fallback', () => {
    const result = extractErrorMessage('Some output\nAnother line');
    expect(result).toBe('Some output');
  });

  it('returns "Unknown error" for empty input', () => {
    expect(extractErrorMessage('')).toBe('Unknown error');
  });

  it('skips blank lines', () => {
    const result = extractErrorMessage('\n\n  \nActual content');
    expect(result).toBe('Actual content');
  });
});

// ============================================================================
// isLikelyErrorOutput
// ============================================================================

describe('isLikelyErrorOutput', () => {
  it('detects output starting with error:', () => {
    expect(isLikelyErrorOutput('error: something broke')).toBe(true);
  });

  it('detects output starting with fatal:', () => {
    expect(isLikelyErrorOutput('fatal: repository not found')).toBe(true);
  });

  it('detects output starting with panic:', () => {
    expect(isLikelyErrorOutput('panic: runtime error')).toBe(true);
  });

  it('detects short error messages with keywords', () => {
    expect(isLikelyErrorOutput('failed')).toBe(true);
  });

  it('returns false for normal content', () => {
    expect(isLikelyErrorOutput('The application is running smoothly and this is good')).toBe(false);
  });

  it('returns false for long content with error keywords', () => {
    const longContent = 'This is a long response about how the system handles errors. '.repeat(10);
    expect(isLikelyErrorOutput(longContent)).toBe(false);
  });

  it('detects "cannot" in short messages without articles', () => {
    expect(isLikelyErrorOutput('cannot connect')).toBe(true);
  });

  it('returns false for short messages with articles', () => {
    // "the" presence makes it look like content, not error
    expect(isLikelyErrorOutput('the error was fixed')).toBe(false);
  });
});
