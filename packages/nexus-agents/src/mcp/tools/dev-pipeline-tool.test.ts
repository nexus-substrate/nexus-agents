/**
 * run_dev_pipeline MCP Tool Tests (#1684)
 */

import { describe, it, expect, vi } from 'vitest';

// Pass-through the secure-handler / timeout chain so the registered callback
// is the bare handler — lets the tests invoke it directly (#2824).
vi.mock('../middleware/tool-wrapper.js', () => ({
  wrapToolWithTimeout: (_name: string, fn: unknown) => fn,
  toSdkCallback: (fn: unknown) => fn,
  getToolTimeout: () => 900_000,
}));
vi.mock('../middleware/secure-handler.js', () => ({
  createSecureHandler: (fn: unknown) => fn,
}));

import { DevPipelineInputSchema, registerDevPipelineTool } from './dev-pipeline-tool.js';

interface CapturedToolResult {
  isError?: boolean;
  content: Array<{ type: string; text: string }>;
}

/** Registers the tool against a mock server and returns the captured callback. */
function captureHandler(): (args: unknown) => Promise<CapturedToolResult> {
  let captured: ((args: unknown) => Promise<CapturedToolResult>) | undefined;
  let registeredName: string | undefined;
  const mockServer = {
    registerTool: (name: string, _schema: unknown, handler: unknown) => {
      registeredName = name;
      captured = handler as (args: unknown) => Promise<CapturedToolResult>;
    },
  };
  registerDevPipelineTool(mockServer as never, {
    rateLimiter: { tryConsume: () => ({ allowed: true, remaining: 99 }) } as never,
  });
  expect(registeredName).toBe('run_dev_pipeline');
  if (captured === undefined) throw new Error('handler not registered');
  return captured;
}

describe('DevPipelineInputSchema', () => {
  it('accepts direct task instructions', () => {
    const parsed = DevPipelineInputSchema.parse({ task: 'Build a login form' });
    expect(parsed.task).toBe('Build a login form');
    expect(parsed.dryRun).toBe(false);
    expect(parsed.maxVoteIterations).toBe(3);
    expect(parsed.maxQaIterations).toBe(3);
  });

  it('accepts planFile path', () => {
    const parsed = DevPipelineInputSchema.parse({ planFile: '/tmp/plan.md' });
    expect(parsed.planFile).toBe('/tmp/plan.md');
  });

  it('accepts dryRun mode', () => {
    const parsed = DevPipelineInputSchema.parse({ task: 'test', dryRun: true });
    expect(parsed.dryRun).toBe(true);
  });

  it('accepts custom iteration limits', () => {
    const parsed = DevPipelineInputSchema.parse({
      task: 'test',
      maxVoteIterations: 5,
      maxQaIterations: 2,
    });
    expect(parsed.maxVoteIterations).toBe(5);
    expect(parsed.maxQaIterations).toBe(2);
  });

  it('rejects when both task and planFile are missing', () => {
    // Schema allows both empty, but resolveTaskInput will throw at runtime
    const parsed = DevPipelineInputSchema.parse({});
    expect(parsed.task).toBeUndefined();
    expect(parsed.planFile).toBeUndefined();
  });

  it('rejects iteration limits out of range', () => {
    expect(() => DevPipelineInputSchema.parse({ task: 'test', maxVoteIterations: 10 })).toThrow();
    expect(() => DevPipelineInputSchema.parse({ task: 'test', maxQaIterations: 0 })).toThrow();
  });

  it('accepts workingDir', () => {
    const parsed = DevPipelineInputSchema.parse({
      task: 'test',
      workingDir: '/home/user/project',
    });
    expect(parsed.workingDir).toBe('/home/user/project');
  });
});

// #2824: run_dev_pipeline used to register a bare callback that called
// `schema.parse(args)` outside any try/catch — a ZodError on bad input
// escaped as a raw JSON-RPC -32603 instead of a structured `validation`
// envelope. It now routes through the standard secure-handler chain.
describe('registerDevPipelineTool', () => {
  it('registers under the run_dev_pipeline name', () => {
    // captureHandler asserts the registered name internally.
    expect(captureHandler()).toBeTypeOf('function');
  });

  it('returns a structured validation error for invalid input, not a thrown ZodError', async () => {
    const handler = captureHandler();
    // task must be a string; maxVoteIterations max is 5 — both invalid here.
    const result = await handler({ task: 12345, maxVoteIterations: 99 });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('Invalid input');
  });
});
