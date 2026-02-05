/**
 * Tests for ContextManager Helpers
 * @module agents/context-manager-helpers.test
 */

import { describe, it, expect } from 'vitest';
import type { ContextItem, ContextBudget } from './context-manager-types.js';
import { ContentPriority } from './context-manager-types.js';
import {
  sortItemsByPriority,
  filterAndSortByCategory,
  calculateCategoryTokens,
  calculateItemCounts,
  calculateTotalTokens,
  calculateAvailableTokens,
  getOverBudgetCategories,
  calculateContextStats,
  buildSystemPrompt,
  checkCategoryBudgetLimit,
  checkTotalBudgetLimit,
  buildMessagesFromItems,
  createCategoryBudgetError,
  createTotalBudgetError,
  addTokensToCategory,
  subtractTokensFromCategory,
  resetCategoryTokenCounts,
  createCategoryTokenCounts,
  calculateCategoryBudget,
} from './context-manager-helpers.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makeItem(overrides: Partial<ContextItem> = {}): ContextItem {
  return {
    id: 'item-1',
    content: 'test content',
    priority: ContentPriority.ACTIVE,
    category: 'active',
    tokenCount: 100,
    addedAt: Date.now(),
    ...overrides,
  };
}

const defaultBudget: ContextBudget = {
  system: 0.2,
  task: 0.3,
  active: 0.5,
  reserved: 0.1,
};

// ============================================================================
// sortItemsByPriority
// ============================================================================

describe('sortItemsByPriority', () => {
  it('sorts by priority descending', () => {
    const items = [
      makeItem({ id: 'low', priority: ContentPriority.EPHEMERAL }),
      makeItem({ id: 'high', priority: ContentPriority.SYSTEM }),
    ];
    const sorted = sortItemsByPriority(items);
    expect(sorted[0]!.id).toBe('high');
  });

  it('uses addedAt for same priority (FIFO)', () => {
    const items = [
      makeItem({ id: 'newer', priority: ContentPriority.ACTIVE, addedAt: 2000 }),
      makeItem({ id: 'older', priority: ContentPriority.ACTIVE, addedAt: 1000 }),
    ];
    const sorted = sortItemsByPriority(items);
    expect(sorted[0]!.id).toBe('older');
  });

  it('does not mutate original array', () => {
    const items = [
      makeItem({ priority: ContentPriority.EPHEMERAL }),
      makeItem({ priority: ContentPriority.SYSTEM }),
    ];
    sortItemsByPriority(items);
    expect(items[0]!.priority).toBe(ContentPriority.EPHEMERAL);
  });
});

// ============================================================================
// filterAndSortByCategory
// ============================================================================

describe('filterAndSortByCategory', () => {
  it('filters by category', () => {
    const items = [
      makeItem({ category: 'system' }),
      makeItem({ category: 'active' }),
      makeItem({ category: 'task' }),
    ];
    const filtered = filterAndSortByCategory(items, 'system');
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.category).toBe('system');
  });

  it('returns empty for no matches', () => {
    expect(filterAndSortByCategory([makeItem({ category: 'active' })], 'system')).toEqual([]);
  });
});

// ============================================================================
// calculateCategoryTokens
// ============================================================================

describe('calculateCategoryTokens', () => {
  it('sums tokens per category', () => {
    const items = [
      makeItem({ category: 'system', tokenCount: 50 }),
      makeItem({ category: 'system', tokenCount: 30 }),
      makeItem({ category: 'active', tokenCount: 100 }),
    ];
    const result = calculateCategoryTokens(items);
    expect(result.system).toBe(80);
    expect(result.active).toBe(100);
    expect(result.task).toBe(0);
  });

  it('returns zeros for empty input', () => {
    const result = calculateCategoryTokens([]);
    expect(result.system).toBe(0);
    expect(result.task).toBe(0);
    expect(result.active).toBe(0);
  });
});

// ============================================================================
// calculateItemCounts
// ============================================================================

describe('calculateItemCounts', () => {
  it('counts items per category', () => {
    const items = [
      makeItem({ category: 'system' }),
      makeItem({ category: 'system' }),
      makeItem({ category: 'task' }),
    ];
    const result = calculateItemCounts(items);
    expect(result.system).toBe(2);
    expect(result.task).toBe(1);
    expect(result.active).toBe(0);
  });
});

// ============================================================================
// calculateTotalTokens / calculateAvailableTokens
// ============================================================================

describe('calculateTotalTokens', () => {
  it('sums all categories', () => {
    expect(calculateTotalTokens({ system: 100, task: 200, active: 300 })).toBe(600);
  });
});

describe('calculateAvailableTokens', () => {
  it('reserves percentage of max', () => {
    expect(calculateAvailableTokens(10000, 0.1)).toBe(9000);
  });

  it('returns 0 for 100% reserved', () => {
    expect(calculateAvailableTokens(10000, 1.0)).toBe(0);
  });
});

// ============================================================================
// getOverBudgetCategories
// ============================================================================

describe('getOverBudgetCategories', () => {
  it('returns empty when all within budget', () => {
    const tokens = { system: 100, task: 100, active: 100 };
    expect(getOverBudgetCategories(tokens, 10000, defaultBudget)).toEqual([]);
  });

  it('returns over-budget categories', () => {
    // system budget = 10000 * 0.2 = 2000
    const tokens = { system: 3000, task: 100, active: 100 };
    const result = getOverBudgetCategories(tokens, 10000, defaultBudget);
    expect(result).toContain('system');
    expect(result).toHaveLength(1);
  });
});

// ============================================================================
// calculateContextStats
// ============================================================================

describe('calculateContextStats', () => {
  it('calculates complete stats', () => {
    const items = [
      makeItem({ category: 'system', tokenCount: 200 }),
      makeItem({ category: 'active', tokenCount: 300 }),
    ];
    const stats = calculateContextStats(items, 10000, defaultBudget);
    expect(stats.totalTokens).toBe(500);
    expect(stats.availableTokens).toBe(9000);
    expect(stats.itemCounts.system).toBe(1);
    expect(stats.itemCounts.active).toBe(1);
  });

  it('detects over-budget', () => {
    const items = [makeItem({ category: 'system', tokenCount: 5000 })];
    const stats = calculateContextStats(items, 10000, defaultBudget);
    expect(stats.isOverBudget).toBe(true);
    expect(stats.overBudgetCategories).toContain('system');
  });
});

// ============================================================================
// buildSystemPrompt
// ============================================================================

describe('buildSystemPrompt', () => {
  it('combines system items', () => {
    const items = [
      makeItem({
        category: 'system',
        content: 'You are a helper',
        priority: ContentPriority.SYSTEM,
      }),
      makeItem({ category: 'system', content: 'Be helpful', priority: ContentPriority.ACTIVE }),
      makeItem({ category: 'active', content: 'ignored' }),
    ];
    const prompt = buildSystemPrompt(items);
    expect(prompt).toContain('You are a helper');
    expect(prompt).toContain('Be helpful');
    expect(prompt).not.toContain('ignored');
  });

  it('returns undefined for no system items', () => {
    expect(buildSystemPrompt([makeItem({ category: 'active' })])).toBeUndefined();
  });
});

// ============================================================================
// checkCategoryBudgetLimit / checkTotalBudgetLimit
// ============================================================================

describe('checkCategoryBudgetLimit', () => {
  it('passes when within budget', () => {
    const result = checkCategoryBudgetLimit(100, 50, 10000, 0.2);
    expect(result.ok).toBe(true);
    expect(result.newTotal).toBe(150);
  });

  it('fails when exceeding budget', () => {
    const result = checkCategoryBudgetLimit(1900, 200, 10000, 0.2);
    expect(result.ok).toBe(false);
    expect(result.budget).toBe(2000);
  });
});

describe('checkTotalBudgetLimit', () => {
  it('passes when within total budget', () => {
    const result = checkTotalBudgetLimit(5000, 100, 10000, 0.1);
    expect(result.ok).toBe(true);
  });

  it('fails when exceeding total budget', () => {
    const result = checkTotalBudgetLimit(8500, 1000, 10000, 0.1);
    expect(result.ok).toBe(false);
  });
});

// ============================================================================
// buildMessagesFromItems
// ============================================================================

describe('buildMessagesFromItems', () => {
  it('converts non-system items to user messages', () => {
    const items = [
      makeItem({ category: 'system', content: 'sys' }),
      makeItem({ category: 'task', content: 'task1' }),
      makeItem({ category: 'active', content: 'active1' }),
    ];
    const messages = buildMessagesFromItems(items);
    expect(messages).toHaveLength(2);
    expect(messages[0]!.role).toBe('user');
    expect(messages[0]!.content).toBe('task1');
  });

  it('returns empty for system-only items', () => {
    expect(buildMessagesFromItems([makeItem({ category: 'system' })])).toEqual([]);
  });
});

// ============================================================================
// Error messages
// ============================================================================

describe('createCategoryBudgetError', () => {
  it('includes category name', () => {
    const result = { ok: false, currentTokens: 100, budget: 200, newTotal: 300 };
    expect(createCategoryBudgetError('system', result)).toContain('system');
    expect(createCategoryBudgetError('system', result)).toContain('300');
  });
});

describe('createTotalBudgetError', () => {
  it('includes budget values', () => {
    const result = { ok: false, currentTokens: 100, budget: 200, newTotal: 300 };
    expect(createTotalBudgetError(result)).toContain('300');
    expect(createTotalBudgetError(result)).toContain('200');
  });
});

// ============================================================================
// Category token count operations
// ============================================================================

describe('category token count operations', () => {
  it('creates initial counts', () => {
    const counts = createCategoryTokenCounts();
    expect(counts.get('system')).toBe(0);
    expect(counts.get('task')).toBe(0);
    expect(counts.get('active')).toBe(0);
  });

  it('adds tokens', () => {
    const counts = createCategoryTokenCounts();
    addTokensToCategory(counts, 'system', 100);
    expect(counts.get('system')).toBe(100);
    addTokensToCategory(counts, 'system', 50);
    expect(counts.get('system')).toBe(150);
  });

  it('subtracts tokens with floor at 0', () => {
    const counts = createCategoryTokenCounts();
    addTokensToCategory(counts, 'active', 100);
    subtractTokensFromCategory(counts, 'active', 150);
    expect(counts.get('active')).toBe(0);
  });

  it('resets all counts', () => {
    const counts = createCategoryTokenCounts();
    addTokensToCategory(counts, 'system', 100);
    addTokensToCategory(counts, 'task', 200);
    resetCategoryTokenCounts(counts);
    expect(counts.get('system')).toBe(0);
    expect(counts.get('task')).toBe(0);
  });
});

// ============================================================================
// calculateCategoryBudget
// ============================================================================

describe('calculateCategoryBudget', () => {
  it('calculates budget from allocation', () => {
    expect(calculateCategoryBudget(10000, 0.3)).toBe(3000);
  });

  it('floors the result', () => {
    expect(calculateCategoryBudget(10001, 0.3)).toBe(3000);
  });
});
