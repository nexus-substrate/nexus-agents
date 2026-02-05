/**
 * Tests for Context Pruner Helpers
 * @module agents/context-pruner-helpers.test
 */

import { describe, it, expect, vi } from 'vitest';
import type { ContextItem } from './context-manager.js';
import { ContentPriority } from './context-manager.js';
import {
  calculateDefaultTarget,
  calculatePriorityWeightedScore,
  scoreByPriorityWeightedAge,
  removeItemsToTarget,
  wrapPruneResult,
  createEmptyPruneOk,
} from './context-pruner-helpers.js';

vi.mock('../core/index.js', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    getTimeProvider: () => ({ now: () => 1700000000000 }),
  };
});

// ============================================================================
// Test Helpers
// ============================================================================

function makeItem(overrides: Partial<ContextItem> = {}): ContextItem {
  return {
    id: 'item-1',
    content: 'test content',
    priority: ContentPriority.EPHEMERAL,
    category: 'active',
    tokenCount: 100,
    addedAt: 1700000000000 - 3600000, // 1 hour ago
    ...overrides,
  };
}

// ============================================================================
// calculateDefaultTarget
// ============================================================================

describe('calculateDefaultTarget', () => {
  it('calculates tokens to free', () => {
    const target = calculateDefaultTarget({ availableTokens: 10000, totalTokens: 9000 }, 0.8);
    // targetUsage = 0.8 - 0.1 = 0.7
    // targetTotal = floor(10000 * 0.7) = 7000
    // tokens to free = max(0, 9000 - 7000) = 2000
    expect(target).toBe(2000);
  });

  it('returns 0 when under target', () => {
    const target = calculateDefaultTarget({ availableTokens: 10000, totalTokens: 5000 }, 0.8);
    expect(target).toBe(0);
  });

  it('handles threshold of 1.0', () => {
    const target = calculateDefaultTarget({ availableTokens: 10000, totalTokens: 9500 }, 1.0);
    // targetUsage = 1.0 - 0.1 = 0.9
    // targetTotal = floor(10000 * 0.9) = 9000
    // tokens to free = max(0, 9500 - 9000) = 500
    expect(target).toBe(500);
  });
});

// ============================================================================
// calculatePriorityWeightedScore
// ============================================================================

describe('calculatePriorityWeightedScore', () => {
  it('higher priority gives higher score', () => {
    const now = 1700000000000;
    const low = calculatePriorityWeightedScore(
      makeItem({ priority: ContentPriority.EPHEMERAL }),
      now
    );
    const high = calculatePriorityWeightedScore(
      makeItem({ priority: ContentPriority.SYSTEM }),
      now
    );
    expect(high).toBeGreaterThan(low);
  });

  it('older items get lower scores', () => {
    const now = 1700000000000;
    const recent = calculatePriorityWeightedScore(
      makeItem({ addedAt: now - 60000 }), // 1 min ago
      now
    );
    const old = calculatePriorityWeightedScore(
      makeItem({ addedAt: now - 86400000 }), // 1 day ago
      now
    );
    expect(old).toBeLessThan(recent);
  });

  it('returns priority for items added now', () => {
    const now = 1700000000000;
    const score = calculatePriorityWeightedScore(
      makeItem({ priority: ContentPriority.EPHEMERAL, addedAt: now }),
      now
    );
    // ageHours = 0, so score = 20 * (1 / (0 + 1)) = 20
    expect(score).toBe(20);
  });
});

// ============================================================================
// scoreByPriorityWeightedAge
// ============================================================================

describe('scoreByPriorityWeightedAge', () => {
  it('sorts items by score (lowest first)', () => {
    const items = [
      makeItem({ id: 'high', priority: ContentPriority.SYSTEM, addedAt: 1700000000000 - 1000 }),
      makeItem({
        id: 'low',
        priority: ContentPriority.EPHEMERAL,
        addedAt: 1700000000000 - 86400000,
      }),
    ];
    const sorted = scoreByPriorityWeightedAge(items);
    // low priority + old should have lowest score
    expect(sorted[0]!.id).toBe('low');
  });

  it('returns empty for empty input', () => {
    expect(scoreByPriorityWeightedAge([])).toEqual([]);
  });
});

// ============================================================================
// removeItemsToTarget
// ============================================================================

describe('removeItemsToTarget', () => {
  it('removes items until target reached', () => {
    const items = [
      makeItem({ id: 'a', tokenCount: 100, category: 'active' }),
      makeItem({ id: 'b', tokenCount: 150, category: 'active' }),
    ];
    const removed = new Set<string>();
    const result = removeItemsToTarget({
      sortedItems: items,
      targetTokens: 200,
      categories: ['active'],
      manager: {
        remove: (id) => {
          removed.add(id);
          return true;
        },
        getByCategory: () => [makeItem(), makeItem(), makeItem()],
      },
      minItemsPerCategory: 1,
      logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() } as never,
    });
    expect(result.tokensFreed).toBeGreaterThanOrEqual(200);
    expect(result.targetReached).toBe(true);
  });

  it('respects min items per category', () => {
    const items = [makeItem({ id: 'a', tokenCount: 500, category: 'active' })];
    const result = removeItemsToTarget({
      sortedItems: items,
      targetTokens: 500,
      categories: ['active'],
      manager: {
        remove: vi.fn(() => true),
        getByCategory: () => [makeItem()], // only 1 item remaining
      },
      minItemsPerCategory: 1,
      logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() } as never,
    });
    // Can't remove the last item
    expect(result.tokensFreed).toBe(0);
    expect(result.targetReached).toBe(false);
  });

  it('stops when target reached', () => {
    const removeFn = vi.fn(() => true);
    const items = [
      makeItem({ id: 'a', tokenCount: 300, category: 'active' }),
      makeItem({ id: 'b', tokenCount: 300, category: 'active' }),
    ];
    removeItemsToTarget({
      sortedItems: items,
      targetTokens: 200,
      categories: ['active'],
      manager: {
        remove: removeFn,
        getByCategory: () => [makeItem(), makeItem(), makeItem()],
      },
      minItemsPerCategory: 0,
      logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() } as never,
    });
    // Should only remove 1 item (300 >= 200)
    expect(removeFn).toHaveBeenCalledTimes(1);
  });
});

// ============================================================================
// wrapPruneResult / createEmptyPruneOk
// ============================================================================

describe('wrapPruneResult', () => {
  it('wraps result in ok', () => {
    const pruneResult = {
      removedItems: [],
      summarizedItems: [],
      tokensFreed: 100,
      targetReached: true,
    };
    const wrapped = wrapPruneResult(pruneResult);
    expect(wrapped.ok).toBe(true);
    expect(wrapped.value).toBe(pruneResult);
  });
});

describe('createEmptyPruneOk', () => {
  it('creates ok with empty prune result', () => {
    const result = createEmptyPruneOk();
    expect(result.ok).toBe(true);
    expect(result.value.removedItems).toEqual([]);
    expect(result.value.tokensFreed).toBe(0);
  });
});
