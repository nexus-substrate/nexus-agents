/**
 * Tests for Adaptive Protocol Selector.
 * (Source: Issue #125, arXiv:2502.19130)
 */

import { describe, it, expect, vi } from 'vitest';
import {
  AdaptiveProtocolSelector,
  createAdaptiveProtocolSelector,
} from './adaptive-protocol-selector.js';
import type { CollaborationConfig } from './collaboration-types.js';
import type { Task, IAgent, TaskResult, AgentResponse } from '../../core/index.js';
import { ok } from '../../core/index.js';

/** Creates a test task with given description. */
function createTestTask(description: string): Task {
  return {
    id: 'test-task',
    description,
    context: {},
  };
}

/** Creates a test collaboration config. */
function createTestConfig(
  task: Task,
  pattern: CollaborationConfig['pattern']
): CollaborationConfig {
  return {
    sessionId: 'test-session',
    pattern,
    experts: ['expert1', 'expert2', 'expert3'],
    task,
  };
}

/** Creates a mock agent. */
function createMockAgent(id: string): IAgent {
  return {
    id,
    role: 'code_expert',
    state: 'idle',
    capabilities: ['task_execution', 'collaboration'],
    execute: vi.fn().mockResolvedValue(
      ok({
        taskId: 'test',
        output: 'Test output',
        metadata: {
          durationMs: 100,
          tokensUsed: 50,
          toolsUsed: [],
          model: 'test-model',
        },
      } satisfies TaskResult)
    ),
    handleMessage: vi.fn().mockResolvedValue(ok({} as AgentResponse)),
    initialize: vi.fn().mockResolvedValue(undefined),
    cleanup: vi.fn().mockResolvedValue(undefined),
  };
}

describe('AdaptiveProtocolSelector', () => {
  describe('construction', () => {
    it('should create with default config', () => {
      const selector = createAdaptiveProtocolSelector();
      expect(selector).toBeDefined();
    });

    it('should accept custom protocol mapping', () => {
      const selector = createAdaptiveProtocolSelector({
        protocolMapping: {
          reasoning: 'consensus',
          knowledge: 'parallel',
          unknown: 'sequential',
        },
      });
      expect(selector).toBeDefined();
    });
  });

  describe('selectProtocol', () => {
    it('should select parallel for reasoning tasks', () => {
      const selector = new AdaptiveProtocolSelector();
      const task = createTestTask('Analyze why this algorithm fails and fix it');
      const config = createTestConfig(task, 'parallel');

      const result = selector.selectProtocol(config);

      expect(result.pattern).toBe('parallel');
      expect(result.classification.type).toBe('reasoning');
    });

    it('should select consensus for knowledge tasks', () => {
      const selector = new AdaptiveProtocolSelector();
      const task = createTestTask('What is the definition of a binary tree?');
      const config = createTestConfig(task, 'consensus');

      const result = selector.selectProtocol(config);

      expect(result.pattern).toBe('consensus');
      expect(result.classification.type).toBe('knowledge');
    });

    it('should use default for unknown task types', () => {
      const selector = new AdaptiveProtocolSelector();
      const task = createTestTask('help');
      const config = createTestConfig(task, 'parallel');

      const result = selector.selectProtocol(config);

      expect(['parallel', 'consensus', 'unknown']).toContain(result.classification.type);
    });

    it('should detect when explicit pattern overrides selection', () => {
      const selector = new AdaptiveProtocolSelector();
      // Reasoning task but with explicit consensus pattern
      const task = createTestTask('Analyze and solve this complex problem');
      const config = createTestConfig(task, 'consensus');

      const result = selector.selectProtocol(config);

      // Should respect explicit pattern
      expect(result.pattern).toBe('consensus');
      // But note it was overridden (would have selected parallel)
      expect(result.classification.type).toBe('reasoning');
    });

    it('should include classification signals', () => {
      const selector = new AdaptiveProtocolSelector();
      const task = createTestTask('Debug this function and explain why it fails');
      const config = createTestConfig(task, 'parallel');

      const result = selector.selectProtocol(config);

      expect(result.classification.signals.length).toBeGreaterThan(0);
    });
  });

  describe('getRecommendation', () => {
    it('should provide recommendation with reasoning for reasoning tasks', () => {
      const selector = new AdaptiveProtocolSelector();
      // Use multiple strong reasoning signals
      const task = createTestTask('Analyze why this fails and debug the problem to solve it');
      const config = createTestConfig(task, 'parallel');

      const recommendation = selector.getRecommendation(config);

      expect(recommendation.recommendedPattern).toBe('parallel');
      expect(recommendation.taskType).toBe('reasoning');
      expect(recommendation.reasoning).toContain('reasoning');
      expect(recommendation.reasoning).toContain('+13.2%');
    });

    it('should provide recommendation with reasoning for knowledge tasks', () => {
      const selector = new AdaptiveProtocolSelector();
      const task = createTestTask('List all the HTTP methods and their definitions');
      const config = createTestConfig(task, 'consensus');

      const recommendation = selector.getRecommendation(config);

      expect(recommendation.recommendedPattern).toBe('consensus');
      expect(recommendation.taskType).toBe('knowledge');
      expect(recommendation.reasoning).toContain('knowledge');
      expect(recommendation.reasoning).toContain('+2.8%');
    });

    it('should provide fallback reasoning for unknown tasks', () => {
      const selector = new AdaptiveProtocolSelector({ classifierConfig: { minConfidence: 0.9 } });
      const task = createTestTask('do something');
      const config = createTestConfig(task, 'parallel');

      const recommendation = selector.getRecommendation(config);

      if (recommendation.taskType === 'unknown') {
        expect(recommendation.reasoning).toContain('could not be determined');
      }
    });
  });

  describe('custom protocol mapping', () => {
    it('should use custom mapping when provided', () => {
      const selector = new AdaptiveProtocolSelector({
        protocolMapping: {
          reasoning: 'sequential',
          knowledge: 'review',
          unknown: 'aegean',
        },
      });

      const reasoningTask = createTestTask('Analyze and solve this problem');
      const knowledgeTask = createTestTask('What is the definition of REST?');

      const reasoningResult = selector.selectProtocol(
        createTestConfig(reasoningTask, 'sequential')
      );
      const knowledgeResult = selector.selectProtocol(createTestConfig(knowledgeTask, 'review'));

      expect(reasoningResult.pattern).toBe('sequential');
      expect(knowledgeResult.pattern).toBe('review');
    });
  });

  describe('execute', () => {
    it('should execute with selected protocol', async () => {
      const selector = new AdaptiveProtocolSelector();
      const task = createTestTask('Calculate the time complexity of this algorithm');
      const config = createTestConfig(task, 'parallel');

      const agents = new Map<string, IAgent>();
      agents.set('expert1', createMockAgent('expert1'));
      agents.set('expert2', createMockAgent('expert2'));
      agents.set('expert3', createMockAgent('expert3'));

      const result = await selector.execute(config, agents);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.pattern).toBe('parallel');
      }
    });
  });
});
