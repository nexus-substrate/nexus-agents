/**
 * run_workflow × the NEXUS_BUDGET_ENFORCE token ceiling (#4754).
 *
 * The tool resolves the ceiling (same flag + estimator as run_pipeline) and
 * hands it to the engine; the engine enforces it. These tests pin the tool
 * half: what reaches `engine.execute`, and what the caller is told.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { IWorkflowEngine, WorkflowDefinition, WorkflowResult } from '../../core/index.js';
import { WorkflowError } from '../../core/index.js';
import { RateLimiter } from '../middleware/index.js';
import { registerRunWorkflowTool, RunWorkflowInputSchema } from './run-workflow.js';

vi.mock('./tool-memory.js', () => ({
  getToolMemory: () => ({
    recordTask: vi.fn(),
    recordLearning: vi.fn(),
    recordError: vi.fn(),
    runPromotionPipeline: vi.fn().mockResolvedValue(undefined),
  }),
}));

type Handler = (args: unknown) => Promise<{ content: { text: string }[]; isError?: boolean }>;

const ENV = 'NEXUS_BUDGET_ENFORCE';
const originalEnv = process.env[ENV];

const workflow: WorkflowDefinition = {
  name: 'wf',
  version: '1.0.0',
  inputs: [],
  steps: [
    { id: 's1', agent: 'code_expert', action: 'analyze', inputs: {} },
    { id: 's2', agent: 'code_expert', action: 'review', inputs: {} },
  ],
};

const okResult: WorkflowResult = {
  executionId: 'exec-1',
  workflowName: 'wf',
  stepResults: [{ stepId: 's1', output: 'x', durationMs: 1, status: 'success', tokensUsed: 5 }],
  output: 'x',
  totalDurationMs: 1,
};

function setup(execute: IWorkflowEngine['execute']): {
  handler: Handler;
  execute: ReturnType<typeof vi.fn>;
} {
  const executeMock = vi.fn(execute);
  const engine = {
    loadTemplate: vi.fn(),
    execute: executeMock,
    getStatus: vi.fn(),
    cancel: vi.fn(),
    listTemplates: vi
      .fn()
      .mockResolvedValue([{ name: 'wf', version: '1.0.0', path: 'builtin:wf' }]),
    getTemplateByName: vi.fn().mockResolvedValue(workflow),
  } as unknown as IWorkflowEngine;
  let handler: Handler | undefined;
  const server = {
    registerTool: (_n: string, _c: unknown, h: Handler) => {
      handler = h;
    },
  } as unknown as McpServer;
  registerRunWorkflowTool(server, {
    workflowEngine: engine,
    resolveExecutionEngine: () => engine,
    rateLimiter: new RateLimiter({ capacity: 1000, refillRate: 1000, refillIntervalMs: 1000 }),
  });
  if (handler === undefined) throw new Error('not registered');
  return { handler, execute: executeMock };
}

afterEach(() => {
  if (originalEnv === undefined) delete process.env['NEXUS_BUDGET_ENFORCE'];
  else process.env[ENV] = originalEnv;
});

describe('run_workflow maxTokens input', () => {
  it('accepts a positive integer and rejects zero, negatives and fractions', () => {
    const base = { template: 'wf', inputs: {} };
    expect(RunWorkflowInputSchema.safeParse({ ...base, maxTokens: 5000 }).success).toBe(true);
    for (const bad of [0, -1, 1.5]) {
      expect(RunWorkflowInputSchema.safeParse({ ...base, maxTokens: bad }).success).toBe(false);
    }
  });
});

describe('run_workflow budget resolution (#4754)', () => {
  it('flag off: engine is called exactly as before, no budget in the result', async () => {
    delete process.env['NEXUS_BUDGET_ENFORCE'];
    const { handler, execute } = setup(() => Promise.resolve({ ok: true, value: okResult }));
    const response = await handler({ template: 'wf', inputs: {} });
    expect(execute.mock.calls[0]).toHaveLength(2);
    expect(JSON.parse(response.content[0]?.text ?? '{}')).not.toHaveProperty('budget');
  });

  it('flag off + explicit maxTokens: says the ceiling was NOT enforced, never silent', async () => {
    delete process.env['NEXUS_BUDGET_ENFORCE'];
    const { handler, execute } = setup(() => Promise.resolve({ ok: true, value: okResult }));
    const response = await handler({ template: 'wf', inputs: {}, maxTokens: 50 });
    expect(execute.mock.calls[0]).toHaveLength(2);
    expect(JSON.parse(response.content[0]?.text ?? '{}').budget).toMatchObject({
      status: 'not_enforced',
      requestedMaxTokens: 50,
    });
  });

  it('flag on + explicit maxTokens: passes that ceiling to the engine and reports its outcome', async () => {
    process.env[ENV] = 'true';
    const outcome = {
      status: 'within_budget' as const,
      ceilingTokens: 50,
      spentTokens: 5,
      measuredSteps: 1,
      unmeasuredSteps: 0,
      skippedStepIds: [],
    };
    const { handler, execute } = setup(() =>
      Promise.resolve({ ok: true, value: { ...okResult, budget: outcome } })
    );
    const response = await handler({ template: 'wf', inputs: {}, maxTokens: 50 });
    expect(execute.mock.calls[0]?.[2]).toMatchObject({ budget: { maxTokens: 50 } });
    expect(JSON.parse(response.content[0]?.text ?? '{}').budget).toEqual(outcome);
  });

  // The input-derived estimate is ~1.2k tokens/step against a real 2.6k (p25)
  // to 10k (median), so an estimated ceiling would fail ordinary workflows
  // after phase 1. Only a caller-supplied ceiling enforces on run_workflow.
  it('flag on, no maxTokens: not capped, and says so', async () => {
    process.env[ENV] = '1';
    const { handler, execute } = setup(() => Promise.resolve({ ok: true, value: okResult }));
    const response = await handler({
      template: 'wf',
      inputs: { target: 'review the login module thoroughly' },
    });
    expect(execute.mock.calls[0]).toHaveLength(2);
    const budget = JSON.parse(response.content[0]?.text ?? '{}').budget;
    expect(budget.status).toBe('not_enforced');
    expect(budget.reason).toMatch(/maxTokens/);
    expect(budget).not.toHaveProperty('requestedMaxTokens');
  });

  it('a requested ceiling the engine did not report on reads not_enforced, never silent', async () => {
    process.env[ENV] = 'true';
    const { handler } = setup(() => Promise.resolve({ ok: true, value: okResult }));
    const response = await handler({ template: 'wf', inputs: {}, maxTokens: 50 });
    expect(JSON.parse(response.content[0]?.text ?? '{}').budget).toEqual({
      status: 'not_enforced',
      requestedMaxTokens: 50,
      reason: 'engine did not report budget',
    });
  });

  it('a budget halt is a non-retryable business refusal carrying the completed steps', async () => {
    process.env[ENV] = 'true';
    const completedSteps = [
      { stepId: 's1', output: 'x', durationMs: 4, status: 'success', tokensUsed: 900 },
    ];
    const { handler } = setup(() =>
      Promise.resolve({
        ok: false,
        error: new WorkflowError('Workflow token budget exhausted', {
          context: { budget: { status: 'exhausted' }, completedSteps, executionId: 'e' },
        }),
      })
    );
    const response = (await handler({ template: 'wf', inputs: {}, maxTokens: 50 })) as {
      content: { text: string }[];
      _meta?: Record<string, { errorCategory: string; isRetryable: boolean }>;
    };
    expect(response._meta?.['nexus-agents/error']).toMatchObject({
      errorCategory: 'business',
      isRetryable: false,
    });
    const body = JSON.parse(response.content[0]?.text ?? '{}');
    expect(body.stepResults).toEqual([{ stepId: 's1', status: 'success', durationMs: 4 }]);
  });

  it('a non-budget failure keeps the internal category and empty stepResults', async () => {
    process.env[ENV] = 'true';
    const { handler } = setup(() =>
      Promise.resolve({ ok: false, error: new WorkflowError('boom', { context: {} }) })
    );
    const response = (await handler({ template: 'wf', inputs: {} })) as {
      content: { text: string }[];
      _meta?: Record<string, { errorCategory: string }>;
    };
    expect(response._meta?.['nexus-agents/error']?.errorCategory).toBe('internal');
    expect(JSON.parse(response.content[0]?.text ?? '{}').stepResults).toEqual([]);
  });

  it('a budget halt surfaces spent vs ceiling in the failure envelope', async () => {
    process.env[ENV] = 'true';
    const budget = { status: 'exhausted', ceilingTokens: 50, spentTokens: 900 };
    const { handler } = setup(() =>
      Promise.resolve({
        ok: false,
        error: new WorkflowError(
          'Workflow token budget exhausted: spent 900 of a 50-token ceiling',
          {
            context: { budget, executionId: 'exec-9', durationMs: 3 },
          }
        ),
      })
    );
    const response = await handler({ template: 'wf', inputs: {}, maxTokens: 50 });
    expect(response.isError).toBe(true);
    const text = response.content[0]?.text ?? '';
    expect(text).toContain('"spentTokens": 900');
    expect(text).toContain('"ceilingTokens": 50');
  });
});
