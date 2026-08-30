/**
 * Tests for Puppeteer Step Execution
 * @module agents/orchestration/puppeteer-step-execution.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ok, err } from '../../core/result.js';
import type { Result } from '../../core/result.js';
import type { IAgent, Task, TaskResult } from '../../core/index.js';
import type { AgentError } from '../../core/errors.js';
import type {
  PuppeteerState,
  AgentStepOutput,
  AgentDistribution,
  PuppeteerStepResult,
} from './puppeteer-types.js';
import { PolicyError } from './policy-types.js';
import {
  StepExecutionError,
  executeStep,
  checkStepTermination,
} from './puppeteer-step-execution.js';
import type { StepExecutionContext } from './puppeteer-step-execution.js';

// ============================================================================
// Mocks
// ============================================================================

vi.mock('./puppeteer-helpers.js', () => ({
  buildAgentStepOutput: vi.fn(
    (step: number, agentId: string, result: TaskResult): AgentStepOutput => ({
      step,
      agentId,
      output: result.output,
      durationMs: result.metadata.durationMs,
      tokensUsed: result.metadata.tokensUsed,
      model: result.metadata.model,
    })
  ),
  buildAgentTask: vi.fn((originalTask: Task, _state: PuppeteerState, _context: string): Task => ({
    ...originalTask,
    id: `${originalTask.id}-step-0`,
  })),
  buildStepResult: vi.fn(
    (options: Record<string, unknown>): PuppeteerStepResult =>
      ({
        selectedAgent: options['selectedAgent'],
        distribution: options['distribution'],
        agentOutput: options['agentOutput'],
        newState: options['newState'],
        reward: 0.5,
        shouldTerminate: options['shouldTerminate'],
        terminationReason: options['terminationReason'],
      }) as unknown as PuppeteerStepResult
  ),
  detectTaskCompletion: vi.fn(() => false),
  detectConvergence: vi.fn(() => false),
}));

// Import mocked helpers for assertions
const helpers = await import('./puppeteer-helpers.js');

// ============================================================================
// Test Helpers
// ============================================================================

function createMockDistribution(): AgentDistribution {
  const distribution: AgentDistribution = {
    probabilities: new Map([['agent-1', 1.0]]),
    rawScores: new Map([['agent-1', 1.0]]),
    reasoning: 'test distribution',
  };
  return distribution;
}

function createMockContext(): StepExecutionContext {
  const mockDistribution = createMockDistribution();
  const mock = {
    policyEngine: {
      computeDistribution: vi.fn(() => Promise.resolve(ok(mockDistribution))),
      sampleAgent: vi.fn(() => 'agent-1'),
      getParameters: vi.fn(),
      loadParameters: vi.fn(),
    },
    stateManager: {
      extractAgentContext: vi.fn(() => 'mock context'),
      updateState: vi.fn((state: PuppeteerState) => state),
      createInitialState: vi.fn(),
      compressState: vi.fn(),
      estimateProgress: vi.fn(),
      estimateTokens: vi.fn(),
    },
  } as unknown as StepExecutionContext;
  return mock;
}

function createMockState(): PuppeteerState {
  const state: PuppeteerState = {
    step: 1,
    task: {
      id: 'task-1',
      description: 'test task',
      context: {},
    },
    agentOutputs: [],
    context: 'initial context',
    metadata: {
      progress: 0,
      totalCost: 0,
      totalTokens: 0,
      elapsedMs: 0,
      startedAt: '2026-01-01T00:00:00Z',
    },
    sessionId: 'session-1',
  };
  return state;
}

function createMockTaskResult(): TaskResult {
  const result: TaskResult = {
    taskId: 'task-1',
    output: 'agent output text',
    metadata: {
      durationMs: 500,
      tokensUsed: 100,
      toolsUsed: [],
      model: 'test-model',
    },
  };
  return result;
}

function createMockAgent(id: string): IAgent {
  const taskResult = createMockTaskResult();
  const agent = {
    id,
    role: 'code_expert' as const,
    state: 'idle' as const,
    capabilities: ['task_execution' as const],
    execute: vi.fn(() => Promise.resolve(ok(taskResult))),
    handleMessage: vi.fn(),
    initialize: vi.fn(),
    cleanup: vi.fn(),
  } as unknown as IAgent;
  return agent;
}

function createMockTask(): Task {
  const task: Task = {
    id: 'task-1',
    description: 'test task',
    context: {},
  };
  return task;
}

// ============================================================================
// StepExecutionError
// ============================================================================

describe('StepExecutionError', () => {
  it('should have correct name, message, and code', () => {
    const error = new StepExecutionError('test error', 'POLICY_ERROR');

    expect(error.name).toBe('StepExecutionError');
    expect(error.message).toBe('test error');
    expect(error.code).toBe('POLICY_ERROR');
  });

  it('should include context when provided', () => {
    const context = { agentId: 'agent-1', step: 3 };
    const error = new StepExecutionError('test error', 'AGENT_NOT_FOUND', context);

    expect(error.context).toEqual({ agentId: 'agent-1', step: 3 });
  });

  it('should be instanceof Error', () => {
    const error = new StepExecutionError('test', 'POLICY_ERROR');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(StepExecutionError);
  });
});

// ============================================================================
// checkStepTermination
// ============================================================================

describe('checkStepTermination', () => {
  beforeEach(() => {
    vi.mocked(helpers.detectTaskCompletion).mockReturnValue(false);
    vi.mocked(helpers.detectConvergence).mockReturnValue(false);
  });

  it('should return shouldTerminate=true with reason task_complete when detectTaskCompletion returns true', () => {
    vi.mocked(helpers.detectTaskCompletion).mockReturnValue(true);
    const mockOutput = { output: 'task complete' };
    const mockState = createMockState();

    const result = checkStepTermination(mockOutput, mockState);

    expect(result.shouldTerminate).toBe(true);
    expect(result.reason).toBe('task_complete');
  });

  it('should return shouldTerminate=true with reason convergence when detectConvergence returns true', () => {
    vi.mocked(helpers.detectConvergence).mockReturnValue(true);
    const mockOutput = { output: 'same output again' };
    const mockState = createMockState();

    const result = checkStepTermination(mockOutput, mockState);

    expect(result.shouldTerminate).toBe(true);
    expect(result.reason).toBe('convergence');
  });

  it('should return shouldTerminate=false when neither condition met', () => {
    const mockOutput = { output: 'normal output' };
    const mockState = createMockState();

    const result = checkStepTermination(mockOutput, mockState);

    expect(result.shouldTerminate).toBe(false);
    expect(result.reason).toBeUndefined();
  });
});

// ============================================================================
// executeStep
// ============================================================================

describe('executeStep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(helpers.detectTaskCompletion).mockReturnValue(false);
    vi.mocked(helpers.detectConvergence).mockReturnValue(false);
  });

  it('should return ok result on successful execution', async () => {
    const context = createMockContext();
    const state = createMockState();
    const agent = createMockAgent('agent-1');
    const agentMap = new Map<string, IAgent>([['agent-1', agent]]);
    const task = createMockTask();

    const result = await executeStep(context, state, ['agent-1'], agentMap, task);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.selectedAgent).toBe('agent-1');
      expect(result.value.shouldTerminate).toBe(false);
    }
  });

  it('should return POLICY_ERROR when policyEngine.computeDistribution fails', async () => {
    const context = createMockContext();
    const policyError = new PolicyError('distribution failed', 'COMPUTATION_FAILED');
    vi.mocked(
      context.policyEngine.computeDistribution as ReturnType<typeof vi.fn>
    ).mockResolvedValue(err(policyError));
    const state = createMockState();
    const agent = createMockAgent('agent-1');
    const agentMap = new Map<string, IAgent>([['agent-1', agent]]);
    const task = createMockTask();

    const result = await executeStep(context, state, ['agent-1'], agentMap, task);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(StepExecutionError);
      expect(result.error.code).toBe('POLICY_ERROR');
    }
  });

  it('should return AGENT_NOT_FOUND when selected agent not in map', async () => {
    const context = createMockContext();
    vi.mocked(context.policyEngine.sampleAgent as ReturnType<typeof vi.fn>).mockReturnValue(
      'nonexistent-agent'
    );
    const state = createMockState();
    const agentMap = new Map<string, IAgent>();
    const task = createMockTask();

    const result = await executeStep(context, state, ['agent-1'], agentMap, task);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(StepExecutionError);
      expect(result.error.code).toBe('AGENT_NOT_FOUND');
      expect(result.error.message).toContain('nonexistent-agent');
    }
  });

  it('should return AGENT_EXECUTION_ERROR when agent.execute fails', async () => {
    const context = createMockContext();
    const state = createMockState();
    const agent = createMockAgent('agent-1');
    const agentError = new Error('execution failed') as AgentError;
    agentError.name = 'AgentError';
    const failedResult: Result<TaskResult, AgentError> = err(agentError);
    vi.mocked(agent.execute as ReturnType<typeof vi.fn>).mockResolvedValue(failedResult);
    const agentMap = new Map<string, IAgent>([['agent-1', agent]]);
    const task = createMockTask();

    const result = await executeStep(context, state, ['agent-1'], agentMap, task);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(StepExecutionError);
      expect(result.error.code).toBe('AGENT_EXECUTION_ERROR');
      expect(result.error.message).toContain('execution failed');
    }
  });

  it('should call stateManager.updateState with agent output', async () => {
    const context = createMockContext();
    const state = createMockState();
    const agent = createMockAgent('agent-1');
    const agentMap = new Map<string, IAgent>([['agent-1', agent]]);
    const task = createMockTask();

    await executeStep(context, state, ['agent-1'], agentMap, task);

    expect(context.stateManager.updateState).toHaveBeenCalledTimes(1);
    const updateCall = vi.mocked(context.stateManager.updateState as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(updateCall?.[0]).toBe(state);
    const agentOutput = updateCall?.[1] as AgentStepOutput;
    expect(agentOutput.agentId).toBe('agent-1');
  });

  it('should pass termination reason when step should terminate', async () => {
    vi.mocked(helpers.detectTaskCompletion).mockReturnValue(true);
    const context = createMockContext();
    const state = createMockState();
    const agent = createMockAgent('agent-1');
    const agentMap = new Map<string, IAgent>([['agent-1', agent]]);
    const task = createMockTask();

    await executeStep(context, state, ['agent-1'], agentMap, task);

    expect(helpers.buildStepResult).toHaveBeenCalledTimes(1);
    const buildCall = vi.mocked(helpers.buildStepResult).mock.calls[0];
    const options = buildCall?.[0];
    expect(options?.shouldTerminate).toBe(true);
    expect(options?.terminationReason).toBe('task_complete');
  });
});
