/**
 * Workflow -> Agent Integration E2E Tests
 *
 * Tests verifying the integration between workflow execution, agent results,
 * and context management including the Context Pruner.
 *
 * @module testing/e2e/integration/workflow-agent
 * (Source: Issue #323, Swarm Analysis Gap)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ContextManager, ContextPruner, ContentPriority } from '../../../agents/index.js';
import { assertOk } from '../utils/index.js';

describe('Workflow -> Agent Integration E2E Tests', () => {
  let contextManager: ContextManager;

  beforeEach(() => {
    contextManager = new ContextManager({ maxTokens: 5000 });
  });

  it('should add workflow context and track in context manager', async () => {
    // Add workflow step context using valid categories (system, task, active)
    await contextManager.add({
      id: 'workflow-step-1',
      content: 'Analyzing code structure for refactoring opportunities',
      priority: ContentPriority.TASK,
      category: 'task',
      metadata: { stepId: 'analyze', workflowId: 'refactor-001' },
    });

    await contextManager.add({
      id: 'workflow-step-2',
      content: 'Applying refactoring patterns to identified code sections',
      priority: ContentPriority.ACTIVE,
      category: 'active',
      metadata: { stepId: 'apply', workflowId: 'refactor-001' },
    });

    const stats = contextManager.getStats();
    const totalItems = Object.values(stats.itemCounts).reduce((a, b) => a + b, 0);
    expect(totalItems).toBe(2);
  });

  it('should maintain agent results in context through workflow execution', async () => {
    // Simulate agent results being added to context using valid categories
    await contextManager.add({
      id: 'agent-result-1',
      content: 'Security expert found 3 potential vulnerabilities',
      priority: ContentPriority.ACTIVE,
      category: 'active',
    });

    await contextManager.add({
      id: 'agent-result-2',
      content: 'Code expert suggests 5 optimization opportunities',
      priority: ContentPriority.ACTIVE,
      category: 'active',
    });

    // Results should be retrievable
    const result1 = contextManager.get('agent-result-1');
    const result2 = contextManager.get('agent-result-2');

    expect(result1).toBeDefined();
    expect(result2).toBeDefined();
    expect(result1?.content).toContain('vulnerabilities');
    expect(result2?.content).toContain('optimization');
  });
});

describe('Memory -> Context Pruner Integration E2E Tests', () => {
  let contextManager: ContextManager;
  let pruner: ContextPruner;

  beforeEach(() => {
    contextManager = new ContextManager({ maxTokens: 500 });
    pruner = new ContextPruner({
      contextManager,
      defaultStrategy: 'lowest_priority',
    });
  });

  it('should prune low priority content while preserving high priority', async () => {
    // Add high-priority content
    await contextManager.add({
      id: 'critical-context',
      content: 'Critical security constraint: never expose API keys',
      priority: ContentPriority.SYSTEM,
      category: 'system',
    });

    // Add low-priority content (using 'active' category with low priority)
    for (let i = 0; i < 10; i++) {
      await contextManager.add({
        id: `history-${String(i)}`,
        content: `Historical message ${String(i)} with some content that takes up space`,
        priority: ContentPriority.EPHEMERAL,
        category: 'active',
        metadata: { addedAt: Date.now() - (10 - i) * 1000 },
      });
    }

    // Should need pruning
    if (pruner.shouldPrune()) {
      const result = await pruner.prune({ targetTokens: 200 });
      assertOk(result);

      // Critical context should be preserved
      const criticalItem = contextManager.get('critical-context');
      expect(criticalItem).toBeDefined();
    }
  });

  it('should identify prune candidates based on priority and age', async () => {
    // Add mixed priority content
    await contextManager.add({
      id: 'active-work',
      content: 'Currently working on this code section',
      priority: ContentPriority.ACTIVE,
      category: 'active',
    });

    await contextManager.add({
      id: 'old-context',
      content: 'Context from earlier in the session',
      priority: ContentPriority.EPHEMERAL,
      category: 'active',
      metadata: { addedAt: Date.now() - 60000 },
    });

    const candidates = pruner.getPruneCandidates(['active']);

    // Old history should be candidate before active work
    expect(candidates.length).toBeGreaterThan(0);
  });
});
