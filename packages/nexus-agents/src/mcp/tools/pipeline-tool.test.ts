/**
 * run_pipeline MCP Tool Tests (#1736)
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

import { PipelineInputSchema, registerPipelineTool } from './pipeline-tool.js';

describe('PipelineInputSchema', () => {
  it('accepts a valid task with defaults', () => {
    const parsed = PipelineInputSchema.parse({ task: 'Build a login form' });
    expect(parsed.task).toBe('Build a login form');
    expect(parsed.dryRun).toBe(false);
    expect(parsed.quickMode).toBe(false);
    expect(parsed.simulateVotes).toBe(false);
  });

  it('rejects a task shorter than the 5-char minimum', () => {
    expect(PipelineInputSchema.safeParse({ task: 'hi' }).success).toBe(false);
  });

  it('rejects a timeoutMs outside the 30s-600s range', () => {
    expect(PipelineInputSchema.safeParse({ task: 'valid task', timeoutMs: 5_000 }).success).toBe(
      false
    );
  });

  it('accepts an explicit template override and dryRun', () => {
    const parsed = PipelineInputSchema.parse({
      task: 'audit this',
      template: 'audit',
      dryRun: true,
    });
    expect(parsed.template).toBe('audit');
    expect(parsed.dryRun).toBe(true);
  });
});

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
  registerPipelineTool(mockServer as never, {
    rateLimiter: { tryConsume: () => ({ allowed: true, remaining: 99 }) } as never,
  });
  expect(registeredName).toBe('run_pipeline');
  if (captured === undefined) throw new Error('handler not registered');
  return captured;
}

// #2824: run_pipeline used to register a bare callback that called
// `schema.parse(args)` outside any try/catch — a ZodError on bad input
// escaped as a raw JSON-RPC -32603 instead of a structured `validation`
// envelope. It now routes through the standard secure-handler chain.
describe('registerPipelineTool', () => {
  it('registers under the run_pipeline name', () => {
    expect(captureHandler()).toBeTypeOf('function');
  });

  it('returns a structured validation error for invalid input, not a thrown ZodError', async () => {
    const handler = captureHandler();
    // task is below the 5-char minimum.
    const result = await handler({ task: 'no' });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('Invalid input');
  });
});
