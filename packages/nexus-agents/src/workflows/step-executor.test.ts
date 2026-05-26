/**
 * nexus-agents/workflows - Step Executor Tests
 *
 * Tests for step execution, input resolution, retries, and conditions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Result, WorkflowStep, Task, TaskResult, AgentRole } from '../core/index.js';
import { ok, err, AgentError } from '../core/index.js';
import type { Expert } from '../agents/index.js';
import { StepExecutor, createStepExecutor, type IExpertFactory } from './step-executor.js';
import {
  createExecutionContext,
  storeStepResult,
  setVariable,
  type WorkflowExecutionContext,
} from './execution-context.js';
import {
  resolveInput,
  parseExpression,
  resolveExpression,
  containsExpressions,
  getReferencedSteps,
  extractExpressions,
} from './expression-resolver.js';

// ============================================================================
// Mock Expert Factory
// ============================================================================

interface MockExpertConfig {
  executeResult?: Result<TaskResult, AgentError>;
  executeDelay?: number;
  shouldThrow?: boolean;
  throwError?: Error;
}

function createMockExpert(config: MockExpertConfig = {}): Expert {
  const defaultResult: TaskResult = {
    taskId: 'test-task',
    output: { result: 'success' },
    metadata: {
      durationMs: 100,
      tokensUsed: 50,
      toolsUsed: [],
      model: 'test-model',
    },
  };

  return {
    id: 'mock-expert',
    role: 'code_expert',
    state: 'idle',
    capabilities: ['task_execution'],
    expertConfig: { id: 'mock', name: 'Mock Expert', role: 'code_expert', capabilities: [] },
    name: 'Mock Expert',
    execute: vi.fn(async (_task: Task): Promise<Result<TaskResult, AgentError>> => {
      if (config.executeDelay !== undefined) {
        await new Promise((resolve) => setTimeout(resolve, config.executeDelay));
      }
      if (config.shouldThrow === true) {
        throw config.throwError ?? new Error('Execution failed');
      }
      return config.executeResult ?? ok(defaultResult);
    }),
    handleMessage: vi.fn(),
    initialize: vi.fn(),
    cleanup: vi.fn().mockResolvedValue(undefined),
  } as unknown as Expert;
}

function createMockExpertFactory(expertConfig?: MockExpertConfig): IExpertFactory {
  return {
    createForRole: vi.fn((_role: AgentRole): Result<Expert, Error> => {
      return ok(createMockExpert(expertConfig));
    }),
  };
}

function createFailingExpertFactory(errorMessage: string): IExpertFactory {
  return {
    createForRole: vi.fn((_role: AgentRole): Result<Expert, Error> => {
      return err(new Error(errorMessage));
    }),
  };
}

// ============================================================================
// Expression Resolver Tests
// ============================================================================

describe('Expression Resolver', () => {
  let context: WorkflowExecutionContext;

  beforeEach(() => {
    context = createExecutionContext({
      workflowId: 'test-workflow',
      inputs: {
        name: 'test-project',
        count: 42,
        nested: { foo: 'bar', deep: { value: 123 } },
      },
    });

    storeStepResult(context, 'step1', {
      stepId: 'step1',
      output: { data: 'step1-output', items: [1, 2, 3] },
      durationMs: 100,
      status: 'success',
    });

    setVariable(context, 'myVar', 'variable-value');
  });

  describe('parseExpression', () => {
    it('should parse inputs expression', () => {
      const result = parseExpression('inputs.name');
      expect(result).toEqual({
        original: 'inputs.name',
        type: 'inputs',
        path: ['name'],
      });
    });

    it('should parse nested inputs expression', () => {
      const result = parseExpression('inputs.nested.foo');
      expect(result).toEqual({
        original: 'inputs.nested.foo',
        type: 'inputs',
        path: ['nested', 'foo'],
      });
    });

    it('should parse steps expression', () => {
      const result = parseExpression('steps.step1.output');
      expect(result).toEqual({
        original: 'steps.step1.output',
        type: 'steps',
        path: ['step1', 'output'],
      });
    });

    it('should parse steps expression with nested output', () => {
      const result = parseExpression('steps.step1.output.data');
      expect(result).toEqual({
        original: 'steps.step1.output.data',
        type: 'steps',
        path: ['step1', 'output', 'data'],
      });
    });

    it('should parse variables expression', () => {
      const result = parseExpression('variables.myVar');
      expect(result).toEqual({
        original: 'variables.myVar',
        type: 'variables',
        path: ['myVar'],
      });
    });

    it('should return null for invalid expression', () => {
      expect(parseExpression('invalid')).toBeNull();
      expect(parseExpression('unknown.path')).toBeNull();
      expect(parseExpression('')).toBeNull();
    });
  });

  describe('resolveExpression', () => {
    it('should resolve inputs expression', () => {
      const parsed = parseExpression('inputs.name')!;
      const result = resolveExpression(parsed, context);
      expect(result).toEqual({ success: true, value: 'test-project' });
    });

    it('should resolve nested inputs expression', () => {
      const parsed = parseExpression('inputs.nested.deep.value')!;
      const result = resolveExpression(parsed, context);
      expect(result).toEqual({ success: true, value: 123 });
    });

    it('should resolve steps output expression', () => {
      const parsed = parseExpression('steps.step1.output')!;
      const result = resolveExpression(parsed, context);
      expect(result).toEqual({
        success: true,
        value: { data: 'step1-output', items: [1, 2, 3] },
      });
    });

    it('should resolve nested steps output expression', () => {
      const parsed = parseExpression('steps.step1.output.data')!;
      const result = resolveExpression(parsed, context);
      expect(result).toEqual({ success: true, value: 'step1-output' });
    });

    it('should resolve variables expression', () => {
      const parsed = parseExpression('variables.myVar')!;
      const result = resolveExpression(parsed, context);
      expect(result).toEqual({ success: true, value: 'variable-value' });
    });

    it('should return error for missing input', () => {
      const parsed = parseExpression('inputs.missing')!;
      const result = resolveExpression(parsed, context);
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should return error for missing step', () => {
      const parsed = parseExpression('steps.missing.output')!;
      const result = resolveExpression(parsed, context);
      expect(result.success).toBe(false);
      expect(result.error).toContain('not completed');
    });

    it('should return error for missing variable', () => {
      const parsed = parseExpression('variables.missing')!;
      const result = resolveExpression(parsed, context);
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('containsExpressions', () => {
    it('should detect expression patterns', () => {
      expect(containsExpressions('${{ inputs.name }}')).toBe(true);
      expect(containsExpressions('Hello ${{ inputs.name }}!')).toBe(true);
      expect(containsExpressions('${{ steps.step1.output }}')).toBe(true);
    });

    it('should return false for non-expression strings', () => {
      expect(containsExpressions('Hello World')).toBe(false);
      expect(containsExpressions('{{ inputs.name }}')).toBe(false);
      expect(containsExpressions('${ inputs.name }')).toBe(false);
    });

    it('should return false for non-string values', () => {
      expect(containsExpressions(42)).toBe(false);
      expect(containsExpressions(null)).toBe(false);
      expect(containsExpressions({ key: 'value' })).toBe(false);
    });
  });

  describe('resolveInput', () => {
    it('should resolve single expression in string', () => {
      const result = resolveInput('${{ inputs.name }}', context);
      expect(result).toBe('test-project');
    });

    it('should resolve expression with preserved type', () => {
      const result = resolveInput('${{ inputs.count }}', context);
      expect(result).toBe(42);
    });

    it('should resolve expression with object result', () => {
      const result = resolveInput('${{ inputs.nested }}', context);
      expect(result).toEqual({ foo: 'bar', deep: { value: 123 } });
    });

    it('should interpolate multiple expressions in string', () => {
      const result = resolveInput(
        'Project: ${{ inputs.name }}, Count: ${{ inputs.count }}',
        context
      );
      expect(result).toBe('Project: test-project, Count: 42');
    });

    it('should resolve expressions in array', () => {
      const result = resolveInput(['${{ inputs.name }}', '${{ inputs.count }}'], context);
      expect(result).toEqual(['test-project', 42]);
    });

    it('should resolve expressions in object', () => {
      const result = resolveInput(
        {
          project: '${{ inputs.name }}',
          data: '${{ steps.step1.output.data }}',
        },
        context
      );
      expect(result).toEqual({
        project: 'test-project',
        data: 'step1-output',
      });
    });

    it('should pass through non-expression values', () => {
      expect(resolveInput('plain string', context)).toBe('plain string');
      expect(resolveInput(42, context)).toBe(42);
      expect(resolveInput(null, context)).toBe(null);
    });

    it('should throw for invalid expression', () => {
      expect(() => resolveInput('${{ invalid.path }}', context)).toThrow();
    });
  });

  describe('getReferencedSteps', () => {
    it('should extract step references from inputs', () => {
      const inputs = {
        data: '${{ steps.step1.output }}',
        other: '${{ steps.step2.output.field }}',
      };
      const refs = getReferencedSteps(inputs);
      expect(refs).toContain('step1');
      expect(refs).toContain('step2');
      expect(refs.length).toBe(2);
    });

    it('should return empty array for no step references', () => {
      const inputs = {
        data: '${{ inputs.name }}',
        var: '${{ variables.foo }}',
      };
      const refs = getReferencedSteps(inputs);
      expect(refs).toEqual([]);
    });

    it('should deduplicate step references', () => {
      const inputs = {
        data1: '${{ steps.step1.output }}',
        data2: '${{ steps.step1.output.other }}',
      };
      const refs = getReferencedSteps(inputs);
      expect(refs).toEqual(['step1']);
    });
  });

  describe('extractExpressions', () => {
    it('should extract all expressions from complex input', () => {
      const input = {
        project: '${{ inputs.name }}',
        steps: ['${{ steps.step1.output }}', '${{ steps.step2.output }}'],
        nested: { value: '${{ variables.myVar }}' },
      };
      const expressions = extractExpressions(input);
      expect(expressions.length).toBe(4);
      expect(expressions.map((e) => e.type)).toContain('inputs');
      expect(expressions.map((e) => e.type)).toContain('steps');
      expect(expressions.map((e) => e.type)).toContain('variables');
    });
  });
});

// ============================================================================
// Step Executor Tests
// ============================================================================

describe('StepExecutor', () => {
  let executor: StepExecutor;
  let context: WorkflowExecutionContext;
  let mockFactory: IExpertFactory;

  beforeEach(() => {
    mockFactory = createMockExpertFactory();
    executor = createStepExecutor({ expertFactory: mockFactory });
    context = createExecutionContext({
      workflowId: 'test-workflow',
      inputs: { projectName: 'test-project' },
    });
  });

  describe('basic execution', () => {
    it('should execute a simple step successfully', async () => {
      const step: WorkflowStep = {
        id: 'step1',
        agent: 'code_expert',
        action: 'analyze',
        inputs: { target: 'src/' },
      };

      const result = await executor.execute(step, context);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.stepId).toBe('step1');
        expect(result.value.status).toBe('success');
        expect(result.value.durationMs).toBeGreaterThanOrEqual(0);
      }
    });

    it('should resolve input expressions before execution', async () => {
      const step: WorkflowStep = {
        id: 'step1',
        agent: 'code_expert',
        action: 'analyze',
        inputs: { project: '${{ inputs.projectName }}' },
      };

      const result = await executor.execute(step, context);

      expect(result.ok).toBe(true);
      // Verify the execution completed successfully
      if (result.ok) {
        expect(result.value.status).toBe('success');
      }
    });

    it('should return failed status if expert creation fails', async () => {
      const failingFactory = createFailingExpertFactory('No expert available');
      const failingExecutor = createStepExecutor({ expertFactory: failingFactory });

      const step: WorkflowStep = {
        id: 'step1',
        agent: 'code_expert',
        action: 'analyze',
        inputs: {},
      };

      const result = await failingExecutor.execute(step, context);

      // Expert creation failure is treated as a step failure (after retries exhausted)
      // Returns ok with failed status, not an error result
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe('failed');
        expect(result.value.error).toContain('No expert available');
      }
    });

    it('should fail if dependency not satisfied', async () => {
      const step: WorkflowStep = {
        id: 'step1',
        agent: 'code_expert',
        action: 'analyze',
        inputs: { data: '${{ steps.missing.output }}' },
      };

      const result = await executor.execute(step, context);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('not completed');
      }
    });
  });

  describe('condition evaluation', () => {
    it('should skip step when condition is false', async () => {
      const step: WorkflowStep = {
        id: 'step1',
        agent: 'code_expert',
        action: 'analyze',
        inputs: {},
        condition: 'never',
      };

      const result = await executor.execute(step, context);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe('skipped');
      }
    });

    it('should execute step when condition is always', async () => {
      const step: WorkflowStep = {
        id: 'step1',
        agent: 'code_expert',
        action: 'analyze',
        inputs: {},
        condition: 'always',
      };

      const result = await executor.execute(step, context);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe('success');
      }
    });

    it('should evaluate step status conditions', async () => {
      // Add a previous step result
      storeStepResult(context, 'prevStep', {
        stepId: 'prevStep',
        output: {},
        durationMs: 100,
        status: 'success',
      });

      const step: WorkflowStep = {
        id: 'step1',
        agent: 'code_expert',
        action: 'analyze',
        inputs: {},
        condition: "steps.prevStep.status == 'success'",
      };

      const result = await executor.execute(step, context);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe('success');
      }
    });

    it('should skip when step status condition not met', async () => {
      storeStepResult(context, 'prevStep', {
        stepId: 'prevStep',
        output: {},
        durationMs: 100,
        status: 'failed',
      });

      const step: WorkflowStep = {
        id: 'step1',
        agent: 'code_expert',
        action: 'analyze',
        inputs: {},
        condition: "steps.prevStep.status == 'success'",
      };

      const result = await executor.execute(step, context);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe('skipped');
      }
    });
  });

  describe('dependency checking', () => {
    it('should fail if explicit dependency not completed', async () => {
      const step: WorkflowStep = {
        id: 'step2',
        agent: 'code_expert',
        action: 'analyze',
        inputs: {},
        dependsOn: ['step1'],
      };

      const result = await executor.execute(step, context);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('not completed');
      }
    });

    it('should succeed when dependencies are completed', async () => {
      storeStepResult(context, 'step1', {
        stepId: 'step1',
        output: { data: 'test' },
        durationMs: 100,
        status: 'success',
      });

      const step: WorkflowStep = {
        id: 'step2',
        agent: 'code_expert',
        action: 'analyze',
        inputs: { prevData: '${{ steps.step1.output.data }}' },
        dependsOn: ['step1'],
      };

      const result = await executor.execute(step, context);

      expect(result.ok).toBe(true);
    });

    it('should detect implicit dependencies from expressions', async () => {
      // Step references step1 output but step1 not completed
      const step: WorkflowStep = {
        id: 'step2',
        agent: 'code_expert',
        action: 'analyze',
        inputs: { data: '${{ steps.step1.output }}' },
      };

      const result = await executor.execute(step, context);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('not completed');
      }
    });
  });

  describe('retry logic', () => {
    it('should retry on failure', async () => {
      let attemptCount = 0;
      const failingFactory: IExpertFactory = {
        createForRole: () => {
          attemptCount++;
          if (attemptCount < 3) {
            return ok(
              createMockExpert({ executeResult: err(new AgentError('Temporary failure')) })
            );
          }
          return ok(createMockExpert({})); // Success on 3rd attempt
        },
      };

      const retryExecutor = createStepExecutor({ expertFactory: failingFactory });

      const step: WorkflowStep = {
        id: 'step1',
        agent: 'code_expert',
        action: 'analyze',
        inputs: {},
        retries: 3,
      };

      const result = await retryExecutor.execute(step, context, { retryDelayMs: 10 });

      expect(result.ok).toBe(true);
    });

    it('should fail after max retries', async () => {
      const alwaysFailingFactory: IExpertFactory = {
        createForRole: () => {
          return ok(
            createMockExpert({
              executeResult: err(new AgentError('Permanent failure')),
            })
          );
        },
      };

      const failExecutor = createStepExecutor({ expertFactory: alwaysFailingFactory });

      const step: WorkflowStep = {
        id: 'step1',
        agent: 'code_expert',
        action: 'analyze',
        inputs: {},
        retries: 2,
      };

      const result = await failExecutor.execute(step, context, { retryDelayMs: 10 });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe('failed');
        // The error message is extracted from the original error (not the wrapper)
        expect(result.value.error).toContain('Permanent failure');
      }
    });
  });

  describe('timeout handling', () => {
    it('should timeout slow steps', async () => {
      const slowFactory: IExpertFactory = {
        createForRole: () => {
          return ok(createMockExpert({ executeDelay: 1000 }));
        },
      };

      const slowExecutor = createStepExecutor({ expertFactory: slowFactory });

      const step: WorkflowStep = {
        id: 'step1',
        agent: 'code_expert',
        action: 'analyze',
        inputs: {},
        timeout: 50, // Short timeout
      };

      const result = await slowExecutor.execute(step, context);

      // After all retries exhausted (none in this case), returns ok with failed status
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe('failed');
        expect(result.value.error).toContain('timed out');
      }
    }, 10000);

    it('should use default timeout if not specified', async () => {
      const step: WorkflowStep = {
        id: 'step1',
        agent: 'code_expert',
        action: 'analyze',
        inputs: {},
      };

      const result = await executor.execute(step, context);

      expect(result.ok).toBe(true);
    });
  });

  describe('cancellation', () => {
    it('should fail if execution is cancelled', async () => {
      context.cancelled = true;

      const step: WorkflowStep = {
        id: 'step1',
        agent: 'code_expert',
        action: 'analyze',
        inputs: {},
      };

      const result = await executor.execute(step, context);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('cancelled');
      }
    });

    // Regression for #3016/#3040 — step-executor must pass an AbortSignal
    // into expert.execute and abort it when the race resolves. Without this,
    // the race-loser (in-flight model call) keeps running to its own
    // 10-minute SDK timeout after the step timer has fired at 120s.
    it('passes a signal to expert.execute and aborts it on resolution', async () => {
      let receivedSignal: AbortSignal | undefined;
      const captureFactory: IExpertFactory = {
        createForRole: () => {
          const expert = createMockExpert({});
          (expert as unknown as { execute: typeof expert.execute }).execute = vi.fn(
            (
              _task: Task,
              options?: { signal?: AbortSignal }
            ): Promise<Result<TaskResult, AgentError>> => {
              receivedSignal = options?.signal;
              return Promise.resolve(
                ok({
                  taskId: 'test-task',
                  output: { result: 'success' },
                  metadata: {
                    durationMs: 1,
                    tokensUsed: 0,
                    toolsUsed: [],
                    model: 'test-model',
                  },
                })
              );
            }
          );
          return ok(expert);
        },
      };
      const captureExecutor = createStepExecutor({ expertFactory: captureFactory });
      const step: WorkflowStep = {
        id: 'step1',
        agent: 'code_expert',
        action: 'analyze',
        inputs: {},
      };

      const result = await captureExecutor.execute(step, context);

      expect(result.ok).toBe(true);
      expect(receivedSignal).toBeInstanceOf(AbortSignal);
      // After the race resolves the executor must abort the signal so any
      // in-flight model call honors it.
      expect(receivedSignal?.aborted).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle expert throwing an error', async () => {
      const throwingFactory: IExpertFactory = {
        createForRole: () => {
          return ok(
            createMockExpert({
              shouldThrow: true,
              throwError: new Error('Expert crashed'),
            })
          );
        },
      };

      const throwingExecutor = createStepExecutor({ expertFactory: throwingFactory });

      const step: WorkflowStep = {
        id: 'step1',
        agent: 'code_expert',
        action: 'analyze',
        inputs: {},
      };

      const result = await throwingExecutor.execute(step, context);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe('failed');
        expect(result.value.error).toContain('Expert crashed');
      }
    });

    it('should capture step output on success', async () => {
      const outputFactory: IExpertFactory = {
        createForRole: () => {
          return ok(
            createMockExpert({
              executeResult: ok({
                taskId: 'test',
                output: { analysis: 'detailed result', score: 95 },
                metadata: { durationMs: 100, tokensUsed: 50, toolsUsed: [], model: 'test' },
              }),
            })
          );
        },
      };

      const outputExecutor = createStepExecutor({ expertFactory: outputFactory });

      const step: WorkflowStep = {
        id: 'step1',
        agent: 'code_expert',
        action: 'analyze',
        inputs: {},
      };

      const result = await outputExecutor.execute(step, context);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.output).toEqual({ analysis: 'detailed result', score: 95 });
      }
    });
  });
});

// ============================================================================
// Execution Context Tests
// ============================================================================

describe('ExecutionContext', () => {
  describe('createExecutionContext', () => {
    it('should create context with generated execution ID', () => {
      const context = createExecutionContext({
        workflowId: 'test-workflow',
        inputs: { name: 'test' },
      });

      expect(context.workflowId).toBe('test-workflow');
      expect(context.executionId).toMatch(/^exec_/);
      expect(context.inputs).toEqual({ name: 'test' });
      expect(context.stepResults.size).toBe(0);
      expect(context.variables.size).toBe(0);
      expect(context.cancelled).toBe(false);
    });

    it('should use provided execution ID', () => {
      const context = createExecutionContext({
        workflowId: 'test-workflow',
        inputs: {},
        executionId: 'custom-id',
      });

      expect(context.executionId).toBe('custom-id');
    });
  });

  describe('storeStepResult', () => {
    it('should store and retrieve step results', () => {
      const context = createExecutionContext({
        workflowId: 'test',
        inputs: {},
      });

      const stepResult = {
        stepId: 'step1',
        output: { data: 'test' },
        durationMs: 100,
        status: 'success' as const,
      };

      storeStepResult(context, 'step1', stepResult);

      expect(context.stepResults.get('step1')).toEqual(stepResult);
    });
  });

  describe('variable management', () => {
    it('should set and get variables', () => {
      const context = createExecutionContext({
        workflowId: 'test',
        inputs: {},
      });

      setVariable(context, 'counter', 42);
      expect(context.variables.get('counter')).toBe(42);
    });
  });
});
