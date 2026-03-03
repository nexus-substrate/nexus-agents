/**
 * Tests for Task Type Classifier.
 * (Source: Issue #125, arXiv:2502.19130)
 */

import { describe, it, expect } from 'vitest';
import { TaskTypeClassifier, createTaskTypeClassifier } from '../../core/task-analysis/index.js';
import type { Task } from '../../core/index.js';

/** Creates a test task with given description. */
function createTestTask(description: string): Task {
  return {
    id: 'test-task',
    description,
    context: {},
  };
}

describe('TaskTypeClassifier', () => {
  describe('construction', () => {
    it('should create with default config', () => {
      const classifier = createTaskTypeClassifier();
      expect(classifier).toBeDefined();
    });

    it('should accept custom config', () => {
      const classifier = createTaskTypeClassifier({
        minConfidence: 0.5,
      });
      expect(classifier).toBeDefined();
    });
  });

  describe('reasoning task classification', () => {
    it('should classify problem-solving tasks as reasoning', () => {
      const classifier = new TaskTypeClassifier();
      const task = createTestTask('Solve this equation and explain your work');
      const result = classifier.classify(task);

      expect(result.type).toBe('reasoning');
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.signals.some((s) => s.indicates === 'reasoning')).toBe(true);
    });

    it('should classify analysis tasks as reasoning', () => {
      const classifier = new TaskTypeClassifier();
      const task = createTestTask('Analyze the trade-offs between these two approaches');
      const result = classifier.classify(task);

      expect(result.type).toBe('reasoning');
    });

    it('should classify causal questions as reasoning', () => {
      const classifier = new TaskTypeClassifier();
      const task = createTestTask('Why does this algorithm have O(n log n) complexity?');
      const result = classifier.classify(task);

      expect(result.type).toBe('reasoning');
    });

    it('should classify debugging tasks as reasoning', () => {
      const classifier = new TaskTypeClassifier();
      const task = createTestTask('Debug this function and fix the null pointer exception');
      const result = classifier.classify(task);

      expect(result.type).toBe('reasoning');
    });

    it('should classify design tasks as reasoning', () => {
      const classifier = new TaskTypeClassifier();
      const task = createTestTask('Design a system architecture for a high-availability service');
      const result = classifier.classify(task);

      expect(result.type).toBe('reasoning');
    });

    it('should classify logical inference tasks as reasoning', () => {
      const classifier = new TaskTypeClassifier();
      const task = createTestTask('If A implies B and B implies C, prove that A implies C');
      const result = classifier.classify(task);

      expect(result.type).toBe('reasoning');
    });
  });

  describe('knowledge task classification', () => {
    it('should classify factual questions as knowledge', () => {
      const classifier = new TaskTypeClassifier();
      const task = createTestTask('What is the definition of polymorphism in OOP?');
      const result = classifier.classify(task);

      expect(result.type).toBe('knowledge');
    });

    it('should classify enumeration requests as knowledge', () => {
      const classifier = new TaskTypeClassifier();
      const task = createTestTask('List all the HTTP status codes in the 4xx range');
      const result = classifier.classify(task);

      expect(result.type).toBe('knowledge');
    });

    it('should classify documentation lookups as knowledge', () => {
      const classifier = new TaskTypeClassifier();
      const task = createTestTask('Show me the API documentation for the fetch method');
      const result = classifier.classify(task);

      expect(result.type).toBe('knowledge');
    });

    it('should classify syntax queries as knowledge', () => {
      const classifier = new TaskTypeClassifier();
      const task = createTestTask('What is the syntax for a TypeScript generic type?');
      const result = classifier.classify(task);

      expect(result.type).toBe('knowledge');
    });

    it('should classify example requests as knowledge', () => {
      const classifier = new TaskTypeClassifier();
      const task = createTestTask('Give me an example of a React hook');
      const result = classifier.classify(task);

      expect(result.type).toBe('knowledge');
    });
  });

  describe('unknown classification', () => {
    it('should return unknown for ambiguous tasks', () => {
      const classifier = new TaskTypeClassifier({ minConfidence: 0.5 });
      const task = createTestTask('Help me with this code');
      const result = classifier.classify(task);

      // Either unknown or low confidence
      if (result.type !== 'unknown') {
        expect(result.confidence).toBeLessThan(0.5);
      }
    });

    it('should return unknown for empty tasks', () => {
      const classifier = new TaskTypeClassifier();
      const task = createTestTask('');
      const result = classifier.classify(task);

      expect(result.type).toBe('unknown');
      expect(result.confidence).toBe(0);
    });
  });

  describe('confidence scores', () => {
    it('should have higher confidence for clear reasoning tasks', () => {
      const classifier = new TaskTypeClassifier();
      const clearTask = createTestTask('Analyze why this fails and deduce the root cause');
      const ambiguousTask = createTestTask('Look at this code');

      const clearResult = classifier.classify(clearTask);
      const ambiguousResult = classifier.classify(ambiguousTask);

      expect(clearResult.confidence).toBeGreaterThan(ambiguousResult.confidence);
    });

    it('should include signals in result', () => {
      const classifier = new TaskTypeClassifier();
      const task = createTestTask('Solve this problem by analyzing the edge cases');
      const result = classifier.classify(task);

      expect(result.signals.length).toBeGreaterThan(0);
      expect(result.signals[0]).toHaveProperty('name');
      expect(result.signals[0]).toHaveProperty('weight');
      expect(result.signals[0]).toHaveProperty('indicates');
    });
  });

  describe('context extraction', () => {
    it('should consider task context history', () => {
      const classifier = new TaskTypeClassifier();
      const task: Task = {
        id: 'test',
        description: 'Process this',
        context: {
          history: [
            {
              role: 'user',
              content: 'Analyze why the algorithm fails with large inputs',
              timestamp: new Date().toISOString(),
            },
          ],
        },
      };
      const result = classifier.classify(task);

      expect(result.type).toBe('reasoning');
    });

    it('should consider metadata instructions', () => {
      const classifier = new TaskTypeClassifier();
      const task: Task = {
        id: 'test',
        description: 'Help with code',
        context: {
          metadata: {
            instructions: 'List all the functions in this module',
          },
        },
      };
      const result = classifier.classify(task);

      expect(result.type).toBe('knowledge');
    });
  });
});
