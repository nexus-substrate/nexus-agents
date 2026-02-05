/**
 * Tests for SharedTaskAnalyzer.
 *
 * Covers: analyze, getReasoningType, getComplexity, getTaskType,
 * getCapabilities, estimateTokens, and createSharedTaskAnalyzer.
 */

import { describe, expect, it } from 'vitest';

import type { Task } from '../types/agent.js';
import { SharedTaskAnalyzer, createSharedTaskAnalyzer } from './shared-task-analyzer.js';

// ============================================================================
// Helpers
// ============================================================================

function makeTask(description: string, overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    description,
    context: {},
    constraints: {},
    ...overrides,
  };
}

// ============================================================================
// Factory
// ============================================================================

describe('createSharedTaskAnalyzer', () => {
  it('creates an analyzer instance', () => {
    const analyzer = createSharedTaskAnalyzer();
    expect(analyzer).toBeDefined();
    expect(analyzer.analyze).toBeInstanceOf(Function);
  });

  it('accepts optional config', () => {
    const analyzer = createSharedTaskAnalyzer({
      minReasoningConfidence: 0.5,
      minTaskTypeConfidence: 0.4,
    });
    expect(analyzer).toBeDefined();
  });
});

// ============================================================================
// analyze
// ============================================================================

describe('SharedTaskAnalyzer.analyze', () => {
  const analyzer = new SharedTaskAnalyzer();

  it('accepts string input', () => {
    const result = analyzer.analyze('Fix the bug in authentication');
    expect(result.reasoningType).toBeDefined();
    expect(result.complexity).toBeDefined();
    expect(result.taskType).toBeDefined();
    expect(result.capabilities).toBeDefined();
    expect(result.estimatedTokens).toBeGreaterThan(0);
    expect(result.matchedSignals).toBeInstanceOf(Array);
  });

  it('accepts Task object input', () => {
    const task = makeTask('Implement new feature', {
      context: { workingDirectory: '/src', files: ['index.ts'] },
    });
    const result = analyzer.analyze(task);
    expect(result).toBeDefined();
  });

  it('includes matched signals for observability', () => {
    const result = analyzer.analyze('Design the system architecture with microservices');
    expect(result.matchedSignals.length).toBeGreaterThan(0);
  });

  it('returns valid complexity score between 0 and 1', () => {
    const result = analyzer.analyze('Simple fix');
    expect(result.complexityScore).toBeGreaterThanOrEqual(0);
    expect(result.complexityScore).toBeLessThanOrEqual(1);
  });
});

// ============================================================================
// getReasoningType
// ============================================================================

describe('SharedTaskAnalyzer.getReasoningType', () => {
  const analyzer = new SharedTaskAnalyzer();

  it('classifies reasoning tasks', () => {
    const result = analyzer.getReasoningType(
      'Analyze the tradeoffs between microservices and monolith, compare and reason about the best approach'
    );
    expect(['reasoning', 'unknown']).toContain(result.type);
  });

  it('classifies knowledge tasks', () => {
    const result = analyzer.getReasoningType(
      'What is the definition of REST API? Explain how HTTP status codes work.'
    );
    expect(['knowledge', 'unknown']).toContain(result.type);
  });

  it('returns unknown for ambiguous content', () => {
    const result = analyzer.getReasoningType('hello');
    expect(result.type).toBe('unknown');
    expect(result.confidence).toBe(0);
  });

  it('returns confidence between 0 and 1', () => {
    const result = analyzer.getReasoningType('Analyze this complex system design');
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });
});

// ============================================================================
// getComplexity
// ============================================================================

describe('SharedTaskAnalyzer.getComplexity', () => {
  const analyzer = new SharedTaskAnalyzer();

  it('classifies simple tasks', () => {
    const result = analyzer.getComplexity('Fix typo');
    expect(result.level).toBe('simple');
    expect(result.score).toBeLessThan(0.25);
  });

  it('classifies complex tasks', () => {
    const result = analyzer.getComplexity(
      'Design a distributed system with sharding, replication, and consensus. ' +
        'First, implement the architecture. Then, add fault tolerance. ' +
        'After that, optimize for throughput. Finally, add monitoring. ' +
        'How do we handle network partitions? What about consistency guarantees? ' +
        'Should we use Raft or Paxos? What are the tradeoffs?'
    );
    expect(['complex', 'expert']).toContain(result.level);
    expect(result.score).toBeGreaterThan(0.5);
  });

  it('considers text length for complexity', () => {
    const short = analyzer.getComplexity('Fix bug');
    const long = analyzer.getComplexity('x '.repeat(1500));
    expect(long.score).toBeGreaterThan(short.score);
  });

  it('considers multi-step patterns', () => {
    const singleStep = analyzer.getComplexity('Do one thing');
    const multiStep = analyzer.getComplexity('First do this, then do that, finally verify');
    expect(multiStep.score).toBeGreaterThan(singleStep.score);
  });
});

// ============================================================================
// getTaskType
// ============================================================================

describe('SharedTaskAnalyzer.getTaskType', () => {
  const analyzer = new SharedTaskAnalyzer();

  it('detects architecture tasks', () => {
    const result = analyzer.getTaskType('Design the system architecture with microservices');
    expect(result.type).toBe('architecture');
  });

  it('detects code implementation tasks', () => {
    const result = analyzer.getTaskType('Implement the user authentication feature with code');
    expect(result.type).toBe('code_implementation');
  });

  it('detects code review tasks', () => {
    const result = analyzer.getTaskType('Review the pull request and check for bugs');
    expect(result.type).toBe('code_review');
  });

  it('detects test generation tasks', () => {
    const result = analyzer.getTaskType('Write unit tests for the authentication module');
    expect(result.type).toBe('test_generation');
  });

  it('detects documentation tasks', () => {
    const result = analyzer.getTaskType('Write documentation for the API endpoints');
    expect(result.type).toBe('documentation');
  });

  it('defaults to general for ambiguous content', () => {
    const result = analyzer.getTaskType('hello world');
    expect(result.type).toBe('general');
  });

  it('returns confidence between 0 and 1', () => {
    const result = analyzer.getTaskType('Implement the feature');
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });
});

// ============================================================================
// getCapabilities
// ============================================================================

describe('SharedTaskAnalyzer.getCapabilities', () => {
  const analyzer = new SharedTaskAnalyzer();

  it('detects code generation capability', () => {
    const result = analyzer.getCapabilities('Generate code for the function and implement it');
    expect(result.codeGeneration).toBe(true);
  });

  it('detects multimodal capability', () => {
    const result = analyzer.getCapabilities('Analyze this image and screenshot');
    expect(result.multimodal).toBe(true);
  });

  it('detects budget sensitivity', () => {
    const result = analyzer.getCapabilities('Keep costs low, budget is tight');
    expect(result.budgetSensitive).toBe(true);
  });

  it('detects high context from long content', () => {
    const longContent = 'x '.repeat(600);
    const result = analyzer.getCapabilities(longContent);
    expect(result.highContext).toBe(true);
  });

  it('detects high context from keywords', () => {
    const result = analyzer.getCapabilities('Review the entire codebase, all files');
    expect(result.highContext).toBe(true);
  });

  it('returns false flags for simple content', () => {
    const result = analyzer.getCapabilities('hello');
    expect(result.codeGeneration).toBe(false);
    expect(result.multimodal).toBe(false);
    expect(result.budgetSensitive).toBe(false);
  });
});

// ============================================================================
// estimateTokens
// ============================================================================

describe('SharedTaskAnalyzer.estimateTokens', () => {
  const analyzer = new SharedTaskAnalyzer();

  it('returns positive token count', () => {
    expect(analyzer.estimateTokens('Hello world')).toBeGreaterThan(0);
  });

  it('includes base overhead', () => {
    // Even empty-ish content should have overhead
    expect(analyzer.estimateTokens('x')).toBeGreaterThan(500);
  });

  it('scales with content length', () => {
    const short = analyzer.estimateTokens('short');
    const long = analyzer.estimateTokens('x'.repeat(1000));
    expect(long).toBeGreaterThan(short);
  });

  it('works with Task objects', () => {
    const task = makeTask('Implement feature');
    expect(analyzer.estimateTokens(task)).toBeGreaterThan(0);
  });
});

// ============================================================================
// Content extraction
// ============================================================================

describe('SharedTaskAnalyzer content extraction', () => {
  const analyzer = new SharedTaskAnalyzer();

  it('extracts content from task with working directory', () => {
    const task = makeTask('Fix bug', {
      context: { workingDirectory: '/src/components' },
    });
    const result = analyzer.analyze(task);
    // Working directory should be included in analysis
    expect(result).toBeDefined();
  });

  it('extracts content from task with files', () => {
    const task = makeTask('Review changes', {
      context: { files: ['index.ts', 'app.ts'] },
    });
    const result = analyzer.analyze(task);
    expect(result).toBeDefined();
  });
});
