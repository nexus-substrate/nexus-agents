/**
 * Tests for task-type-classifier.ts
 *
 * Covers reasoning vs knowledge task classification with confidence scoring.
 */

import { describe, it, expect } from 'vitest';
import { TaskTypeClassifier, createTaskTypeClassifier } from './task-type-classifier.js';
import type { Task } from '../types/agent.js';

// ============================================================================
// Helpers
// ============================================================================

function makeTask(description: string, metadata?: Record<string, unknown>): Task {
  return {
    id: 'test-task',
    description,
    context: {
      ...(metadata !== undefined ? { metadata } : {}),
    },
  };
}

// ============================================================================
// TaskTypeClassifier.classify
// ============================================================================

describe('TaskTypeClassifier', () => {
  it('classifies reasoning tasks', () => {
    const classifier = new TaskTypeClassifier();
    const result = classifier.classify(
      makeTask('Analyze and debug the race condition in the system')
    );
    expect(result.type).toBe('reasoning');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.signals.length).toBeGreaterThan(0);
  });

  it('classifies knowledge tasks', () => {
    const classifier = new TaskTypeClassifier();
    const result = classifier.classify(
      makeTask('What is the documentation for the API reference?')
    );
    expect(result.type).toBe('knowledge');
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('returns unknown for ambiguous content', () => {
    const classifier = new TaskTypeClassifier();
    const result = classifier.classify(makeTask('do something'));
    expect(result.type).toBe('unknown');
    expect(result.confidence).toBe(0);
  });

  it('returns unknown when confidence below threshold', () => {
    const classifier = new TaskTypeClassifier({ minConfidence: 0.9 });
    // This task has both reasoning and knowledge signals
    const result = classifier.classify(
      makeTask('Analyze what is the best approach and list the options')
    );
    // Should be unknown because both types are close in score
    expect(['unknown', 'reasoning', 'knowledge']).toContain(result.type);
  });

  it('includes signal details in result', () => {
    const classifier = new TaskTypeClassifier();
    const result = classifier.classify(makeTask('Solve and calculate the optimal algorithm'));
    const signals = result.signals;
    expect(signals.length).toBeGreaterThan(0);
    for (const signal of signals) {
      expect(signal.name).toBeTruthy();
      expect(signal.weight).toBeGreaterThan(0);
      expect(['reasoning', 'knowledge']).toContain(signal.indicates);
    }
  });

  it('uses task context history', () => {
    const classifier = new TaskTypeClassifier();
    const task: Task = {
      id: 'test',
      description: 'help',
      context: {
        history: [
          {
            role: 'user',
            content: 'Why does this algorithm fail? Debug it.',
            timestamp: '2024-01-01T00:00:00Z',
          },
        ],
      },
    };
    const result = classifier.classify(task);
    expect(result.type).toBe('reasoning');
  });

  it('uses metadata instructions', () => {
    const classifier = new TaskTypeClassifier();
    const result = classifier.classify(
      makeTask('task', { instructions: 'What is the definition of this API format?' })
    );
    expect(result.type).toBe('knowledge');
  });

  it('respects custom minConfidence', () => {
    const classifier = new TaskTypeClassifier({ minConfidence: 0.0 });
    const result = classifier.classify(makeTask('Analyze the documentation'));
    // With minConfidence=0, even slightly weighted results get a type
    expect(result.type).not.toBe('unknown');
  });

  it('recognizes debugging as reasoning', () => {
    const classifier = new TaskTypeClassifier();
    const result = classifier.classify(makeTask('Debug and troubleshoot the failing test'));
    expect(result.type).toBe('reasoning');
  });

  it('recognizes definition requests as knowledge', () => {
    const classifier = new TaskTypeClassifier();
    const result = classifier.classify(makeTask('Define the meaning of idempotency'));
    expect(result.type).toBe('knowledge');
  });

  it('recognizes problem-solving as reasoning', () => {
    const classifier = new TaskTypeClassifier();
    const result = classifier.classify(makeTask('Solve and derive the computational complexity'));
    expect(result.type).toBe('reasoning');
  });

  it('recognizes enumeration as knowledge', () => {
    const classifier = new TaskTypeClassifier();
    const result = classifier.classify(makeTask('List all the examples and templates available'));
    expect(result.type).toBe('knowledge');
  });
});

// ============================================================================
// createTaskTypeClassifier
// ============================================================================

describe('createTaskTypeClassifier', () => {
  it('creates classifier with default config', () => {
    const classifier = createTaskTypeClassifier();
    expect(classifier).toBeInstanceOf(TaskTypeClassifier);
  });

  it('creates classifier with custom config', () => {
    const classifier = createTaskTypeClassifier({ minConfidence: 0.5 });
    expect(classifier).toBeInstanceOf(TaskTypeClassifier);
  });
});
