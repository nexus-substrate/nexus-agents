/**
 * Tests for Workflow Engine Execution
 * @module workflows/workflow-engine-execution.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  ILogger,
  StepResult,
  WorkflowDefinition,
  ContextBudget,
  ExecutionStatus,
  WorkflowResult,
} from '../core/index.js';
import type { ResolvedConfig, ExecutionContext } from './workflow-engine-helpers.js';
import { MAX_TRACKED_EXECUTIONS } from './workflow-engine-helpers.js';
import type { ActiveExecution } from './workflow-engine-types.js';
import {
  cleanupOldExecutions,
  createContextManagerForWorkflow,
  initializeExecution,
  applyInputDefaults,
  recordPhaseUsage,
} from './workflow-engine-execution.js';

// ============================================================================
// Test Helpers
// ============================================================================

function createMockLogger(): ILogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  } as unknown as ILogger;
}

const DEFAULT_BUDGET: ContextBudget = {
  system: 0.2,
  task: 0.4,
  active: 0.2,
  reserved: 0.1,
};

function createResolvedConfig(overrides?: Partial<ResolvedConfig>): ResolvedConfig {
  return {
    defaultTimeoutMs: 300000,
    maxConcurrency: 5,
    templatePaths: [],
    contextManagerConfig: undefined,
    defaultBudget: DEFAULT_BUDGET,
    ...overrides,
  };
}

const MOCK_WORKFLOW_RESULT: WorkflowResult = {
  executionId: '',
  workflowName: '',
  stepResults: [],
  output: {},
  totalDurationMs: 0,
};

const COMPLETED_STATUS: ExecutionStatus = { state: 'completed', result: MOCK_WORKFLOW_RESULT };
const RUNNING_STATUS: ExecutionStatus = { state: 'running', currentStep: '', progress: 0 };

function createMockWorkflow(overrides?: Partial<WorkflowDefinition>): WorkflowDefinition {
  return {
    name: 'test-workflow',
    version: '1.0.0',
    description: 'A test workflow',
    steps: [],
    inputs: [],
    ...overrides,
  };
}

// ============================================================================
// cleanupOldExecutions
// ============================================================================

describe('cleanupOldExecutions', () => {
  it('does nothing when below MAX_TRACKED_EXECUTIONS', () => {
    const executions = new Map<string, ActiveExecution>();
    executions.set('exec-1', {
      executionId: 'exec-1',
      workflowName: 'wf',
      status: COMPLETED_STATUS,
      context: {} as ExecutionContext,
      startTime: 1000,
    });
    cleanupOldExecutions(executions);
    expect(executions.size).toBe(1);
  });

  it('removes oldest completed executions when at limit', () => {
    const executions = new Map<string, ActiveExecution>();
    // Fill to MAX_TRACKED_EXECUTIONS
    for (let i = 0; i < MAX_TRACKED_EXECUTIONS; i++) {
      executions.set(`exec-${String(i)}`, {
        executionId: `exec-${String(i)}`,
        workflowName: 'wf',
        status: COMPLETED_STATUS,
        context: {} as ExecutionContext,
        startTime: i * 100,
      });
    }
    expect(executions.size).toBe(MAX_TRACKED_EXECUTIONS);
    cleanupOldExecutions(executions);
    // Should remove at least 1 (the oldest completed)
    expect(executions.size).toBeLessThan(MAX_TRACKED_EXECUTIONS);
    // The oldest one (startTime=0) should be removed
    expect(executions.has('exec-0')).toBe(false);
  });

  it('does not remove running executions', () => {
    const executions = new Map<string, ActiveExecution>();
    for (let i = 0; i < MAX_TRACKED_EXECUTIONS; i++) {
      executions.set(`exec-${String(i)}`, {
        executionId: `exec-${String(i)}`,
        workflowName: 'wf',
        status: RUNNING_STATUS,
        context: {} as ExecutionContext,
        startTime: i * 100,
      });
    }
    const sizeBefore = executions.size;
    cleanupOldExecutions(executions);
    // No completed executions to remove
    expect(executions.size).toBe(sizeBefore);
  });

  it('does not remove pending executions', () => {
    const executions = new Map<string, ActiveExecution>();
    for (let i = 0; i < MAX_TRACKED_EXECUTIONS; i++) {
      executions.set(`exec-${String(i)}`, {
        executionId: `exec-${String(i)}`,
        workflowName: 'wf',
        status: { state: 'pending' },
        context: {} as ExecutionContext,
        startTime: i * 100,
      });
    }
    const sizeBefore = executions.size;
    cleanupOldExecutions(executions);
    expect(executions.size).toBe(sizeBefore);
  });

  it('removes failed executions (non-running, non-pending)', () => {
    const executions = new Map<string, ActiveExecution>();
    for (let i = 0; i < MAX_TRACKED_EXECUTIONS; i++) {
      executions.set(`exec-${String(i)}`, {
        executionId: `exec-${String(i)}`,
        workflowName: 'wf',
        status: { state: 'failed', error: 'oops' },
        context: {} as ExecutionContext,
        startTime: i * 100,
      });
    }
    cleanupOldExecutions(executions);
    expect(executions.size).toBeLessThan(MAX_TRACKED_EXECUTIONS);
  });

  it('removes oldest completed first, preserving newer ones', () => {
    const executions = new Map<string, ActiveExecution>();
    for (let i = 0; i < MAX_TRACKED_EXECUTIONS; i++) {
      const isCompleted = i < 5;
      executions.set(`exec-${String(i)}`, {
        executionId: `exec-${String(i)}`,
        workflowName: 'wf',
        status: isCompleted ? COMPLETED_STATUS : RUNNING_STATUS,
        context: {} as ExecutionContext,
        startTime: i * 100,
      });
    }
    cleanupOldExecutions(executions);
    // exec-0 is oldest completed, should be removed
    expect(executions.has('exec-0')).toBe(false);
    // Running ones should still be there
    expect(executions.has(`exec-${String(MAX_TRACKED_EXECUTIONS - 1)}`)).toBe(true);
  });
});

// ============================================================================
// createContextManagerForWorkflow
// ============================================================================

describe('createContextManagerForWorkflow', () => {
  it('returns undefined when contextManagerConfig is undefined', () => {
    const config = createResolvedConfig({ contextManagerConfig: undefined });
    const workflow = createMockWorkflow();
    const logger = createMockLogger();
    const result = createContextManagerForWorkflow(config, workflow, logger);
    expect(result).toBeUndefined();
  });

  it('creates a ContextManager when config is provided', () => {
    const config = createResolvedConfig({
      contextManagerConfig: { maxTokens: 10000 },
    });
    const workflow = createMockWorkflow();
    const logger = createMockLogger();
    const result = createContextManagerForWorkflow(config, workflow, logger);
    expect(result).toBeDefined();
  });

  it('uses workflow defaultBudget when set', () => {
    const workflowBudget: ContextBudget = {
      system: 0.1,
      task: 0.3,
      active: 0.2,
      reserved: 0.1,
    };
    const config = createResolvedConfig({
      contextManagerConfig: { maxTokens: 10000 },
    });
    const workflow = createMockWorkflow({ defaultBudget: workflowBudget });
    const logger = createMockLogger();
    const result = createContextManagerForWorkflow(config, workflow, logger);
    expect(result).toBeDefined();
  });
});

// ============================================================================
// createBudgetCircuitBreakerForWorkflow
// ============================================================================

describe('initializeExecution', () => {
  let logger: ILogger;

  beforeEach(() => {
    logger = createMockLogger();
  });

  it('creates an execution with a unique ID', () => {
    const config = createResolvedConfig();
    const workflow = createMockWorkflow();
    const result = initializeExecution({
      workflow,
      inputs: { key: 'value' },
      config,
      logger,
    });
    expect(result.executionId).toBeTruthy();
    expect(typeof result.executionId).toBe('string');
  });

  it('stores inputs in context', () => {
    const config = createResolvedConfig();
    const workflow = createMockWorkflow();
    const inputs = { key: 'value', num: 42 };
    const result = initializeExecution({ workflow, inputs, config, logger });
    expect(result.context.inputs).toEqual(inputs);
  });

  it('sets workflow name as workflowId', () => {
    const config = createResolvedConfig();
    const workflow = createMockWorkflow({ name: 'my-workflow' });
    const result = initializeExecution({ workflow, inputs: {}, config, logger });
    expect(result.context.workflowId).toBe('my-workflow');
  });

  it('creates empty stepResults and variables maps', () => {
    const config = createResolvedConfig();
    const workflow = createMockWorkflow();
    const result = initializeExecution({ workflow, inputs: {}, config, logger });
    expect(result.context.stepResults.size).toBe(0);
    expect(result.context.variables.size).toBe(0);
  });

  it('creates an AbortController', () => {
    const config = createResolvedConfig();
    const workflow = createMockWorkflow();
    const result = initializeExecution({ workflow, inputs: {}, config, logger });
    expect(result.context.abortController).toBeInstanceOf(AbortController);
  });

  it('initializes execution with pending state', () => {
    const config = createResolvedConfig();
    const workflow = createMockWorkflow();
    const result = initializeExecution({ workflow, inputs: {}, config, logger });
    expect(result.execution.status.state).toBe('pending');
  });

  it('records start time', () => {
    const config = createResolvedConfig();
    const workflow = createMockWorkflow();
    const result = initializeExecution({ workflow, inputs: {}, config, logger });
    expect(result.startTime).toBeGreaterThan(0);
    expect(result.execution.startTime).toBe(result.startTime);
  });

  it('does not create context manager when not configured', () => {
    const config = createResolvedConfig({ contextManagerConfig: undefined });
    const workflow = createMockWorkflow();
    const result = initializeExecution({ workflow, inputs: {}, config, logger });
    expect(result.context.contextManager).toBeUndefined();
  });

  it('applies input defaults from workflow definition', () => {
    const config = createResolvedConfig();
    const workflow = createMockWorkflow({
      inputs: [
        { name: 'focus', type: 'string', default: 'general' },
        { name: 'strictness', type: 'string', default: 'normal' },
      ],
    });
    const result = initializeExecution({
      workflow,
      inputs: { focus: 'security' },
      config,
      logger,
    });
    // User-provided value preserved, missing value filled from default
    expect(result.context.inputs['focus']).toBe('security');
    expect(result.context.inputs['strictness']).toBe('normal');
  });
});

// ============================================================================
// applyInputDefaults
// ============================================================================

describe('applyInputDefaults', () => {
  it('returns inputs unchanged when no defaults defined', () => {
    const workflow = createMockWorkflow({ inputs: [] });
    const result = applyInputDefaults(workflow, { key: 'value' });
    expect(result).toEqual({ key: 'value' });
  });

  it('fills missing inputs with defaults', () => {
    const workflow = createMockWorkflow({
      inputs: [
        { name: 'focus', type: 'string', default: 'general' },
        { name: 'strictness', type: 'string', default: 'normal' },
      ],
    });
    const result = applyInputDefaults(workflow, {});
    expect(result).toEqual({ focus: 'general', strictness: 'normal' });
  });

  it('preserves user-provided values over defaults', () => {
    const workflow = createMockWorkflow({
      inputs: [{ name: 'focus', type: 'string', default: 'general' }],
    });
    const result = applyInputDefaults(workflow, { focus: 'security' });
    expect(result).toEqual({ focus: 'security' });
  });

  it('skips inputs without defaults', () => {
    const workflow = createMockWorkflow({
      inputs: [
        { name: 'files', type: 'array', required: true },
        { name: 'focus', type: 'string', default: 'general' },
      ],
    });
    const result = applyInputDefaults(workflow, { files: ['a.ts'] });
    expect(result).toEqual({ files: ['a.ts'], focus: 'general' });
  });

  it('does not mutate original inputs', () => {
    const workflow = createMockWorkflow({
      inputs: [{ name: 'extra', type: 'string', default: 'yes' }],
    });
    const original = { key: 'value' };
    applyInputDefaults(workflow, original);
    expect(original).toEqual({ key: 'value' });
  });
});

// ============================================================================
// enforceStepBudgets
// ============================================================================

// recordPhaseUsage
// ============================================================================

describe('recordPhaseUsage', () => {
  // #4673: usage accounting no longer takes an ExecutionContext or a circuit
  // breaker. It ran only when budget enforcement was enabled, which no
  // production caller could do — so the coverage report was permanently zeros.
  // Counting never needed a breaker; only enforcement did.
  it('records real token usage per step', () => {
    const results: StepResult[] = [
      { stepId: 's1', status: 'success', output: 'ok', durationMs: 200, tokensUsed: 1500 },
      { stepId: 's2', status: 'success', output: 'ok', durationMs: 400, tokensUsed: 90 },
    ];

    // Note the ordering the old `durationMs * 0.5` heuristic would have
    // produced: s1 ran for less than half as long as s2 yet cost ~17x more.
    expect(recordPhaseUsage(results)).toEqual({
      recordedSteps: 2,
      unmeasuredSteps: 0,
      tokensRecorded: 1590,
    });
  });

  it('does NOT treat an unmeasured step as zero spend', () => {
    const results: StepResult[] = [
      { stepId: 's1', status: 'success', output: 'ok', durationMs: 200, tokensUsed: 500 },
      // No tokensUsed — the step reported nothing.
      { stepId: 's2', status: 'success', output: 'ok', durationMs: 400 },
    ];

    // Recording 0 for s2 would under-count spend. `unmeasuredSteps > 0` is what
    // lets a reader treat `tokensRecorded` as a lower bound.
    expect(recordPhaseUsage(results)).toEqual({
      recordedSteps: 1,
      unmeasuredSteps: 1,
      tokensRecorded: 500,
    });
  });

  it('names the empty case rather than reporting a confident zero', () => {
    expect(recordPhaseUsage([])).toEqual({
      recordedSteps: 0,
      unmeasuredSteps: 0,
      tokensRecorded: 0,
    });
  });
});
