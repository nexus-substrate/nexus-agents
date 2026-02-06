/**
 * Tests for Workflow Engine Execution
 * @module workflows/workflow-engine-execution.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ILogger, StepResult, WorkflowDefinition, ContextBudget } from '../core/index.js';
import type { ResolvedConfig, ExecutionContext } from './workflow-engine-helpers.js';
import { MAX_TRACKED_EXECUTIONS } from './workflow-engine-helpers.js';
import type { ActiveExecution } from './workflow-engine-types.js';
import type { WorkflowStep } from './workflow-types.js';
import {
  cleanupOldExecutions,
  createContextManagerForWorkflow,
  createBudgetCircuitBreakerForWorkflow,
  initializeExecution,
  enforceStepBudgets,
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
    budgetCircuitBreakerConfig: undefined,
    enableBudgetEnforcement: false,
    ...overrides,
  };
}

function createMockWorkflow(overrides?: Partial<WorkflowDefinition>): WorkflowDefinition {
  return {
    name: 'test-workflow',
    version: '1.0.0',
    description: 'A test workflow',
    steps: [],
    inputs: [],
    ...overrides,
  } as WorkflowDefinition;
}

function createMockStep(id: string): WorkflowStep {
  return {
    id,
    agent: 'code_expert',
    action: 'test-action',
    inputs: {},
  } as WorkflowStep;
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
      status: { state: 'completed' },
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
        status: { state: 'completed' },
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
        status: { state: 'running' },
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
        status: isCompleted ? { state: 'completed' } : { state: 'running' },
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

describe('createBudgetCircuitBreakerForWorkflow', () => {
  it('returns undefined when contextManager is undefined', () => {
    const config = createResolvedConfig();
    const workflow = createMockWorkflow();
    const logger = createMockLogger();
    const result = createBudgetCircuitBreakerForWorkflow(undefined, workflow, config, logger);
    expect(result).toBeUndefined();
  });

  it('includes workflow default budget when set', () => {
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
    // Create a context manager first
    const cm = createContextManagerForWorkflow(config, workflow, logger);
    // Create circuit breaker - may return undefined or a breaker depending on CM state
    const result = createBudgetCircuitBreakerForWorkflow(cm, workflow, config, logger);
    // With a valid context manager, it should create a breaker
    if (cm !== undefined) {
      expect(result).toBeDefined();
    }
  });
});

// ============================================================================
// initializeExecution
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

  it('does not create budget circuit breaker when enforcement is disabled', () => {
    const config = createResolvedConfig({ enableBudgetEnforcement: false });
    const workflow = createMockWorkflow();
    const result = initializeExecution({ workflow, inputs: {}, config, logger });
    expect(result.context.budgetCircuitBreaker).toBeUndefined();
  });

  it('initializes empty budget events array', () => {
    const config = createResolvedConfig();
    const workflow = createMockWorkflow();
    const result = initializeExecution({ workflow, inputs: {}, config, logger });
    expect(result.context.budgetEvents).toEqual([]);
  });
});

// ============================================================================
// enforceStepBudgets
// ============================================================================

describe('enforceStepBudgets', () => {
  it('returns ok when no circuit breaker and no context manager', () => {
    const logger = createMockLogger();
    const config = createResolvedConfig();
    const workflow = createMockWorkflow();
    const context: ExecutionContext = {
      workflowId: 'test',
      executionId: 'exec-1',
      inputs: {},
      stepResults: new Map(),
      variables: new Map(),
      abortController: new AbortController(),
      contextManager: undefined,
      budgetEvents: [],
      budgetCircuitBreaker: undefined,
    };
    const steps = [createMockStep('step-1'), createMockStep('step-2')];
    const result = enforceStepBudgets({
      steps,
      context,
      workflow,
      totalSteps: 2,
      config,
      logger,
    });
    expect(result.ok).toBe(true);
  });

  it('logs budget events for legacy enforcement (no circuit breaker)', () => {
    const logger = createMockLogger();
    const config = createResolvedConfig({
      contextManagerConfig: { maxTokens: 10000 },
    });
    const workflow = createMockWorkflow();
    const cm = createContextManagerForWorkflow(config, workflow, logger);
    const context: ExecutionContext = {
      workflowId: 'test',
      executionId: 'exec-1',
      inputs: {},
      stepResults: new Map(),
      variables: new Map(),
      abortController: new AbortController(),
      contextManager: cm,
      budgetEvents: [],
      budgetCircuitBreaker: undefined,
    };
    const steps = [createMockStep('step-1')];
    const result = enforceStepBudgets({
      steps,
      context,
      workflow,
      totalSteps: 1,
      config,
      logger,
    });
    expect(result.ok).toBe(true);
    // With context manager but no circuit breaker, legacy enforcement is used
    if (cm !== undefined) {
      expect(context.budgetEvents.length).toBeGreaterThan(0);
    }
  });
});

// ============================================================================
// recordPhaseUsage
// ============================================================================

describe('recordPhaseUsage', () => {
  it('does nothing when no budget circuit breaker', () => {
    const context: ExecutionContext = {
      workflowId: 'test',
      executionId: 'exec-1',
      inputs: {},
      stepResults: new Map(),
      variables: new Map(),
      abortController: new AbortController(),
      contextManager: undefined,
      budgetEvents: [],
      budgetCircuitBreaker: undefined,
    };
    const results: StepResult[] = [
      { stepId: 's1', status: 'success', output: 'ok', durationMs: 100 },
    ];
    // Should not throw
    recordPhaseUsage(results, context);
  });

  it('records usage when circuit breaker is present', () => {
    const mockRecordUsage = vi.fn();
    const context: ExecutionContext = {
      workflowId: 'test',
      executionId: 'exec-1',
      inputs: {},
      stepResults: new Map(),
      variables: new Map(),
      abortController: new AbortController(),
      contextManager: undefined,
      budgetEvents: [],
      budgetCircuitBreaker: {
        checkBudget: vi.fn(),
        recordUsage: mockRecordUsage,
        allocateForStep: vi.fn(),
        getSnapshot: vi.fn(),
        onStateChange: vi.fn(),
      },
    };
    const results: StepResult[] = [
      { stepId: 's1', status: 'success', output: 'ok', durationMs: 200 },
      { stepId: 's2', status: 'success', output: 'ok', durationMs: 400 },
    ];
    recordPhaseUsage(results, context);
    expect(mockRecordUsage).toHaveBeenCalledTimes(2);
    // 200ms * 0.5 = 100 tokens, 400ms * 0.5 = 200 tokens
    expect(mockRecordUsage).toHaveBeenCalledWith(100);
    expect(mockRecordUsage).toHaveBeenCalledWith(200);
  });

  it('handles empty results array', () => {
    const mockRecordUsage = vi.fn();
    const context: ExecutionContext = {
      workflowId: 'test',
      executionId: 'exec-1',
      inputs: {},
      stepResults: new Map(),
      variables: new Map(),
      abortController: new AbortController(),
      contextManager: undefined,
      budgetEvents: [],
      budgetCircuitBreaker: {
        checkBudget: vi.fn(),
        recordUsage: mockRecordUsage,
        allocateForStep: vi.fn(),
        getSnapshot: vi.fn(),
        onStateChange: vi.fn(),
      },
    };
    recordPhaseUsage([], context);
    expect(mockRecordUsage).not.toHaveBeenCalled();
  });
});
