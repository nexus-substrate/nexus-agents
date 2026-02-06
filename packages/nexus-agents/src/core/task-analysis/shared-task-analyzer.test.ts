/**
 * Tests for SharedTaskAnalyzer
 * @module core/task-analysis/shared-task-analyzer.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Task } from '../types/agent.js';
import { SharedTaskAnalyzer, createSharedTaskAnalyzer } from './shared-task-analyzer.js';

vi.mock('./product-type-detector.js', () => ({
  detectProductType: vi.fn(() => undefined),
}));

// ============================================================================
// Test Helpers
// ============================================================================

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeTask(description: string, overrides: Partial<Task> = {}) {
  return {
    id: 'task-1',
    description,
    context: {},
    constraints: {},
    ...overrides,
  } as Task;
}

// ============================================================================
// createSharedTaskAnalyzer factory
// ============================================================================

describe('createSharedTaskAnalyzer', () => {
  it('returns an instance with all interface methods', () => {
    const analyzer = createSharedTaskAnalyzer();
    expect(analyzer.analyze).toBeInstanceOf(Function);
    expect(analyzer.getReasoningType).toBeInstanceOf(Function);
    expect(analyzer.getComplexity).toBeInstanceOf(Function);
    expect(analyzer.getTaskType).toBeInstanceOf(Function);
    expect(analyzer.getCapabilities).toBeInstanceOf(Function);
    expect(analyzer.estimateTokens).toBeInstanceOf(Function);
  });

  it('accepts optional config overrides', () => {
    const analyzer = createSharedTaskAnalyzer({
      minReasoningConfidence: 0.5,
      minTaskTypeConfidence: 0.4,
    });
    expect(analyzer).toBeDefined();
  });
});

// ============================================================================
// extractContent (tested via estimateTokens for determinism)
// ============================================================================

describe('content extraction', () => {
  let analyzer: SharedTaskAnalyzer;

  beforeEach(() => {
    analyzer = new SharedTaskAnalyzer();
  });

  it('uses string directly when input is a string', () => {
    // "hello" = 5 chars -> ceil(5*0.25+500) = 502
    expect(analyzer.estimateTokens('hello')).toBe(502);
  });

  it('extracts description from a Task object', () => {
    const task = makeTask('desc');
    // "desc" = 4 chars -> ceil(4*0.25+500) = 501
    expect(analyzer.estimateTokens(task)).toBe(501);
  });

  it('includes workingDirectory in content', () => {
    const task = makeTask('desc', {
      context: { workingDirectory: '/proj' },
    });
    // "desc /proj" = 10 chars -> ceil(10*0.25+500) = 503
    expect(analyzer.estimateTokens(task)).toBe(503);
  });

  it('includes files joined by space', () => {
    const task = makeTask('desc', {
      context: { files: ['a.ts', 'b.ts'] },
    });
    // "desc a.ts b.ts" = 14 chars -> ceil(14*0.25+500) = 504
    expect(analyzer.estimateTokens(task)).toBe(504);
  });

  it('skips empty workingDirectory', () => {
    const task = makeTask('desc', {
      context: { workingDirectory: '' },
    });
    expect(analyzer.estimateTokens(task)).toBe(501);
  });

  it('skips empty files array', () => {
    const task = makeTask('desc', {
      context: { files: [] },
    });
    expect(analyzer.estimateTokens(task)).toBe(501);
  });
});

// ============================================================================
// estimateTokens
// ============================================================================

describe('estimateTokens', () => {
  const analyzer = new SharedTaskAnalyzer();

  it('returns base overhead of 500 for empty string', () => {
    expect(analyzer.estimateTokens('')).toBe(500);
  });

  it('computes ceil(length*0.25 + 500)', () => {
    // 1000 chars -> ceil(1000*0.25+500) = 750
    expect(analyzer.estimateTokens('x'.repeat(1000))).toBe(750);
  });

  it('works with Task objects', () => {
    const task = makeTask('Implement feature');
    expect(analyzer.estimateTokens(task)).toBeGreaterThan(500);
  });
});

// ============================================================================
// getReasoningType
// ============================================================================

describe('getReasoningType', () => {
  const analyzer = new SharedTaskAnalyzer();

  it('returns unknown with confidence 0 for empty input', () => {
    const result = analyzer.getReasoningType('');
    expect(result.type).toBe('unknown');
    expect(result.confidence).toBe(0);
  });

  it('returns unknown for content with no keyword matches', () => {
    const result = analyzer.getReasoningType('lorem ipsum dolor sit amet');
    expect(result.type).toBe('unknown');
    expect(result.confidence).toBe(0);
  });

  it('classifies reasoning-heavy tasks as reasoning', () => {
    const result = analyzer.getReasoningType(
      'solve this problem and derive the proof then deduce the conclusion'
    );
    expect(result.type).toBe('reasoning');
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('classifies knowledge-heavy tasks as knowledge', () => {
    const result = analyzer.getReasoningType(
      'what is the definition of a monad? show me an example'
    );
    expect(result.type).toBe('knowledge');
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('returns unknown when confidence is below threshold', () => {
    const strict = new SharedTaskAnalyzer({ minReasoningConfidence: 0.99 });
    const result = strict.getReasoningType('analyze what is the definition of that');
    expect(result.type).toBe('unknown');
  });

  it('confidence is between 0 and 1', () => {
    const result = analyzer.getReasoningType('Analyze this complex system design');
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });
});

// ============================================================================
// getComplexity
// ============================================================================

describe('getComplexity', () => {
  const analyzer = new SharedTaskAnalyzer();

  it('returns simple for very short trivial input', () => {
    const result = analyzer.getComplexity('hi');
    expect(result.level).toBe('simple');
    expect(result.score).toBeLessThan(0.25);
  });

  it('considers text length in score', () => {
    const shortScore = analyzer.getComplexity('hi').score;
    const longScore = analyzer.getComplexity('a'.repeat(2000)).score;
    expect(longScore).toBeGreaterThan(shortScore);
  });

  it('increases score for complexity keywords', () => {
    const result = analyzer.getComplexity('complex architecture security performance distributed');
    expect(result.score).toBeGreaterThan(0.25);
  });

  it('detects multi-step patterns', () => {
    const single = analyzer.getComplexity('do one thing');
    const multi = analyzer.getComplexity('first do this, then do that, finally verify');
    expect(multi.score).toBeGreaterThan(single.score);
  });

  it('factors in question count', () => {
    const noQ = analyzer.getComplexity('do something');
    const manyQ = analyzer.getComplexity('why? how? when? where?');
    expect(manyQ.score).toBeGreaterThan(noQ.score);
  });

  it('caps score at 1.0', () => {
    const extreme =
      'complex optimize architecture security performance distributed ' +
      'concurrent async race condition deadlock memory leak algorithm ' +
      'trade-off decision design pattern refactor legacy ' +
      'first do X then do Y. step 1 step 2. after that. finally. ' +
      '? ? ? ? ? ' +
      'a'.repeat(3000);
    const result = analyzer.getComplexity(extreme);
    expect(result.score).toBeLessThanOrEqual(1);
  });

  it('returns expert for very high complexity', () => {
    const extreme =
      'complex optimize architecture security performance distributed ' +
      'concurrent async race condition deadlock memory leak algorithm ' +
      'trade-off decision design pattern refactor legacy ' +
      'first do X then do Y. step 1 step 2. after that. finally. ' +
      '? ? ? ? ? ' +
      'a'.repeat(3000);
    const result = analyzer.getComplexity(extreme);
    expect(result.level).toBe('expert');
  });

  it('returns score between 0 and 1', () => {
    const result = analyzer.getComplexity('moderate task');
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });
});

// ============================================================================
// getTaskType
// ============================================================================

describe('getTaskType', () => {
  const analyzer = new SharedTaskAnalyzer();

  it('defaults to general for unknown content', () => {
    const result = analyzer.getTaskType('hello world');
    expect(result.type).toBe('general');
  });

  it('detects architecture tasks', () => {
    const result = analyzer.getTaskType('design the system architecture for scalability');
    expect(result.type).toBe('architecture');
  });

  it('detects code_implementation tasks', () => {
    const result = analyzer.getTaskType('implement a new function to build the component');
    expect(result.type).toBe('code_implementation');
  });

  it('detects code_review tasks', () => {
    const result = analyzer.getTaskType('review the pull request and check for bugs');
    expect(result.type).toBe('code_review');
  });

  it('detects test_generation tasks', () => {
    const result = analyzer.getTaskType('write unit test with vitest for coverage');
    expect(result.type).toBe('test_generation');
  });

  it('detects documentation tasks', () => {
    const result = analyzer.getTaskType('document the api doc with a tutorial guide');
    expect(result.type).toBe('documentation');
  });

  it('detects bulk_operations tasks', () => {
    const result = analyzer.getTaskType('bulk update all and refactor all files to migrate');
    expect(result.type).toBe('bulk_operations');
  });

  it('falls back to general when confidence below threshold', () => {
    const strict = new SharedTaskAnalyzer({ minTaskTypeConfidence: 0.99 });
    const result = strict.getTaskType('implement something');
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

describe('getCapabilities', () => {
  const analyzer = new SharedTaskAnalyzer();

  it('returns all false for unrelated content', () => {
    const caps = analyzer.getCapabilities('lorem ipsum');
    expect(caps.parallelizable).toBe(false);
    expect(caps.multimodal).toBe(false);
    expect(caps.codeGeneration).toBe(false);
    expect(caps.budgetSensitive).toBe(false);
    expect(caps.highContext).toBe(false);
  });

  it('detects parallelizable tasks', () => {
    const caps = analyzer.getCapabilities('process multiple files in parallel');
    expect(caps.parallelizable).toBe(true);
  });

  it('detects multimodal tasks', () => {
    const caps = analyzer.getCapabilities('analyze this screenshot image');
    expect(caps.multimodal).toBe(true);
  });

  it('detects code generation tasks', () => {
    const caps = analyzer.getCapabilities('implement a new function');
    expect(caps.codeGeneration).toBe(true);
  });

  it('detects budget sensitive tasks', () => {
    const caps = analyzer.getCapabilities('keep the cost within budget');
    expect(caps.budgetSensitive).toBe(true);
  });

  it('detects high context from keywords', () => {
    const caps = analyzer.getCapabilities('scan the entire codebase');
    expect(caps.highContext).toBe(true);
  });

  it('detects high context from long content (>1000 chars)', () => {
    const caps = analyzer.getCapabilities('x'.repeat(1001));
    expect(caps.highContext).toBe(true);
  });

  it('does not flag high context for short content', () => {
    const caps = analyzer.getCapabilities('short task');
    expect(caps.highContext).toBe(false);
  });
});

// ============================================================================
// analyze (full integration)
// ============================================================================

describe('analyze', () => {
  let analyzer: SharedTaskAnalyzer;

  beforeEach(() => {
    analyzer = new SharedTaskAnalyzer();
  });

  it('returns a complete TaskAnalysisResult shape', () => {
    const result = analyzer.analyze('solve this problem');
    expect(result).toHaveProperty('reasoningType');
    expect(result).toHaveProperty('reasoningConfidence');
    expect(result).toHaveProperty('complexity');
    expect(result).toHaveProperty('complexityScore');
    expect(result).toHaveProperty('taskType');
    expect(result).toHaveProperty('taskTypeConfidence');
    expect(result).toHaveProperty('capabilities');
    expect(result).toHaveProperty('estimatedTokens');
    expect(result).toHaveProperty('matchedSignals');
  });

  it('populates matchedSignals for keyword-rich input', () => {
    const result = analyzer.analyze('analyze and debug the architecture security issues');
    expect(result.matchedSignals.length).toBeGreaterThan(0);
  });

  it('handles empty string gracefully', () => {
    const result = analyzer.analyze('');
    expect(result.reasoningType).toBe('unknown');
    expect(result.complexity).toBe('simple');
    expect(result.taskType).toBe('general');
    expect(result.estimatedTokens).toBe(500);
    expect(result.matchedSignals).toEqual([]);
  });

  it('works with Task objects including context', () => {
    const task = makeTask('implement a new component', {
      context: { workingDirectory: '/project', files: ['index.ts'] },
    });
    const result = analyzer.analyze(task);
    expect(result.taskType).toBe('code_implementation');
    expect(result.capabilities.codeGeneration).toBe(true);
  });

  it('includes product type when detector returns a result', async () => {
    const mod = await import('./product-type-detector.js');
    const mocked = vi.mocked(mod.detectProductType);
    mocked.mockReturnValueOnce({ type: 'cli', confidence: 0.8 });

    const result = analyzer.analyze('build a command line tool');
    expect(result.detectedProductType).toBe('cli');
    expect(result.productTypeConfidence).toBe(0.8);
  });

  it('omits product type fields when not detected', () => {
    const result = analyzer.analyze('hello world');
    expect(result.detectedProductType).toBeUndefined();
    expect(result.productTypeConfidence).toBeUndefined();
  });

  it('returns valid complexity score between 0 and 1', () => {
    const result = analyzer.analyze('Simple fix');
    expect(result.complexityScore).toBeGreaterThanOrEqual(0);
    expect(result.complexityScore).toBeLessThanOrEqual(1);
  });
});
