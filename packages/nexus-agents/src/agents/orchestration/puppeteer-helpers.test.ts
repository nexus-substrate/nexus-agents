/**
 * Tests for Puppeteer Orchestrator Helpers
 * @module agents/orchestration/puppeteer-helpers.test
 */

import { describe, it, expect } from 'vitest';
import type { Task, TaskResult } from '../../core/index.js';
import type { AgentStepOutput, PuppeteerState } from './puppeteer-types.js';
import {
  DEFAULT_REWARD_CONFIG,
  computeStepReward,
  computeFinalReward,
  detectTaskCompletion,
  detectConvergence,
  formatOutputString,
  buildAgentStepOutput,
  buildAgentTask,
} from './puppeteer-helpers.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makeStepOutput(overrides: Partial<AgentStepOutput> = {}): AgentStepOutput {
  return {
    step: 0,
    agentId: 'agent-1',
    output: 'test output',
    durationMs: 1000,
    tokensUsed: 100,
    model: 'test-model',
    ...overrides,
  };
}

// ============================================================================
// DEFAULT_REWARD_CONFIG
// ============================================================================

describe('DEFAULT_REWARD_CONFIG', () => {
  it('has expected values', () => {
    expect(DEFAULT_REWARD_CONFIG.efficiencyWeight).toBe(0.1);
    expect(DEFAULT_REWARD_CONFIG.progressWeight).toBe(0.5);
    expect(DEFAULT_REWARD_CONFIG.maxCost).toBe(1.0);
    expect(DEFAULT_REWARD_CONFIG.maxTime).toBe(300000);
  });
});

// ============================================================================
// computeStepReward
// ============================================================================

describe('computeStepReward', () => {
  it('computes positive reward for progress', () => {
    const output = makeStepOutput({ tokensUsed: 0, durationMs: 0 });
    const reward = computeStepReward(output, 1.0);
    expect(reward).toBeGreaterThan(0);
  });

  it('computes reward proportional to progress', () => {
    const output = makeStepOutput({ tokensUsed: 0, durationMs: 0 });
    const rewardHigh = computeStepReward(output, 1.0);
    const rewardLow = computeStepReward(output, 0.5);
    expect(rewardHigh).toBeGreaterThan(rewardLow);
  });

  it('applies efficiency penalty for high cost', () => {
    const cheapOutput = makeStepOutput({ tokensUsed: 0, durationMs: 0 });
    const expensiveOutput = makeStepOutput({ tokensUsed: 100000, durationMs: 0 });
    const cheapReward = computeStepReward(cheapOutput, 0.5);
    const expensiveReward = computeStepReward(expensiveOutput, 0.5);
    expect(cheapReward).toBeGreaterThan(expensiveReward);
  });

  it('applies efficiency penalty for high time', () => {
    const fastOutput = makeStepOutput({ tokensUsed: 0, durationMs: 0 });
    const slowOutput = makeStepOutput({ tokensUsed: 0, durationMs: 300000 });
    const fastReward = computeStepReward(fastOutput, 0.5);
    const slowReward = computeStepReward(slowOutput, 0.5);
    expect(fastReward).toBeGreaterThan(slowReward);
  });

  it('returns zero for no progress and no cost', () => {
    const output = makeStepOutput({ tokensUsed: 0, durationMs: 0 });
    expect(computeStepReward(output, 0)).toBe(0);
  });

  it('uses custom config', () => {
    const output = makeStepOutput({ tokensUsed: 0, durationMs: 0 });
    const config = { ...DEFAULT_REWARD_CONFIG, progressWeight: 1.0 };
    const reward = computeStepReward(output, 0.5, config);
    expect(reward).toBe(0.5);
  });
});

// ============================================================================
// computeFinalReward
// ============================================================================

describe('computeFinalReward', () => {
  it('returns > 1.0 for successful cheap fast completion', () => {
    const reward = computeFinalReward(true, 1, 0, 0);
    expect(reward).toBeGreaterThan(1.0);
  });

  it('returns 0 base for failure', () => {
    const reward = computeFinalReward(false, 10, 1.0, 300000);
    expect(reward).toBeLessThan(0.1);
  });

  it('gives higher reward for fewer steps', () => {
    const fewSteps = computeFinalReward(true, 2, 0.5, 100000);
    const manySteps = computeFinalReward(true, 9, 0.5, 100000);
    expect(fewSteps).toBeGreaterThan(manySteps);
  });

  it('gives higher reward for lower cost', () => {
    const cheap = computeFinalReward(true, 5, 0.1, 100000);
    const expensive = computeFinalReward(true, 5, 0.9, 100000);
    expect(cheap).toBeGreaterThan(expensive);
  });

  it('gives higher reward for shorter time', () => {
    const fast = computeFinalReward(true, 5, 0.5, 10000);
    const slow = computeFinalReward(true, 5, 0.5, 280000);
    expect(fast).toBeGreaterThan(slow);
  });
});

// ============================================================================
// detectTaskCompletion
// ============================================================================

describe('detectTaskCompletion', () => {
  it('detects "task complete"', () => {
    const output = makeStepOutput({ output: 'The task complete.' });
    expect(detectTaskCompletion(output)).toBe(true);
  });

  it('detects "finished"', () => {
    const output = makeStepOutput({ output: 'All work finished.' });
    expect(detectTaskCompletion(output)).toBe(true);
  });

  it('detects "done"', () => {
    const output = makeStepOutput({ output: 'I am done with the task.' });
    expect(detectTaskCompletion(output)).toBe(true);
  });

  it('detects "verified successfully"', () => {
    const output = makeStepOutput({ output: 'The result was verified successfully.' });
    expect(detectTaskCompletion(output)).toBe(true);
  });

  it('detects "all requirements met"', () => {
    const output = makeStepOutput({ output: 'All requirements met.' });
    expect(detectTaskCompletion(output)).toBe(true);
  });

  it('returns false for non-completion text', () => {
    const output = makeStepOutput({ output: 'Still working on the problem...' });
    expect(detectTaskCompletion(output)).toBe(false);
  });
});

// ============================================================================
// detectConvergence
// ============================================================================

describe('detectConvergence', () => {
  it('returns false for less than 3 outputs', () => {
    const outputs = [makeStepOutput(), makeStepOutput()];
    expect(detectConvergence(outputs)).toBe(false);
  });

  it('detects convergence for identical outputs', () => {
    const outputs = [
      makeStepOutput({ output: 'same output text here' }),
      makeStepOutput({ output: 'same output text here' }),
      makeStepOutput({ output: 'same output text here' }),
    ];
    expect(detectConvergence(outputs)).toBe(true);
  });

  it('returns false for different outputs', () => {
    const outputs = [
      makeStepOutput({ output: 'alpha beta gamma' }),
      makeStepOutput({ output: 'delta epsilon zeta' }),
      makeStepOutput({ output: 'eta theta iota' }),
    ];
    expect(detectConvergence(outputs)).toBe(false);
  });

  it('uses custom threshold', () => {
    const outputs = [
      makeStepOutput({ output: 'hello world test' }),
      makeStepOutput({ output: 'hello world test thing' }),
      makeStepOutput({ output: 'hello world test thing' }),
    ];
    // With low threshold, should converge
    expect(detectConvergence(outputs, 0.5)).toBe(true);
  });
});

// ============================================================================
// formatOutputString
// ============================================================================

describe('formatOutputString', () => {
  it('returns string as-is', () => {
    expect(formatOutputString('hello')).toBe('hello');
  });

  it('returns empty for null', () => {
    expect(formatOutputString(null)).toBe('');
  });

  it('returns empty for undefined', () => {
    expect(formatOutputString(undefined)).toBe('');
  });

  it('JSON-stringifies objects', () => {
    expect(formatOutputString({ key: 'value' })).toBe('{"key":"value"}');
  });

  it('JSON-stringifies numbers', () => {
    expect(formatOutputString(42)).toBe('42');
  });

  it('JSON-stringifies arrays', () => {
    expect(formatOutputString([1, 2, 3])).toBe('[1,2,3]');
  });
});

// ============================================================================
// buildAgentStepOutput
// ============================================================================

describe('buildAgentStepOutput', () => {
  it('builds step output from task result', () => {
    const result: TaskResult = {
      output: 'generated code',
      metadata: {
        durationMs: 500,
        tokensUsed: 200,
        model: 'claude-3',
      },
    } as TaskResult;

    const output = buildAgentStepOutput(3, 'agent-42', result);
    expect(output.step).toBe(3);
    expect(output.agentId).toBe('agent-42');
    expect(output.output).toBe('generated code');
    expect(output.durationMs).toBe(500);
    expect(output.tokensUsed).toBe(200);
    expect(output.model).toBe('claude-3');
  });
});

// ============================================================================
// buildAgentTask
// ============================================================================

describe('buildAgentTask', () => {
  it('creates task with step number in id', () => {
    const task: Task = {
      id: 'task-1',
      description: 'Fix the bug',
      context: { source: 'test', metadata: {} },
    } as Task;
    const state = { step: 5, sessionId: 'session-abc' } as PuppeteerState;

    const result = buildAgentTask(task, state, 'Previous context here');
    expect(result.id).toBe('task-1-step-5');
  });

  it('includes original description and context', () => {
    const task: Task = {
      id: 'task-1',
      description: 'Fix the bug',
      context: { source: 'test', metadata: {} },
    } as Task;
    const state = { step: 0, sessionId: 'session-abc' } as PuppeteerState;

    const result = buildAgentTask(task, state, 'Extra info');
    expect(result.description).toContain('Fix the bug');
    expect(result.description).toContain('Extra info');
  });

  it('injects puppeteer metadata', () => {
    const task: Task = {
      id: 'task-1',
      description: 'Fix the bug',
      context: { source: 'test', metadata: {} },
    } as Task;
    const state = { step: 2, sessionId: 'session-xyz' } as PuppeteerState;

    const result = buildAgentTask(task, state, '');
    expect(result.context.metadata.puppeteerStep).toBe(2);
    expect(result.context.metadata.puppeteerSessionId).toBe('session-xyz');
  });

  it('preserves constraints when present', () => {
    const task = {
      id: 'task-1',
      description: 'Fix',
      context: { source: 'test', metadata: {} },
      constraints: { maxTokens: 1000 },
    } as Task;
    const state = { step: 0, sessionId: 'session-1' } as PuppeteerState;

    const result = buildAgentTask(task, state, '');
    expect(result.constraints).toEqual({ maxTokens: 1000 });
  });
});
