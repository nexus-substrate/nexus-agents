/**
 * run_dev_pipeline MCP Tool Tests (#1684)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

// #3712: capture the options (esp. trustTier) handed to runDevPipeline so we can
// assert the consensus→execute snapshot is fed the caller's real trust tier.
const PIPELINE_RESULT = {
  completed: true,
  plan: 'plan',
  tasks: [],
  voteIterations: 1,
  qaIterations: 1,
  securityPassed: true,
};
const runDevPipelineMock = vi.fn(
  (_task: string, _stages: unknown, _options?: { trustTier?: string }) =>
    Promise.resolve(PIPELINE_RESULT)
);
vi.mock('../../pipeline/dev-pipeline.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../pipeline/dev-pipeline.js')>();
  return {
    ...actual,
    runDevPipeline: (task: string, stages: unknown, options?: { trustTier?: string }) =>
      runDevPipelineMock(task, stages, options),
  };
});

import { DevPipelineInputSchema, registerDevPipelineTool } from './dev-pipeline-tool.js';
import { readJobResult } from '../jobs/job-result-store.js';
import { _resetForTests as resetJobConcurrency } from '../jobs/job-concurrency.js';
import { resetNexusDataDirCache } from '../../config/nexus-data-dir.js';

interface HandlerCtx {
  requestContext: { trustTier: string };
}
type CtxHandler = (args: unknown, ctx: HandlerCtx) => Promise<CapturedToolResult>;

interface CapturedToolResult {
  isError?: boolean;
  content: Array<{ type: string; text: string }>;
}

/** A stdio-tier (trusted) context, the production default for a local CLI caller. */
const STDIO_CTX: HandlerCtx = { requestContext: { trustTier: '1' } };

/**
 * Registers the tool against a mock server and returns the captured callback.
 * The secure-handler is mocked to identity (top of file), so the captured value
 * is the bare 2-arg `(args, ctx)` handler — tests must pass a HandlerCtx (#3712).
 */
function captureHandler(): CtxHandler {
  let captured: CtxHandler | undefined;
  let registeredName: string | undefined;
  const mockServer = {
    registerTool: (name: string, _schema: unknown, handler: unknown) => {
      registeredName = name;
      captured = handler as CtxHandler;
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

  it('accepts an opt-in maxBudgetTokens ceiling (#3395)', () => {
    const parsed = DevPipelineInputSchema.parse({ task: 'test', maxBudgetTokens: 50_000 });
    expect(parsed.maxBudgetTokens).toBe(50_000);
  });

  it('leaves maxBudgetTokens undefined by default (enforcement off)', () => {
    const parsed = DevPipelineInputSchema.parse({ task: 'test' });
    expect(parsed.maxBudgetTokens).toBeUndefined();
  });

  it('rejects a non-positive maxBudgetTokens', () => {
    expect(() => DevPipelineInputSchema.parse({ task: 'test', maxBudgetTokens: 0 })).toThrow();
    expect(() => DevPipelineInputSchema.parse({ task: 'test', maxBudgetTokens: -100 })).toThrow();
  });

  it('defaults dispatch to sync and accepts async (#3726)', () => {
    expect(DevPipelineInputSchema.parse({ task: 'test' }).dispatch).toBe('sync');
    expect(DevPipelineInputSchema.parse({ task: 'test', dispatch: 'async' }).dispatch).toBe(
      'async'
    );
    expect(() => DevPipelineInputSchema.parse({ task: 'test', dispatch: 'bogus' })).toThrow();
  });
});

// #3726: async dispatch mode. A real run can exceed the 900s MCP request
// timeout, so `dispatch: 'async'` returns a jobId immediately and runs the
// pipeline in the background (poll get_job_result).
describe('run_dev_pipeline async dispatch (#3726)', () => {
  let tmpDir: string;
  const originalDataDir = process.env['NEXUS_DATA_DIR'];

  /** Parse the JSON envelope out of a captured tool result. */
  function envelope(result: CapturedToolResult): Record<string, unknown> {
    return JSON.parse(result.content[0]!.text) as Record<string, unknown>;
  }

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'nexus-dp-async-'));
    process.env['NEXUS_DATA_DIR'] = tmpDir;
    resetNexusDataDirCache();
    resetJobConcurrency();
    runDevPipelineMock.mockClear();
  });

  afterEach(() => {
    if (originalDataDir === undefined) delete process.env['NEXUS_DATA_DIR'];
    else process.env['NEXUS_DATA_DIR'] = originalDataDir;
    resetNexusDataDirCache();
    resetJobConcurrency();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns { status: 'pending', jobId } and mints a dp-<uuid> id without a sessionId", async () => {
    const handler = captureHandler();
    const result = await handler({ task: 'Build feature X', dispatch: 'async' }, STDIO_CTX);
    const env = envelope(result);
    expect(env['status']).toBe('pending');
    expect(typeof env['jobId']).toBe('string');
    expect(env['jobId'] as string).toMatch(/^dp-/);
    expect(env['pollTool']).toBe('get_job_result');
  });

  it('uses the sessionId verbatim as the jobId when one is provided', async () => {
    const handler = captureHandler();
    const result = await handler(
      { task: 'Build feature X', dispatch: 'async', sessionId: 'my-session-1' },
      STDIO_CTX
    );
    expect(envelope(result)['jobId']).toBe('my-session-1');
  });

  it('dryRun ALWAYS stays sync even when dispatch is async', async () => {
    const handler = captureHandler();
    const result = await handler(
      { task: 'Build feature X', dispatch: 'async', dryRun: true },
      STDIO_CTX
    );
    // Sync path runs the (mocked) pipeline inline and returns a structured
    // result, NOT a pending envelope.
    expect(envelope(result)['status']).toBeUndefined();
    expect(runDevPipelineMock).toHaveBeenCalledTimes(1);
  });

  it('records the pipeline result to the sidecar when the background run completes', async () => {
    const handler = captureHandler();
    const result = await handler(
      { task: 'Build feature X', dispatch: 'async', sessionId: 'sess-complete' },
      STDIO_CTX
    );
    expect(envelope(result)['jobId']).toBe('sess-complete');
    // The background run is fire-and-forget; let the microtask queue drain.
    await new Promise((r) => setImmediate(r));
    const record = readJobResult('sess-complete');
    expect(record?.status).toBe('complete');
  });

  it('surfaces an idempotency collision when a sessionId is reused with different inputs', async () => {
    const handler = captureHandler();
    const first = await handler(
      { task: 'First task', dispatch: 'async', sessionId: 'collide-1' },
      STDIO_CTX
    );
    expect(envelope(first)['status']).toBe('pending');
    // Reusing the sessionId with a DIFFERENT task must NOT silently return the
    // first run's data — it surfaces the existing idempotency collision envelope.
    const second = await handler(
      { task: 'DIFFERENT task', dispatch: 'async', sessionId: 'collide-1' },
      STDIO_CTX
    );
    expect(second.isError).toBe(true);
    expect(second.content[0]?.text).toContain('Idempotency key already used');
  });

  it('sync errors carry the async-mode discoverability hint (#3726)', async () => {
    runDevPipelineMock.mockRejectedValueOnce(new Error('stage exploded'));
    const handler = captureHandler();
    const result = await handler({ task: 'Build feature X' }, STDIO_CTX);
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("dispatch: 'async'");
    expect(result.content[0]?.text).toContain('get_job_result');
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
    const result = await handler({ task: 12345, maxVoteIterations: 99 }, STDIO_CTX);
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('Invalid input');
  });
});

describe('registerDevPipelineTool — trustTier threading (#3712)', () => {
  beforeEach(() => runDevPipelineMock.mockClear());

  it('threads the real RequestContext.trustTier into runDevPipeline options', async () => {
    const handler = captureHandler();
    await handler({ task: 'Build feature X' }, { requestContext: { trustTier: '1' } });
    expect(runDevPipelineMock).toHaveBeenCalledTimes(1);
    expect(runDevPipelineMock.mock.calls[0]?.[2]?.trustTier).toBe('1');
  });

  it("forwards an untrusted tier '3' unchanged (not silently downgraded to trusted)", async () => {
    const handler = captureHandler();
    await handler({ task: 'Build feature X' }, { requestContext: { trustTier: '3' } });
    expect(runDevPipelineMock.mock.calls[0]?.[2]?.trustTier).toBe('3');
  });
});
