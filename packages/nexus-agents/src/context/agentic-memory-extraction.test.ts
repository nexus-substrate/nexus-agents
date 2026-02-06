/**
 * Tests for Agentic Memory Extraction Helpers
 *
 * @module context/agentic-memory-extraction.test
 */

import { describe, it, expect } from 'vitest';
import {
  extractKeywords,
  extractSemanticTags,
  extractEntities,
  generateContextDescription,
  extractAttributes,
  mergeExtractionConfig,
} from './agentic-memory-extraction.js';
import { DEFAULT_EXTRACTION_CONFIG } from './agentic-memory-types.js';

// ============================================================================
// extractKeywords
// ============================================================================

describe('extractKeywords', () => {
  it('extracts frequent words from text', () => {
    const text = 'function handler function controller function service';
    const keywords = extractKeywords(text, 3);

    expect(keywords[0]).toBe('function');
    expect(keywords.length).toBeLessThanOrEqual(3);
  });

  it('returns empty array for empty text', () => {
    expect(extractKeywords('', 5)).toEqual([]);
  });

  it('returns empty array for very short words only', () => {
    // tokenizeFiltered filters words shorter than 2 chars
    expect(extractKeywords('a b c', 5)).toEqual([]);
  });

  it('respects maxKeywords limit', () => {
    const text = 'alpha beta gamma delta epsilon zeta';
    const keywords = extractKeywords(text, 2);

    expect(keywords.length).toBeLessThanOrEqual(2);
  });

  it('sorts by frequency descending', () => {
    const text = 'error error error warning warning info';
    const keywords = extractKeywords(text, 3);

    expect(keywords[0]).toBe('error');
    expect(keywords[1]).toBe('warning');
  });
});

// ============================================================================
// extractSemanticTags
// ============================================================================

describe('extractSemanticTags', () => {
  it('matches code-related patterns', () => {
    const tags = extractSemanticTags('function handler class Widget', 5);
    expect(tags).toContain('code');
  });

  it('matches testing patterns', () => {
    const tags = extractSemanticTags('describe test suite expect assertion', 5);
    expect(tags).toContain('testing');
  });

  it('matches security patterns', () => {
    const tags = extractSemanticTags('authentication token credential access', 5);
    expect(tags).toContain('security');
  });

  it('matches api patterns', () => {
    const tags = extractSemanticTags('REST endpoint HTTP request', 5);
    expect(tags).toContain('api');
  });

  it('returns empty for unmatched text', () => {
    const tags = extractSemanticTags('xyzzy foobar baz', 5);
    expect(tags).toEqual([]);
  });

  it('respects maxTags limit', () => {
    const text = 'function test security api database config deploy agent memory';
    const tags = extractSemanticTags(text, 2);
    expect(tags.length).toBeLessThanOrEqual(2);
  });

  it('matches multiple categories', () => {
    const text = 'function test error api database config security performance deploy agent memory';
    const tags = extractSemanticTags(text, 20);
    expect(tags.length).toBeGreaterThanOrEqual(5);
  });
});

// ============================================================================
// extractEntities
// ============================================================================

describe('extractEntities', () => {
  it('extracts file references', () => {
    const text = 'Check the file ./src/index.ts for details';
    const entities = extractEntities(text, 10);

    const files = entities.filter((e) => e.type === 'file');
    expect(files.length).toBeGreaterThan(0);
  });

  it('extracts CamelCase code references', () => {
    const text = 'The WaveScheduler and ContextManager are responsible';
    const entities = extractEntities(text, 10);

    const code = entities.filter((e) => e.type === 'code');
    expect(code.length).toBeGreaterThan(0);
    expect(code.some((e) => e.name === 'WaveScheduler')).toBe(true);
  });

  it('extracts snake_case code references', () => {
    const text = 'Use the wave_scheduler and context_manager modules';
    const entities = extractEntities(text, 10);

    const code = entities.filter((e) => e.type === 'code');
    expect(code.some((e) => e.name === 'wave_scheduler')).toBe(true);
  });

  it('deduplicates entities', () => {
    const text = 'WaveScheduler is used. WaveScheduler handles waves.';
    const entities = extractEntities(text, 10);

    const names = entities.map((e) => e.name.toLowerCase());
    const unique = new Set(names);
    expect(names.length).toBe(unique.size);
  });

  it('respects maxEntities limit', () => {
    const text = 'WaveScheduler ContextManager AgentFactory ExpertRegistry TaskAnalyzer';
    const entities = extractEntities(text, 2);

    expect(entities.length).toBeLessThanOrEqual(2);
  });

  it('filters out PII patterns', () => {
    const text = 'Contact john@example.com or call 555-123-4567';
    const entities = extractEntities(text, 10);

    const names = entities.map((e) => e.name);
    expect(names).not.toContain('john@example.com');
    expect(names).not.toContain('555-123-4567');
  });

  it('returns empty for text with no entities', () => {
    const text = 'no entities here at all';
    const entities = extractEntities(text, 10);
    expect(entities).toEqual([]);
  });
});

// ============================================================================
// generateContextDescription
// ============================================================================

describe('generateContextDescription', () => {
  it('returns first sentence if short enough', () => {
    const text = 'This is a module. It does things.';
    const desc = generateContextDescription(text, 100);
    expect(desc).toBe('This is a module.');
  });

  it('returns full text if under maxLength', () => {
    const text = 'Short text';
    const desc = generateContextDescription(text, 100);
    expect(desc).toBe('Short text');
  });

  it('truncates at word boundary with ellipsis', () => {
    const text = 'This is a very long sentence that goes on and on and on and on';
    const desc = generateContextDescription(text, 30);

    expect(desc.length).toBeLessThanOrEqual(33); // 30 + "..."
    expect(desc).toMatch(/\.\.\.$/);
  });

  it('handles empty text', () => {
    const desc = generateContextDescription('', 100);
    expect(desc).toBe('');
  });
});

// ============================================================================
// extractAttributes
// ============================================================================

describe('extractAttributes', () => {
  it('extracts full attributes from text', () => {
    const attrs = extractAttributes(
      'The WaveScheduler function handles test execution for security',
      DEFAULT_EXTRACTION_CONFIG
    );

    expect(attrs.keywords.length).toBeGreaterThan(0);
    expect(attrs.semanticTags.length).toBeGreaterThan(0);
    expect(attrs.contextDescription).toBeTruthy();
    expect(attrs.attributesUpdatedAt).toBeInstanceOf(Date);
  });

  it('handles non-string values', () => {
    const attrs = extractAttributes({ key: 'value', nested: { a: 1 } }, DEFAULT_EXTRACTION_CONFIG);
    expect(attrs.contextDescription).toBeTruthy();
  });

  it('handles null/undefined values', () => {
    const attrs = extractAttributes(null, DEFAULT_EXTRACTION_CONFIG);
    expect(attrs.keywords).toBeDefined();
    expect(attrs.contextDescription).toBeDefined();
  });
});

// ============================================================================
// mergeExtractionConfig
// ============================================================================

describe('mergeExtractionConfig', () => {
  it('returns defaults when no config provided', () => {
    const config = mergeExtractionConfig();
    expect(config).toEqual(DEFAULT_EXTRACTION_CONFIG);
  });

  it('returns defaults for undefined', () => {
    const config = mergeExtractionConfig(undefined);
    expect(config).toEqual(DEFAULT_EXTRACTION_CONFIG);
  });

  it('merges partial config with defaults', () => {
    const config = mergeExtractionConfig({ maxKeywords: 20 });
    expect(config.maxKeywords).toBe(20);
    expect(config.maxSemanticTags).toBe(DEFAULT_EXTRACTION_CONFIG.maxSemanticTags);
  });

  it('overrides all fields when fully specified', () => {
    const config = mergeExtractionConfig({
      maxKeywords: 1,
      maxSemanticTags: 2,
      maxContextLength: 3,
      maxEntities: 4,
    });
    expect(config).toEqual({
      maxKeywords: 1,
      maxSemanticTags: 2,
      maxContextLength: 3,
      maxEntities: 4,
    });
  });
});
