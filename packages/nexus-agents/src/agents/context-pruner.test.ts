/**
 * nexus-agents/agents - ContextPruner Tests
 */

import { describe, it, expect, vi, type Mock } from 'vitest';
import type { IModelAdapter, ILogger, CompletionResponse, StreamChunk } from '../core/index.js';
import { ok, ValidationError } from '../core/index.js';
import { ContextManager, ContentPriority } from './context-manager.js';
import { ContextPruner, PruningStrategy, type ContextPrunerConfig } from './context-pruner.js';

/**
 * Mock logger for testing.
 */
interface MockLogger extends ILogger {
  debug: Mock;
  info: Mock;
  warn: Mock;
  error: Mock;
  child: Mock;
  setLevel: Mock;
}

function createMockLogger(): MockLogger {
  const mock: MockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
    setLevel: vi.fn(),
  };
  mock.child.mockReturnThis();
  return mock;
}

/**
 * Mock model adapter for testing.
 */
function createMockAdapter(): IModelAdapter & {
  setTokenCount: (count: number) => void;
  setSummaryResponse: (text: string) => void;
} {
  let tokenCount = 10;
  let summaryText = 'Summarized content';

  return {
    providerId: 'test-provider',
    modelId: 'test-model',
    capabilities: ['completion'],
    setTokenCount: (count: number) => {
      tokenCount = count;
    },
    setSummaryResponse: (text: string) => {
      summaryText = text;
    },
    complete: vi.fn().mockImplementation(() => {
      const response: CompletionResponse = {
        content: [{ type: 'text', text: summaryText }],
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
        stopReason: 'end_turn',
        model: 'test-model',
      };
      return Promise.resolve(ok(response));
    }),
    stream: vi.fn().mockImplementation(function* (): Iterable<StreamChunk> {
      yield { type: 'message_start', message: { model: 'test-model' } };
      yield { type: 'message_stop' };
    }),
    countTokens: vi.fn().mockImplementation(() => Promise.resolve(tokenCount)),
    validateConfig: vi.fn().mockReturnValue(ok(undefined)),
  };
}

/**
 * Create a test setup with manager, pruner, and optional adapter.
 */
interface TestSetup {
  manager: ContextManager;
  pruner: ContextPruner;
  adapter: ReturnType<typeof createMockAdapter>;
  logger: MockLogger;
}

function createTestSetup(prunerConfig: Partial<ContextPrunerConfig> = {}): TestSetup {
  const adapter = createMockAdapter();
  const logger = createMockLogger();
  const manager = new ContextManager({
    maxTokens: 10000,
    adapter,
    logger,
  });
  const pruner = new ContextPruner({
    contextManager: manager,
    adapter,
    logger,
    ...prunerConfig,
  });

  return { manager, pruner, adapter, logger };
}

describe('ContextPruner', () => {
  describe('constructor', () => {
    it('should create with required config', () => {
      const { pruner } = createTestSetup();
      expect(pruner).toBeInstanceOf(ContextPruner);
    });

    it('should use default values when not specified', () => {
      const { pruner } = createTestSetup();
      // Should not throw
      expect(pruner.shouldPrune()).toBe(false);
    });

    it('should accept custom configuration', () => {
      const { pruner } = createTestSetup({
        defaultStrategy: PruningStrategy.OLDEST_FIRST,
        minItemsPerCategory: 2,
        protectedPriority: ContentPriority.TASK,
        autoTriggerThreshold: 0.7,
      });
      expect(pruner).toBeInstanceOf(ContextPruner);
    });

    it('should throw ValidationError for invalid config', () => {
      const { manager, adapter, logger } = createTestSetup();

      expect(() => {
        new ContextPruner({
          contextManager: manager,
          adapter,
          logger,
          minItemsPerCategory: -1, // Invalid
        });
      }).toThrow(ValidationError);
    });
  });

  describe('shouldPrune', () => {
    it('should return false when below threshold', async () => {
      const { manager, pruner, adapter } = createTestSetup({
        autoTriggerThreshold: 0.9,
      });

      adapter.setTokenCount(100);
      await manager.add({
        id: 'item-1',
        content: 'Test',
        priority: ContentPriority.ACTIVE,
        category: 'active',
      });

      expect(pruner.shouldPrune()).toBe(false);
    });

    it('should return true when above threshold', async () => {
      const { manager, pruner, adapter } = createTestSetup({
        autoTriggerThreshold: 0.5,
      });

      // Fill to over 50% of available (8500)
      adapter.setTokenCount(5000);
      await manager.add({
        id: 'large-item',
        content: 'Large',
        priority: ContentPriority.ACTIVE,
        category: 'active',
      });

      expect(pruner.shouldPrune()).toBe(true);
    });
  });

  describe('prune - OLDEST_FIRST strategy', () => {
    it('should remove oldest items first', async () => {
      const { manager, pruner, adapter } = createTestSetup({
        defaultStrategy: PruningStrategy.OLDEST_FIRST,
        minItemsPerCategory: 0,
      });

      // Add items (they will have sequential addedAt times)
      adapter.setTokenCount(100);
      await manager.add({
        id: 'oldest',
        content: 'Oldest',
        priority: ContentPriority.HISTORY,
        category: 'active',
      });

      adapter.setTokenCount(100);
      await manager.add({
        id: 'middle',
        content: 'Middle',
        priority: ContentPriority.HISTORY,
        category: 'active',
      });

      adapter.setTokenCount(100);
      await manager.add({
        id: 'newest',
        content: 'Newest',
        priority: ContentPriority.HISTORY,
        category: 'active',
      });

      const result = await pruner.prune({
        targetTokens: 150,
        strategy: PruningStrategy.OLDEST_FIRST,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Should remove oldest items first
        expect(result.value.removedItems.length).toBeGreaterThan(0);
        expect(result.value.removedItems[0]?.id).toBe('oldest');
        expect(result.value.tokensFreed).toBeGreaterThanOrEqual(100);
      }
    });
  });

  describe('prune - LOWEST_PRIORITY strategy', () => {
    it('should remove lowest priority items first', async () => {
      const { manager, pruner, adapter } = createTestSetup({
        defaultStrategy: PruningStrategy.LOWEST_PRIORITY,
        minItemsPerCategory: 0,
        protectedPriority: ContentPriority.SYSTEM, // Only protect SYSTEM
      });

      adapter.setTokenCount(100);
      await manager.add({
        id: 'high-priority',
        content: 'High',
        priority: ContentPriority.TASK,
        category: 'active',
      });

      adapter.setTokenCount(100);
      await manager.add({
        id: 'low-priority',
        content: 'Low',
        priority: ContentPriority.EPHEMERAL,
        category: 'active',
      });

      adapter.setTokenCount(100);
      await manager.add({
        id: 'medium-priority',
        content: 'Medium',
        priority: ContentPriority.HISTORY,
        category: 'active',
      });

      const result = await pruner.prune({
        targetTokens: 150,
        strategy: PruningStrategy.LOWEST_PRIORITY,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Should remove lowest priority (EPHEMERAL) first
        expect(result.value.removedItems.length).toBeGreaterThan(0);
        expect(result.value.removedItems[0]?.id).toBe('low-priority');
      }
    });
  });

  describe('prune - PRIORITY_WEIGHTED_AGE strategy', () => {
    it('should consider both priority and age', async () => {
      const { manager, pruner, adapter } = createTestSetup({
        defaultStrategy: PruningStrategy.PRIORITY_WEIGHTED_AGE,
        minItemsPerCategory: 0,
        protectedPriority: ContentPriority.SYSTEM,
      });

      // Add items with different priorities
      adapter.setTokenCount(100);
      await manager.add({
        id: 'old-high',
        content: 'Old High Priority',
        priority: ContentPriority.TASK,
        category: 'active',
      });

      adapter.setTokenCount(100);
      await manager.add({
        id: 'new-low',
        content: 'New Low Priority',
        priority: ContentPriority.EPHEMERAL,
        category: 'active',
      });

      const result = await pruner.prune({
        targetTokens: 100,
        strategy: PruningStrategy.PRIORITY_WEIGHTED_AGE,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Should remove based on combined score
        expect(result.value.removedItems.length).toBeGreaterThan(0);
      }
    });
  });

  describe('prune - SUMMARIZE strategy', () => {
    it('should summarize old content', async () => {
      const { manager, pruner, adapter } = createTestSetup({
        defaultStrategy: PruningStrategy.SUMMARIZE,
        minItemsPerCategory: 0,
        protectedPriority: ContentPriority.SYSTEM,
      });

      adapter.setSummaryResponse('This is a summary');

      // Add items to summarize
      adapter.setTokenCount(100);
      await manager.add({
        id: 'item-1',
        content: 'First item content',
        priority: ContentPriority.HISTORY,
        category: 'active',
      });

      adapter.setTokenCount(100);
      await manager.add({
        id: 'item-2',
        content: 'Second item content',
        priority: ContentPriority.HISTORY,
        category: 'active',
      });

      adapter.setTokenCount(100);
      await manager.add({
        id: 'item-3',
        content: 'Third item content',
        priority: ContentPriority.HISTORY,
        category: 'active',
      });

      adapter.setTokenCount(100);
      await manager.add({
        id: 'item-4',
        content: 'Fourth item content',
        priority: ContentPriority.HISTORY,
        category: 'active',
      });

      const result = await pruner.prune({
        targetTokens: 200,
        strategy: PruningStrategy.SUMMARIZE,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.summarizedItems.length).toBeGreaterThan(0);
        // adapter.complete should have been called for summarization

        expect(adapter.complete).toHaveBeenCalled();
      }
    });

    it('should fall back to priority-weighted when no adapter', async () => {
      const logger = createMockLogger();
      const manager = new ContextManager({ maxTokens: 10000 });
      const pruner = new ContextPruner({
        contextManager: manager,
        logger,
        minItemsPerCategory: 0,
        protectedPriority: ContentPriority.SYSTEM,
      });

      await manager.add({
        id: 'item-1',
        content: 'Test content',
        priority: ContentPriority.HISTORY,
        category: 'active',
      });

      const result = await pruner.prune({
        targetTokens: 10,
        strategy: PruningStrategy.SUMMARIZE,
      });

      expect(result.ok).toBe(true);
      expect(logger.warn).toHaveBeenCalledWith(
        'No adapter configured, falling back to priority-weighted pruning'
      );
    });

    it('should use custom summarization prompt', async () => {
      const { manager, pruner, adapter } = createTestSetup({
        minItemsPerCategory: 0,
        protectedPriority: ContentPriority.SYSTEM,
      });

      adapter.setTokenCount(100);
      await manager.add({
        id: 'item-1',
        content: 'Test',
        priority: ContentPriority.HISTORY,
        category: 'active',
      });

      await manager.add({
        id: 'item-2',
        content: 'Test2',
        priority: ContentPriority.HISTORY,
        category: 'active',
      });

      const customPrompt = 'Custom summarization prompt:';
      await pruner.prune({
        targetTokens: 50,
        strategy: PruningStrategy.SUMMARIZE,
        summarizationPrompt: customPrompt,
      });

      expect(adapter.complete).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: expect.stringContaining(customPrompt) as unknown,
            }),
          ]) as unknown,
        })
      );
    });
  });

  describe('prune - category filtering', () => {
    it('should only prune specified categories', async () => {
      const { manager, pruner, adapter } = createTestSetup({
        minItemsPerCategory: 0,
        protectedPriority: ContentPriority.SYSTEM,
      });

      adapter.setTokenCount(100);
      await manager.add({
        id: 'active-item',
        content: 'Active',
        priority: ContentPriority.HISTORY,
        category: 'active',
      });

      adapter.setTokenCount(100);
      await manager.add({
        id: 'task-item',
        content: 'Task',
        priority: ContentPriority.HISTORY,
        category: 'task',
      });

      const result = await pruner.prune({
        targetTokens: 100,
        categories: ['active'],
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const removedIds = result.value.removedItems.map((i) => i.id);
        expect(removedIds).toContain('active-item');
        expect(removedIds).not.toContain('task-item');
      }
    });
  });

  describe('prune - protected priority', () => {
    it('should not prune items at or above protected priority', async () => {
      const { manager, pruner, adapter } = createTestSetup({
        minItemsPerCategory: 0,
        protectedPriority: ContentPriority.TASK,
      });

      adapter.setTokenCount(100);
      await manager.add({
        id: 'protected',
        content: 'Protected',
        priority: ContentPriority.TASK,
        category: 'active',
      });

      adapter.setTokenCount(100);
      await manager.add({
        id: 'prunable',
        content: 'Prunable',
        priority: ContentPriority.HISTORY,
        category: 'active',
      });

      const result = await pruner.prune({ targetTokens: 200 });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const removedIds = result.value.removedItems.map((i) => i.id);
        expect(removedIds).not.toContain('protected');
        expect(removedIds).toContain('prunable');
      }
    });
  });

  describe('prune - minimum items per category', () => {
    it('should respect minimum items constraint', async () => {
      const { manager, pruner, adapter } = createTestSetup({
        minItemsPerCategory: 2,
        protectedPriority: ContentPriority.SYSTEM,
      });

      adapter.setTokenCount(100);
      await manager.add({
        id: 'item-1',
        content: 'Item 1',
        priority: ContentPriority.HISTORY,
        category: 'active',
      });

      await manager.add({
        id: 'item-2',
        content: 'Item 2',
        priority: ContentPriority.HISTORY,
        category: 'active',
      });

      await manager.add({
        id: 'item-3',
        content: 'Item 3',
        priority: ContentPriority.HISTORY,
        category: 'active',
      });

      const result = await pruner.prune({ targetTokens: 300 });

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Should only remove 1 item (keeping 2 minimum)
        expect(result.value.removedItems.length).toBe(1);
      }
    });
  });

  describe('prune - target reached', () => {
    it('should report when target is reached', async () => {
      const { manager, pruner, adapter } = createTestSetup({
        minItemsPerCategory: 0,
        protectedPriority: ContentPriority.SYSTEM,
      });

      adapter.setTokenCount(100);
      await manager.add({
        id: 'item-1',
        content: 'Test',
        priority: ContentPriority.HISTORY,
        category: 'active',
      });

      const result = await pruner.prune({ targetTokens: 50 });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.targetReached).toBe(true);
        expect(result.value.tokensFreed).toBeGreaterThanOrEqual(50);
      }
    });

    it('should report when target is not reached', async () => {
      const { manager, pruner, adapter } = createTestSetup({
        minItemsPerCategory: 1,
        protectedPriority: ContentPriority.SYSTEM,
      });

      adapter.setTokenCount(100);
      await manager.add({
        id: 'item-1',
        content: 'Test',
        priority: ContentPriority.HISTORY,
        category: 'active',
      });

      // Cannot reach target because of minItemsPerCategory
      const result = await pruner.prune({ targetTokens: 100 });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.targetReached).toBe(false);
      }
    });
  });

  describe('prune - no action needed', () => {
    it('should return empty result when no pruning needed', async () => {
      const { pruner } = createTestSetup();

      const result = await pruner.prune({ targetTokens: 0 });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.removedItems).toHaveLength(0);
        expect(result.value.tokensFreed).toBe(0);
        expect(result.value.targetReached).toBe(true);
      }
    });
  });

  describe('pruneCategory', () => {
    it('should prune specific category', async () => {
      const { manager, pruner, adapter } = createTestSetup({
        minItemsPerCategory: 0,
        protectedPriority: ContentPriority.SYSTEM,
      });

      adapter.setTokenCount(100);
      await manager.add({
        id: 'active-1',
        content: 'Active',
        priority: ContentPriority.HISTORY,
        category: 'active',
      });

      await manager.add({
        id: 'task-1',
        content: 'Task',
        priority: ContentPriority.HISTORY,
        category: 'task',
      });

      const result = await pruner.pruneCategory('active', 100);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const removedIds = result.value.removedItems.map((i) => i.id);
        expect(removedIds).toContain('active-1');
        expect(removedIds).not.toContain('task-1');
      }
    });
  });

  describe('getPruneCandidates', () => {
    it('should return prunable items', async () => {
      const { manager, pruner, adapter } = createTestSetup({
        protectedPriority: ContentPriority.TASK,
      });

      adapter.setTokenCount(100);
      await manager.add({
        id: 'protected',
        content: 'Protected',
        priority: ContentPriority.TASK,
        category: 'active',
      });

      await manager.add({
        id: 'prunable',
        content: 'Prunable',
        priority: ContentPriority.HISTORY,
        category: 'active',
      });

      const candidates = pruner.getPruneCandidates(['active']);

      expect(candidates).toHaveLength(1);
      expect(candidates[0]?.id).toBe('prunable');
    });

    it('should filter by categories', async () => {
      const { manager, pruner, adapter } = createTestSetup({
        protectedPriority: ContentPriority.SYSTEM,
      });

      adapter.setTokenCount(100);
      await manager.add({
        id: 'active-item',
        content: 'Active',
        priority: ContentPriority.HISTORY,
        category: 'active',
      });

      await manager.add({
        id: 'task-item',
        content: 'Task',
        priority: ContentPriority.HISTORY,
        category: 'task',
      });

      const candidates = pruner.getPruneCandidates(['active']);

      expect(candidates).toHaveLength(1);
      expect(candidates[0]?.id).toBe('active-item');
    });
  });

  describe('estimateFreeableTokens', () => {
    it('should estimate tokens that can be freed', async () => {
      const { manager, pruner, adapter } = createTestSetup({
        minItemsPerCategory: 1,
        protectedPriority: ContentPriority.SYSTEM,
      });

      adapter.setTokenCount(100);
      await manager.add({
        id: 'item-1',
        content: 'Item 1',
        priority: ContentPriority.HISTORY,
        category: 'active',
      });

      await manager.add({
        id: 'item-2',
        content: 'Item 2',
        priority: ContentPriority.HISTORY,
        category: 'active',
      });

      await manager.add({
        id: 'item-3',
        content: 'Item 3',
        priority: ContentPriority.HISTORY,
        category: 'active',
      });

      const estimate = pruner.estimateFreeableTokens(['active']);

      // 3 items, 100 tokens each, minus 1 minimum = 200 freeable
      expect(estimate).toBe(200);
    });

    it('should account for protected items', async () => {
      const { manager, pruner, adapter } = createTestSetup({
        minItemsPerCategory: 0,
        protectedPriority: ContentPriority.TASK,
      });

      adapter.setTokenCount(100);
      await manager.add({
        id: 'protected',
        content: 'Protected',
        priority: ContentPriority.TASK,
        category: 'active',
      });

      await manager.add({
        id: 'prunable',
        content: 'Prunable',
        priority: ContentPriority.HISTORY,
        category: 'active',
      });

      const estimate = pruner.estimateFreeableTokens(['active']);

      // Only 1 prunable item (100 tokens)
      expect(estimate).toBe(100);
    });
  });
});

describe('PruningStrategy', () => {
  it('should have all expected strategies', () => {
    expect(PruningStrategy.OLDEST_FIRST).toBe('oldest_first');
    expect(PruningStrategy.LOWEST_PRIORITY).toBe('lowest_priority');
    expect(PruningStrategy.PRIORITY_WEIGHTED_AGE).toBe('priority_weighted_age');
    expect(PruningStrategy.SUMMARIZE).toBe('summarize');
    expect(PruningStrategy.SLIDING_WINDOW).toBe('sliding_window');
    expect(PruningStrategy.HIERARCHICAL).toBe('hierarchical');
    expect(PruningStrategy.SEMANTIC).toBe('semantic');
  });
});

describe('ContextPruner - SLIDING_WINDOW strategy', () => {
  it('should keep recent messages and summarize older ones', async () => {
    const { manager, pruner, adapter } = createTestSetup({
      minItemsPerCategory: 0,
      protectedPriority: ContentPriority.SYSTEM,
    });

    adapter.setSummaryResponse('Summary of older messages');

    // Add items with sequential timestamps
    adapter.setTokenCount(100);
    for (let i = 0; i < 5; i++) {
      await manager.add({
        id: `item-${String(i)}`,
        content: `Message ${String(i)}`,
        priority: ContentPriority.HISTORY,
        category: 'active',
      });
    }

    const result = await pruner.prune({
      targetTokens: 200,
      strategy: PruningStrategy.SLIDING_WINDOW,
      slidingWindowOptions: {
        preserveRecentCount: 2,
        summarizeOlder: true,
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Should summarize older items (items 0, 1, 2)
      expect(result.value.summarizedItems.length).toBe(3);
      expect(result.value.summaryItem).toBeDefined();
      expect(adapter.complete).toHaveBeenCalled();
    }
  });

  it('should remove older items without summary when summarizeOlder is false', async () => {
    const { manager, pruner, adapter } = createTestSetup({
      minItemsPerCategory: 0,
      protectedPriority: ContentPriority.SYSTEM,
    });

    adapter.setTokenCount(100);
    for (let i = 0; i < 5; i++) {
      await manager.add({
        id: `item-${String(i)}`,
        content: `Message ${String(i)}`,
        priority: ContentPriority.HISTORY,
        category: 'active',
      });
    }

    const result = await pruner.prune({
      targetTokens: 200,
      strategy: PruningStrategy.SLIDING_WINDOW,
      slidingWindowOptions: {
        preserveRecentCount: 2,
        summarizeOlder: false,
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.removedItems.length).toBeGreaterThan(0);
      expect(result.value.summaryItem).toBeUndefined();
    }
  });

  it('should return empty result when no items to prune', async () => {
    const { manager, pruner, adapter } = createTestSetup({
      minItemsPerCategory: 0,
      protectedPriority: ContentPriority.SYSTEM,
    });

    adapter.setTokenCount(100);
    await manager.add({
      id: 'item-1',
      content: 'Single message',
      priority: ContentPriority.HISTORY,
      category: 'active',
    });

    const result = await pruner.prune({
      targetTokens: 100,
      strategy: PruningStrategy.SLIDING_WINDOW,
      slidingWindowOptions: {
        preserveRecentCount: 5, // More than we have
        summarizeOlder: true,
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.removedItems).toHaveLength(0);
      expect(result.value.summarizedItems).toHaveLength(0);
    }
  });
});

describe('ContextPruner - HIERARCHICAL strategy', () => {
  it('should preserve system prompt and recent messages, summarize middle', async () => {
    const { manager, pruner, adapter } = createTestSetup({
      minItemsPerCategory: 0,
      protectedPriority: ContentPriority.SYSTEM,
    });

    adapter.setSummaryResponse('Summary of middle section');

    // Add system item
    adapter.setTokenCount(50);
    await manager.add({
      id: 'system-prompt',
      content: 'You are a helpful assistant',
      priority: ContentPriority.SYSTEM,
      category: 'system',
    });

    // Add regular items
    adapter.setTokenCount(100);
    for (let i = 0; i < 6; i++) {
      await manager.add({
        id: `msg-${String(i)}`,
        content: `Message ${String(i)}`,
        priority: ContentPriority.HISTORY,
        category: 'active',
      });
    }

    const result = await pruner.prune({
      targetTokens: 200,
      strategy: PruningStrategy.HIERARCHICAL,
      hierarchicalOptions: {
        preserveSystemPrompt: true,
        preserveRecentCount: 2,
        summarizeMiddle: true,
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Should summarize middle items (msgs 0-3)
      expect(result.value.summarizedItems.length).toBe(4);
      expect(result.value.summaryItem).toBeDefined();

      // System prompt should still exist
      expect(manager.get('system-prompt')).toBeDefined();
    }
  });

  it('should remove middle items without summary when summarizeMiddle is false', async () => {
    const { manager, pruner, adapter } = createTestSetup({
      minItemsPerCategory: 0,
      protectedPriority: ContentPriority.SYSTEM,
    });

    adapter.setTokenCount(100);
    for (let i = 0; i < 6; i++) {
      await manager.add({
        id: `msg-${String(i)}`,
        content: `Message ${String(i)}`,
        priority: ContentPriority.HISTORY,
        category: 'active',
      });
    }

    const result = await pruner.prune({
      targetTokens: 200,
      strategy: PruningStrategy.HIERARCHICAL,
      hierarchicalOptions: {
        preserveSystemPrompt: true,
        preserveRecentCount: 2,
        summarizeMiddle: false,
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.removedItems.length).toBeGreaterThan(0);
      expect(result.value.summaryItem).toBeUndefined();
    }
  });

  it('should return empty result when no middle items to prune', async () => {
    const { manager, pruner, adapter } = createTestSetup({
      minItemsPerCategory: 0,
      protectedPriority: ContentPriority.SYSTEM,
    });

    adapter.setTokenCount(100);
    await manager.add({
      id: 'msg-1',
      content: 'Message 1',
      priority: ContentPriority.HISTORY,
      category: 'active',
    });

    const result = await pruner.prune({
      targetTokens: 100,
      strategy: PruningStrategy.HIERARCHICAL,
      hierarchicalOptions: {
        preserveRecentCount: 5, // More than we have
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.removedItems).toHaveLength(0);
      expect(result.value.summarizedItems).toHaveLength(0);
    }
  });
});

describe('ContextPruner - SEMANTIC strategy', () => {
  it('should keep items relevant to current task', async () => {
    const { manager, pruner, adapter } = createTestSetup({
      minItemsPerCategory: 0,
      protectedPriority: ContentPriority.SYSTEM,
    });

    adapter.setSummaryResponse('Summary of irrelevant content');

    // Add relevant items
    adapter.setTokenCount(100);
    await manager.add({
      id: 'relevant-1',
      content: 'TypeScript implementation of the pruning algorithm',
      priority: ContentPriority.HISTORY,
      category: 'active',
    });

    await manager.add({
      id: 'relevant-2',
      content: 'Context pruning strategy in TypeScript',
      priority: ContentPriority.HISTORY,
      category: 'active',
    });

    // Add irrelevant items
    await manager.add({
      id: 'irrelevant-1',
      content: 'Recipe for chocolate cake with vanilla frosting',
      priority: ContentPriority.HISTORY,
      category: 'active',
    });

    await manager.add({
      id: 'irrelevant-2',
      content: 'Weather forecast for next week in tropical regions',
      priority: ContentPriority.HISTORY,
      category: 'active',
    });

    const result = await pruner.prune({
      targetTokens: 100,
      strategy: PruningStrategy.SEMANTIC,
      semanticOptions: {
        currentTask: 'Implement TypeScript pruning algorithm',
        minRelevanceScore: 0.1,
        topRelevantCount: 2,
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Should summarize or remove irrelevant items
      const prunedIds = [
        ...result.value.removedItems.map((i) => i.id),
        ...result.value.summarizedItems.map((i) => i.id),
      ];
      // Irrelevant items should be pruned
      expect(prunedIds.some((id) => id.startsWith('irrelevant'))).toBe(true);
    }
  });

  it('should use default relevance when no task provided', async () => {
    const { manager, pruner, adapter } = createTestSetup({
      minItemsPerCategory: 0,
      protectedPriority: ContentPriority.SYSTEM,
    });

    adapter.setTokenCount(100);
    for (let i = 0; i < 15; i++) {
      await manager.add({
        id: `item-${String(i)}`,
        content: `Content item number ${String(i)}`,
        priority: ContentPriority.HISTORY,
        category: 'active',
      });
    }

    const result = await pruner.prune({
      targetTokens: 500,
      strategy: PruningStrategy.SEMANTIC,
      semanticOptions: {
        // No currentTask provided
        topRelevantCount: 5,
        minRelevanceScore: 0.6, // Higher threshold should trigger pruning
      },
    });

    expect(result.ok).toBe(true);
    // Should handle case with no task keywords gracefully
  });

  it('should remove items without summary when no adapter', async () => {
    const logger = createMockLogger();
    const manager = new ContextManager({ maxTokens: 10000 });
    const pruner = new ContextPruner({
      contextManager: manager,
      logger,
      minItemsPerCategory: 0,
      protectedPriority: ContentPriority.SYSTEM,
    });

    for (let i = 0; i < 15; i++) {
      await manager.add({
        id: `item-${String(i)}`,
        content: `Unrelated content ${String(i)}`,
        priority: ContentPriority.HISTORY,
        category: 'active',
      });
    }

    const result = await pruner.prune({
      targetTokens: 500,
      strategy: PruningStrategy.SEMANTIC,
      semanticOptions: {
        currentTask: 'TypeScript implementation',
        topRelevantCount: 5,
        minRelevanceScore: 0.1,
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Should remove items directly without summarization
      expect(result.value.removedItems.length).toBeGreaterThan(0);
      expect(result.value.summaryItem).toBeUndefined();
    }
  });

  it('should return empty result when all items are relevant', async () => {
    const { manager, pruner, adapter } = createTestSetup({
      minItemsPerCategory: 0,
      protectedPriority: ContentPriority.SYSTEM,
    });

    adapter.setTokenCount(100);
    await manager.add({
      id: 'relevant-1',
      content: 'TypeScript pruning implementation',
      priority: ContentPriority.HISTORY,
      category: 'active',
    });

    await manager.add({
      id: 'relevant-2',
      content: 'Algorithm for TypeScript context pruning',
      priority: ContentPriority.HISTORY,
      category: 'active',
    });

    const result = await pruner.prune({
      targetTokens: 100,
      strategy: PruningStrategy.SEMANTIC,
      semanticOptions: {
        currentTask: 'TypeScript pruning algorithm',
        topRelevantCount: 10, // Keep all
        minRelevanceScore: 0,
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.removedItems).toHaveLength(0);
      expect(result.value.summarizedItems).toHaveLength(0);
    }
  });
});

describe('ContextPruner - Strategy options validation', () => {
  it('should use default options when invalid sliding window options provided', async () => {
    const { manager, pruner, adapter } = createTestSetup({
      minItemsPerCategory: 0,
      protectedPriority: ContentPriority.SYSTEM,
    });

    adapter.setTokenCount(100);
    for (let i = 0; i < 5; i++) {
      await manager.add({
        id: `item-${String(i)}`,
        content: `Message ${String(i)}`,
        priority: ContentPriority.HISTORY,
        category: 'active',
      });
    }

    // Should not throw with invalid options
    const result = await pruner.prune({
      targetTokens: 200,
      strategy: PruningStrategy.SLIDING_WINDOW,
      slidingWindowOptions: {
        preserveRecentCount: -1, // Invalid, will use default
      } as unknown as { preserveRecentCount: number; summarizeOlder: boolean },
    });

    expect(result.ok).toBe(true);
  });

  it('should use default options when invalid hierarchical options provided', async () => {
    const { manager, pruner, adapter } = createTestSetup({
      minItemsPerCategory: 0,
      protectedPriority: ContentPriority.SYSTEM,
    });

    adapter.setTokenCount(100);
    for (let i = 0; i < 5; i++) {
      await manager.add({
        id: `item-${String(i)}`,
        content: `Message ${String(i)}`,
        priority: ContentPriority.HISTORY,
        category: 'active',
      });
    }

    // Should not throw with invalid options
    const result = await pruner.prune({
      targetTokens: 200,
      strategy: PruningStrategy.HIERARCHICAL,
      hierarchicalOptions: {
        preserveRecentCount: -5, // Invalid
      } as unknown as {
        preserveSystemPrompt: boolean;
        preserveRecentCount: number;
        summarizeMiddle: boolean;
      },
    });

    expect(result.ok).toBe(true);
  });

  it('should use default options when invalid semantic options provided', async () => {
    const { manager, pruner, adapter } = createTestSetup({
      minItemsPerCategory: 0,
      protectedPriority: ContentPriority.SYSTEM,
    });

    adapter.setTokenCount(100);
    for (let i = 0; i < 5; i++) {
      await manager.add({
        id: `item-${String(i)}`,
        content: `Message ${String(i)}`,
        priority: ContentPriority.HISTORY,
        category: 'active',
      });
    }

    // Should not throw with invalid options
    const result = await pruner.prune({
      targetTokens: 200,
      strategy: PruningStrategy.SEMANTIC,
      semanticOptions: {
        minRelevanceScore: 2.0, // Invalid (> 1)
      } as unknown as { currentTask?: string; minRelevanceScore: number; topRelevantCount: number },
    });

    expect(result.ok).toBe(true);
  });
});
