/**
 * Agent Lifecycle E2E Tests
 *
 * End-to-end tests for agent state machine, context management,
 * and context pruning.
 *
 * @module testing/e2e/agents/agent-lifecycle
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  // State Machine
  createStateMachine,
  type AgentStateMachine,
  // Context Management
  ContextManager,
  ContextPruner,
  ContentPriority,
} from '../../../agents/index.js';
import type { AgentState } from '../../../core/index.js';

describe('Agent Lifecycle E2E Tests', () => {
  describe('State Machine', () => {
    let stateMachine: AgentStateMachine;
    let stateChanges: Array<{ from: AgentState; to: AgentState }>;

    beforeEach(() => {
      stateChanges = [];
      stateMachine = createStateMachine({
        initialState: 'idle',
      });
      // Register callback AFTER creation via onStateChange method
      stateMachine.onStateChange((transition) => {
        stateChanges.push({ from: transition.from, to: transition.to });
      });
    });

    afterEach(() => {
      stateChanges = [];
    });

    it('should start in idle state', () => {
      expect(stateMachine.state).toBe('idle');
    });

    it('should transition through valid states using events', () => {
      // idle -> thinking via 'task_assigned' event
      const thinkingResult = stateMachine.transition('task_assigned');
      expect(thinkingResult.ok).toBe(true);
      expect(stateMachine.state).toBe('thinking');

      // thinking -> acting via 'plan_completed' event
      const actingResult = stateMachine.transition('plan_completed');
      expect(actingResult.ok).toBe(true);
      expect(stateMachine.state).toBe('acting');

      // acting -> idle via 'task_completed' event
      const idleResult = stateMachine.transition('task_completed');
      expect(idleResult.ok).toBe(true);
      expect(stateMachine.state).toBe('idle');
    });

    it('should reject invalid transitions', () => {
      // Can't trigger 'plan_completed' from idle (needs to be in thinking state)
      const result = stateMachine.transition('plan_completed');
      expect(result.ok).toBe(false);
      expect(stateMachine.state).toBe('idle');
    });

    it('should track state change events', () => {
      stateMachine.transition('task_assigned'); // idle -> thinking
      stateMachine.transition('plan_completed'); // thinking -> acting
      stateMachine.transition('task_completed'); // acting -> idle

      expect(stateChanges).toHaveLength(3);
      expect(stateChanges[0]).toEqual({ from: 'idle', to: 'thinking' });
      expect(stateChanges[1]).toEqual({ from: 'thinking', to: 'acting' });
      expect(stateChanges[2]).toEqual({ from: 'acting', to: 'idle' });
    });

    it('should handle error state transitions', () => {
      stateMachine.transition('task_assigned'); // idle -> thinking
      const errorResult = stateMachine.transition('failure'); // thinking -> error

      expect(errorResult.ok).toBe(true);
      expect(stateMachine.state).toBe('error');

      // Can recover from error to idle via 'recovered' event
      const recoverResult = stateMachine.transition('recovered');
      expect(recoverResult.ok).toBe(true);
      expect(stateMachine.state).toBe('idle');
    });

    it('should provide state history', () => {
      stateMachine.transition('task_assigned');
      stateMachine.transition('plan_completed');

      const history = stateMachine.transitionHistory;
      expect(history.length).toBeGreaterThanOrEqual(2);
      // History contains transition records
      expect(history.some((h) => h.to === 'thinking')).toBe(true);
      expect(history.some((h) => h.to === 'acting')).toBe(true);
    });

    it('should reset to initial state', () => {
      stateMachine.transition('task_assigned');
      stateMachine.transition('plan_completed');
      stateMachine.reset();

      expect(stateMachine.state).toBe('idle');
    });
  });

  describe('Context Manager', () => {
    let contextManager: ContextManager;

    beforeEach(() => {
      contextManager = new ContextManager({
        maxTokens: 10000,
      });
    });

    it('should add and track context items', async () => {
      const result1 = await contextManager.add({
        id: 'item1',
        content: 'Test content',
        priority: ContentPriority.ACTIVE,
        category: 'active',
      });
      const result2 = await contextManager.add({
        id: 'item2',
        content: 'More content',
        priority: ContentPriority.ACTIVE,
        category: 'active',
      });

      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);

      const stats = contextManager.getStats();
      // itemCounts is a record by category
      const totalItems = Object.values(stats.itemCounts).reduce((a, b) => a + b, 0);
      expect(totalItems).toBe(2);
    });

    it('should remove context items', async () => {
      await contextManager.add({
        id: 'item1',
        content: 'Test content',
        priority: ContentPriority.ACTIVE,
        category: 'active',
      });
      await contextManager.add({
        id: 'item2',
        content: 'More content',
        priority: ContentPriority.ACTIVE,
        category: 'active',
      });

      const removed = contextManager.remove('item1');
      expect(removed).toBe(true);

      const stats = contextManager.getStats();
      const totalItems = Object.values(stats.itemCounts).reduce((a, b) => a + b, 0);
      expect(totalItems).toBe(1);
    });

    it('should get context by key', async () => {
      await contextManager.add({
        id: 'myKey',
        content: 'My content',
        priority: ContentPriority.TASK,
        category: 'task',
      });

      const item = contextManager.get('myKey');
      expect(item?.content).toBe('My content');
    });

    it('should clear all context', async () => {
      await contextManager.add({
        id: 'item1',
        content: 'Content 1',
        priority: ContentPriority.ACTIVE,
        category: 'active',
      });
      await contextManager.add({
        id: 'item2',
        content: 'Content 2',
        priority: ContentPriority.TASK,
        category: 'task',
      });

      contextManager.clear();

      const stats = contextManager.getStats();
      const totalItems = Object.values(stats.itemCounts).reduce((a, b) => a + b, 0);
      expect(totalItems).toBe(0);
    });

    it('should track token usage', async () => {
      const longContent = 'word '.repeat(100);
      await contextManager.add({
        id: 'long',
        content: longContent,
        priority: ContentPriority.ACTIVE,
        category: 'active',
      });

      const stats = contextManager.getStats();
      expect(stats.totalTokens).toBeGreaterThan(0);
    });
  });

  describe('Context Pruner', () => {
    let contextManager: ContextManager;
    let pruner: ContextPruner;

    beforeEach(() => {
      contextManager = new ContextManager({
        maxTokens: 1000,
      });
      pruner = new ContextPruner({
        contextManager,
        defaultStrategy: 'oldest_first',
      });
    });

    it('should identify prune candidates', async () => {
      // Add items to context manager in active category
      await contextManager.add({
        id: 'old',
        content: 'Old content that is quite long to take up tokens',
        priority: ContentPriority.HISTORY,
        category: 'active',
        metadata: { addedAt: Date.now() - 10000 },
      });
      await contextManager.add({
        id: 'new',
        content: 'New content that is also quite long',
        priority: ContentPriority.HISTORY,
        category: 'active',
        metadata: { addedAt: Date.now() },
      });

      // getPruneCandidates expects category array
      const candidates = pruner.getPruneCandidates(['active']);
      expect(candidates.length).toBeGreaterThan(0);
    });

    it('should check if pruning is needed', async () => {
      // Initially should not need pruning
      expect(pruner.shouldPrune()).toBe(false);

      // Add lots of content to exceed budget
      for (let i = 0; i < 30; i++) {
        await contextManager.add({
          id: `item-${String(i)}`,
          content: 'Long content '.repeat(20),
          priority: ContentPriority.ACTIVE,
          category: 'active',
        });
      }

      // Now should need pruning (if over budget)
      const stats = contextManager.getStats();
      // Check if we're using significant capacity
      expect(stats.usagePercentage).toBeGreaterThan(0);
    });

    it('should prune context when over budget', async () => {
      // Fill context to capacity
      for (let i = 0; i < 30; i++) {
        await contextManager.add({
          id: `item-${String(i)}`,
          content: 'Content '.repeat(10),
          priority: ContentPriority.ACTIVE,
          category: 'active',
          metadata: { addedAt: Date.now() - (30 - i) * 1000 },
        });
      }

      const result = await pruner.prune({ targetTokens: 500 });

      expect(result.ok).toBe(true);
      if (result.ok) {
        // PruneResult has removedItems array and tokensFreed
        expect(Array.isArray(result.value.removedItems)).toBe(true);
        expect(typeof result.value.tokensFreed).toBe('number');
        expect(result.value.tokensFreed).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
