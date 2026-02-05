/**
 * Tests for TechLead Helpers
 * @module agents/tech-lead-helpers.test
 */

import { describe, it, expect } from 'vitest';
import type { Task, TaskResult } from '../core/index.js';
import type { SubTask, TechLeadOptions } from './tech-lead-types.js';
import {
  inferTaskType,
  extractRequirements,
  identifyRisks,
  suggestApproach,
  heuristicAnalysis,
  heuristicSynthesis,
  createSingleResultSynthesis,
  identifyParallelGroups,
  estimateDuration,
  extractTextContent,
} from './tech-lead-helpers.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    description: 'implement a new feature',
    ...overrides,
  } as Task;
}

function makeSubTask(overrides: Partial<SubTask> = {}): SubTask {
  return {
    id: 'st-1',
    parentTaskId: 'task-1',
    description: 'sub task',
    expectedOutput: 'code',
    dependencies: [],
    priority: 'medium',
    status: 'pending',
    complexity: 3,
    requiredCapabilities: [],
    ...overrides,
  };
}

function makeResult(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: 'task-1',
    success: true,
    output: 'some output text',
    agentId: 'agent-1',
    ...overrides,
  } as TaskResult;
}

function makeOptions(): Required<TechLeadOptions> {
  return {
    maxSubtasks: 10,
    decompositionThreshold: 5,
    synthesisMode: 'merge',
    maxParallelExperts: 3,
    expertTimeout: 30000,
  } as unknown as Required<TechLeadOptions>;
}

// ============================================================================
// inferTaskType
// ============================================================================

describe('inferTaskType', () => {
  it('infers implementation', () => {
    expect(inferTaskType('implement a new login feature')).toBe('implementation');
  });

  it('infers refactoring', () => {
    expect(inferTaskType('refactor the auth module')).toBe('refactoring');
  });

  it('infers architecture', () => {
    expect(inferTaskType('design system for microservices')).toBe('architecture');
  });

  it('infers security_audit', () => {
    expect(inferTaskType('audit security vulnerabilities')).toBe('security_audit');
  });

  it('infers documentation', () => {
    expect(inferTaskType('document the api endpoints')).toBe('documentation');
  });

  it('infers testing', () => {
    expect(inferTaskType('write unit test cases')).toBe('testing');
  });

  it('infers code_review', () => {
    expect(inferTaskType('review the pull request code')).toBe('code_review');
  });

  it('returns general for unknown', () => {
    expect(inferTaskType('do something random')).toBe('general');
  });
});

// ============================================================================
// extractRequirements
// ============================================================================

describe('extractRequirements', () => {
  it('extracts must requirements', () => {
    const reqs = extractRequirements('The system must handle 1000 concurrent users');
    expect(reqs).toHaveLength(1);
    expect(reqs[0]).toContain('must');
  });

  it('extracts should requirements', () => {
    const reqs = extractRequirements('The response should be under 200ms');
    expect(reqs).toHaveLength(1);
  });

  it('extracts need requirements', () => {
    const reqs = extractRequirements('We need proper error handling for all endpoints');
    expect(reqs).toHaveLength(1);
  });

  it('skips short lines', () => {
    const reqs = extractRequirements('must do');
    expect(reqs).toEqual([]);
  });

  it('limits to 5 requirements', () => {
    const input = Array(10)
      .fill('The system must implement feature number X for proper handling')
      .join('. ');
    const reqs = extractRequirements(input);
    expect(reqs.length).toBeLessThanOrEqual(5);
  });
});

// ============================================================================
// identifyRisks
// ============================================================================

describe('identifyRisks', () => {
  it('identifies database risks', () => {
    const risks = identifyRisks('database migration needed');
    expect(risks).toContain('Data integrity during changes');
  });

  it('identifies security risks', () => {
    const risks = identifyRisks('security audit required');
    expect(risks).toContain('Security vulnerabilities if not thorough');
  });

  it('identifies performance risks', () => {
    const risks = identifyRisks('optimize performance');
    expect(risks).toContain('Performance regression');
  });

  it('identifies api risks', () => {
    const risks = identifyRisks('change the api contracts');
    expect(risks).toContain('Breaking API changes');
  });

  it('identifies concurrency risks', () => {
    const risks = identifyRisks('parallel processing needed');
    expect(risks).toContain('Race conditions');
  });

  it('returns empty for no keywords', () => {
    expect(identifyRisks('simple task')).toEqual([]);
  });
});

// ============================================================================
// suggestApproach
// ============================================================================

describe('suggestApproach', () => {
  it('suggests iterative for high complexity', () => {
    const approach = suggestApproach('implementation', 8);
    expect(approach).toContain('High complexity');
    expect(approach).toContain('iterative');
  });

  it('suggests standard for medium complexity', () => {
    const approach = suggestApproach('refactoring', 5);
    expect(approach).toContain('Medium complexity');
  });

  it('suggests direct for low complexity', () => {
    const approach = suggestApproach('testing', 2);
    expect(approach).toContain('Low complexity');
  });
});

// ============================================================================
// heuristicAnalysis
// ============================================================================

describe('heuristicAnalysis', () => {
  it('analyzes simple task', () => {
    const task = makeTask({ description: 'implement a small utility' });
    const result = heuristicAnalysis(task, makeOptions());
    expect(result.taskId).toBe('task-1');
    expect(result.complexity).toBeGreaterThanOrEqual(3);
    expect(result.taskType).toBe('implementation');
  });

  it('increases complexity for long descriptions', () => {
    const longDesc = Array(150).fill('word').join(' ');
    const task = makeTask({ description: longDesc });
    const result = heuristicAnalysis(task, makeOptions());
    expect(result.complexity).toBeGreaterThan(3);
  });

  it('caps complexity at 10', () => {
    const desc = Array(300).fill('security architecture refactor').join(' ');
    const task = makeTask({ description: desc });
    const result = heuristicAnalysis(task, makeOptions());
    expect(result.complexity).toBeLessThanOrEqual(10);
  });

  it('sets needsDecomposition based on threshold', () => {
    const task = makeTask({ description: 'implement a small thing' });
    const options = makeOptions();
    options.decompositionThreshold = 2;
    const result = heuristicAnalysis(task, options);
    expect(result.needsDecomposition).toBe(true);
  });
});

// ============================================================================
// heuristicSynthesis
// ============================================================================

describe('heuristicSynthesis', () => {
  it('synthesizes multiple results', () => {
    const results = [
      makeResult({ taskId: 't1', output: 'output one' }),
      makeResult({ taskId: 't2', output: 'output two' }),
    ];
    const synthesis = heuristicSynthesis(results);
    expect(synthesis.combinedOutput).toContain('output one');
    expect(synthesis.combinedOutput).toContain('output two');
    expect(synthesis.resultSummaries).toHaveLength(2);
    expect(synthesis.qualityScore).toBe(0.8);
  });

  it('handles non-string output', () => {
    const results = [makeResult({ output: { key: 'value' } })];
    const synthesis = heuristicSynthesis(results);
    expect(synthesis.combinedOutput).toContain('key');
  });
});

// ============================================================================
// createSingleResultSynthesis
// ============================================================================

describe('createSingleResultSynthesis', () => {
  it('creates synthesis for single result', () => {
    const result = makeResult({ output: 'single output' });
    const synthesis = createSingleResultSynthesis(result);
    expect(synthesis.combinedOutput).toBe('single output');
    expect(synthesis.summary).toBe('Single result synthesis');
    expect(synthesis.qualityScore).toBe(0.9);
    expect(synthesis.resultSummaries).toHaveLength(1);
  });
});

// ============================================================================
// identifyParallelGroups
// ============================================================================

describe('identifyParallelGroups', () => {
  it('returns empty for no subtasks', () => {
    expect(identifyParallelGroups([])).toEqual([]);
  });

  it('groups independent subtasks together', () => {
    const subtasks = [
      makeSubTask({ id: 'a', dependencies: [] }),
      makeSubTask({ id: 'b', dependencies: [] }),
    ];
    const groups = identifyParallelGroups(subtasks);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toContain('a');
    expect(groups[0]).toContain('b');
  });

  it('orders dependent subtasks sequentially', () => {
    const subtasks = [
      makeSubTask({ id: 'a', dependencies: [] }),
      makeSubTask({ id: 'b', dependencies: ['a'] }),
      makeSubTask({ id: 'c', dependencies: ['b'] }),
    ];
    const groups = identifyParallelGroups(subtasks);
    expect(groups).toHaveLength(3);
    expect(groups[0]).toEqual(['a']);
    expect(groups[1]).toEqual(['b']);
    expect(groups[2]).toEqual(['c']);
  });

  it('breaks on circular dependencies', () => {
    const subtasks = [
      makeSubTask({ id: 'a', dependencies: ['b'] }),
      makeSubTask({ id: 'b', dependencies: ['a'] }),
    ];
    const groups = identifyParallelGroups(subtasks);
    expect(groups).toEqual([]);
  });
});

// ============================================================================
// estimateDuration
// ============================================================================

describe('estimateDuration', () => {
  it('returns 0 for empty subtasks', () => {
    expect(estimateDuration([])).toBe(0);
  });

  it('sums complexity and converts to ms', () => {
    const subtasks = [makeSubTask({ complexity: 3 }), makeSubTask({ complexity: 5 })];
    // (3 + 5) * 60 * 1000 = 480000
    expect(estimateDuration(subtasks)).toBe(480000);
  });
});

// ============================================================================
// extractTextContent
// ============================================================================

describe('extractTextContent', () => {
  it('extracts text blocks', () => {
    const content = [
      { type: 'text', text: 'hello' },
      { type: 'image' },
      { type: 'text', text: 'world' },
    ];
    expect(extractTextContent(content)).toBe('hello\nworld');
  });

  it('returns empty for no text blocks', () => {
    expect(extractTextContent([{ type: 'image' }])).toBe('');
  });

  it('returns empty for empty array', () => {
    expect(extractTextContent([])).toBe('');
  });
});
