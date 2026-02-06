/**
 * Tests for pruning-strategies.ts
 *
 * Covers pure helper functions: findDominantCategory, createEmptyPruneResult,
 * removeItemsDirectly, extractKeywords, calculateRelevance.
 * Async functions requiring adapters are tested with mocks.
 */

import { describe, it, expect, vi } from 'vitest';
import { ContentPriority } from './context-manager.js';
import type { ContextItem } from './context-manager-types.js';
import type { IContextManagerOperations } from './pruning-strategies-types.js';
import {
  findDominantCategory,
  createEmptyPruneResult,
  removeItemsDirectly,
  extractKeywords,
  calculateRelevance,
} from './pruning-strategies.js';

// ============================================================================
// Helpers
// ============================================================================

function makeItem(
  id: string,
  category: ContextItem['category'] = 'active',
  tokenCount = 100
): ContextItem {
  return {
    id,
    content: `content-${id}`,
    priority: ContentPriority.ACTIVE,
    category,
    tokenCount,
    addedAt: Date.now(),
  };
}

function makeMockManager(): IContextManagerOperations {
  return {
    remove: vi.fn(),
    add: vi.fn(() => Promise.resolve({ ok: true as const, value: undefined })),
    countTokens: vi.fn(() => Promise.resolve(50)),
  } as unknown as IContextManagerOperations;
}

// ============================================================================
// findDominantCategory
// ============================================================================

describe('findDominantCategory', () => {
  it('returns active for empty array', () => {
    const result = findDominantCategory([]);
    expect(result).toBe('active');
  });

  it('returns the most common category', () => {
    const items = [makeItem('1', 'system'), makeItem('2', 'system'), makeItem('3', 'active')];
    const result = findDominantCategory(items);
    expect(result).toBe('system');
  });

  it('returns active when all items are active', () => {
    const items = [makeItem('1', 'active'), makeItem('2', 'active')];
    const result = findDominantCategory(items);
    expect(result).toBe('active');
  });

  it('handles single item', () => {
    const items = [makeItem('1', 'task')];
    const result = findDominantCategory(items);
    expect(result).toBe('task');
  });
});

// ============================================================================
// createEmptyPruneResult
// ============================================================================

describe('createEmptyPruneResult', () => {
  it('creates result with targetReached true by default', () => {
    const result = createEmptyPruneResult();
    expect(result.removedItems).toEqual([]);
    expect(result.summarizedItems).toEqual([]);
    expect(result.tokensFreed).toBe(0);
    expect(result.targetReached).toBe(true);
  });

  it('respects targetReached parameter', () => {
    const result = createEmptyPruneResult(false);
    expect(result.targetReached).toBe(false);
  });
});

// ============================================================================
// removeItemsDirectly
// ============================================================================

describe('removeItemsDirectly', () => {
  it('removes items until target tokens reached', () => {
    const manager = makeMockManager();
    const items = [makeItem('a', 'active', 50), makeItem('b', 'active', 60)];

    const result = removeItemsDirectly(items, 100, manager);

    expect(result.removedItems).toHaveLength(2);
    expect(result.tokensFreed).toBe(110);
    expect(result.targetReached).toBe(true);
    expect(manager.remove).toHaveBeenCalledTimes(2);
  });

  it('stops early when target met', () => {
    const manager = makeMockManager();
    const items = [makeItem('a', 'active', 200), makeItem('b', 'active', 50)];

    const result = removeItemsDirectly(items, 100, manager);

    expect(result.removedItems).toHaveLength(1);
    expect(result.tokensFreed).toBe(200);
    expect(result.targetReached).toBe(true);
  });

  it('reports targetReached false when not enough tokens', () => {
    const manager = makeMockManager();
    const items = [makeItem('a', 'active', 10)];

    const result = removeItemsDirectly(items, 100, manager);

    expect(result.targetReached).toBe(false);
    expect(result.tokensFreed).toBe(10);
  });

  it('handles empty items array', () => {
    const manager = makeMockManager();
    const result = removeItemsDirectly([], 100, manager);

    expect(result.removedItems).toEqual([]);
    expect(result.tokensFreed).toBe(0);
    expect(result.targetReached).toBe(false);
  });

  it('returns empty summarizedItems', () => {
    const manager = makeMockManager();
    const result = removeItemsDirectly([makeItem('a')], 50, manager);
    expect(result.summarizedItems).toEqual([]);
  });
});

// ============================================================================
// extractKeywords
// ============================================================================

describe('extractKeywords', () => {
  it('extracts words longer than 2 characters', () => {
    const keywords = extractKeywords('the quick brown fox');
    expect(keywords.has('quick')).toBe(true);
    expect(keywords.has('brown')).toBe(true);
    expect(keywords.has('fox')).toBe(true);
    expect(keywords.has('the')).toBe(false); // stop word
  });

  it('converts to lowercase', () => {
    const keywords = extractKeywords('Hello World');
    expect(keywords.has('hello')).toBe(true);
    expect(keywords.has('world')).toBe(true);
  });

  it('splits on non-word characters', () => {
    // Note: underscore is a word character in \W regex, so foo_bar stays as one token
    const keywords = extractKeywords('hello-world, alpha beta');
    expect(keywords.has('hello')).toBe(true);
    expect(keywords.has('world')).toBe(true);
    expect(keywords.has('alpha')).toBe(true);
    expect(keywords.has('beta')).toBe(true);
  });

  it('filters stop words', () => {
    const keywords = extractKeywords('this is a test with some words');
    expect(keywords.has('this')).toBe(false);
    expect(keywords.has('test')).toBe(true);
    expect(keywords.has('words')).toBe(true);
  });

  it('returns empty set for empty string', () => {
    const keywords = extractKeywords('');
    expect(keywords.size).toBe(0);
  });

  it('returns empty set for only short words', () => {
    const keywords = extractKeywords('a b c');
    expect(keywords.size).toBe(0);
  });
});

// ============================================================================
// calculateRelevance
// ============================================================================

describe('calculateRelevance', () => {
  it('returns 0.5 when no keywords provided', () => {
    const score = calculateRelevance('some content', new Set());
    expect(score).toBe(0.5);
  });

  it('returns 0 when content has no matching words', () => {
    const keywords = new Set(['alpha', 'beta', 'gamma']);
    const score = calculateRelevance('no matching content here', keywords);
    expect(score).toBe(0);
  });

  it('returns higher score for more overlap', () => {
    const keywords = new Set(['hello', 'world', 'test']);
    const lowScore = calculateRelevance('hello there friend', keywords);
    const highScore = calculateRelevance('hello world test complete', keywords);
    expect(highScore).toBeGreaterThan(lowScore);
  });

  it('returns 0 for empty content', () => {
    const keywords = new Set(['hello']);
    const score = calculateRelevance('', keywords);
    expect(score).toBe(0);
  });

  it('uses Jaccard similarity (intersection / union)', () => {
    // Content keywords: {hello, world}
    // Task keywords: {hello, test}
    // Intersection: 1 (hello)
    // Union: 3 (hello, world, test)
    // Expected: 1/3
    const keywords = new Set(['hello', 'test']);
    const score = calculateRelevance('hello world', keywords);
    expect(score).toBeCloseTo(1 / 3, 2);
  });

  it('handles perfect overlap', () => {
    const keywords = new Set(['alpha', 'beta']);
    const score = calculateRelevance('alpha beta', keywords);
    expect(score).toBe(1.0);
  });
});
