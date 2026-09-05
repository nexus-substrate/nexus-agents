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
  (_task: string, _stages: unknown, _options?: { trustTier?: string; dryRun?: boolean }) =>
    Promise.resolve(PIPELINE_RESULT)
);
vi.mock('../../pipeline/dev-pipeline.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../pipeline/dev-pipeline.js')>();
  return {
    ...actual,
    runDevPipeline: (
      task: string,
      stages: unknown,
      options?: { trustTier?: string; dryRun?: boolean }
    ) => runDevPipelineMock(task, stages, options),
  };
});

import {
  DevPipelineInputSchema,
  registerDevPipelineTool,
  runDevPipelineForGoal,
} from './dev-pipeline-tool.js';
import { ERROR_ENVELOPE_META_KEY } from '../error-envelope.js';
import { readJobResult } from '../jobs/job-result-store.js';
import { _resetForTests as resetJobConcurrency } from '../jobs/job-concurrency.js';
import { resetNexusDataDirCache } from '../../config/nexus-data-dir.js';
import type { CallerInfo } from '../middleware/request-context.js';

interface HandlerCtx {
  // `caller` is part of the real RequestContext and is what makes the tier a
  // measurement rather than the `deriveTrustTier({})` fallback (#4733), so the
  // fixture type has to carry it.
  requestContext: { trustTier: string; caller?: CallerInfo };
}
type CtxHandler = (args: unknown, ctx: HandlerCtx) => Promise<CapturedToolResult>;

interface CapturedToolResult {
  isError?: boolean;
  content: Array<{ type: string; text: string }>;
}

/**
 * A stdio-tier (trusted) context, the production default for a local CLI caller.
 * The `caller` is what a real stdio request carries; without it the tier is the
 * constant fallback and is deliberately not threaded (#4733).
 */
const STDIO_CTX: HandlerCtx = {
  requestContext: { trustTier: '1', caller: { transport: 'stdio' } },
};

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

// #4933: the async hint is remediation text, and remediation that does not
// apply to the request it answers is worse than none — a caller following it
// verbatim gets another synchronous run.
describe('the async hint matches whether async is actually available (#4933)', () => {
  /** Drives the handler's catch block: no task and no planFile. */
  async function errorEnvelope(extra: Record<string, unknown>): Promise<string> {
    const handler = captureHandler();
    const result = await handler(extra, STDIO_CTX);
    return result.content[0]!.text;
  }

  it('omits the async hint for a dry run, which ignores dispatch entirely', async () => {
    // `input.dispatch === 'async' && !input.dryRun` is false for a dry run, so
    // `dispatch: 'async'` is silently discarded. Telling the caller to retry
    // with it sends them back through the same synchronous path.
    const text = await errorEnvelope({ dryRun: true });

    expect(text).not.toContain("dispatch: 'async'");
  });

  it('says instead that dry runs are synchronous', async () => {
    // The pair: deleting the hint entirely would satisfy the assertion above
    // while leaving the caller with no explanation at all.
    const text = await errorEnvelope({ dryRun: true });

    expect(text).toMatch(/dry run/i);
  });

  it('still carries the hint for a real run, where async does apply', async () => {
    // The other pair, and the regression this must not cause: a non-dryRun
    // run genuinely can exceed the 900s ceiling, and async is its escape.
    const text = await errorEnvelope({ dryRun: false });

    expect(text).toContain("dispatch: 'async'");
  });

  it('reports the underlying error in both cases', async () => {
    // Whatever the hint says, the actual failure has to survive it.
    expect(await errorEnvelope({ dryRun: true })).toContain('planFile');
    expect(await errorEnvelope({ dryRun: false })).toContain('planFile');
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

// #4170: simulateVotes must FAIL CLOSED outside test runners. The old guard
// only logged a warning and proceeded — a random panel could resolve
// outcome:'approved' with zero live voters. Outside a test runner the handler
// now rejects with a `permission` envelope unless NEXUS_ALLOW_SIMULATE=1.
describe('run_dev_pipeline simulateVotes fail-closed gate (#4170)', () => {
  const originalVitest = process.env['VITEST'];
  const originalNodeEnv = process.env['NODE_ENV'];
  const originalAllowSimulate = process.env['NEXUS_ALLOW_SIMULATE'];

  /** Simulate a non-test-runner process (no VITEST, production NODE_ENV). */
  function leaveTestRunnerEnv(): void {
    delete process.env['VITEST'];
    process.env['NODE_ENV'] = 'production';
    delete process.env['NEXUS_ALLOW_SIMULATE'];
  }

  afterEach(() => {
    if (originalVitest === undefined) delete process.env['VITEST'];
    else process.env['VITEST'] = originalVitest;
    if (originalNodeEnv === undefined) delete process.env['NODE_ENV'];
    else process.env['NODE_ENV'] = originalNodeEnv;
    if (originalAllowSimulate === undefined) delete process.env['NEXUS_ALLOW_SIMULATE'];
    else process.env['NEXUS_ALLOW_SIMULATE'] = originalAllowSimulate;
  });

  it('rejects simulateVotes outside a test runner with a permission envelope', async () => {
    const handler = captureHandler();
    leaveTestRunnerEnv();
    const result = await handler({ task: 'Build feature X', simulateVotes: true }, STDIO_CTX);
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('NEXUS_ALLOW_SIMULATE');
    const meta = (result as { _meta?: Record<string, unknown> })._meta;
    const envelope = meta?.[ERROR_ENVELOPE_META_KEY] as { errorCategory: string };
    expect(envelope.errorCategory).toBe('permission');
  });

  it('rejects identically in async dispatch mode — no pending envelope leaks out', async () => {
    const handler = captureHandler();
    leaveTestRunnerEnv();
    const result = await handler(
      { task: 'Build feature X', simulateVotes: true, dispatch: 'async' },
      STDIO_CTX
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('NEXUS_ALLOW_SIMULATE');
  });

  it('proceeds with simulated: true in the output when NEXUS_ALLOW_SIMULATE=1', async () => {
    const handler = captureHandler();
    leaveTestRunnerEnv();
    process.env['NEXUS_ALLOW_SIMULATE'] = '1';
    const result = await handler({ task: 'Build feature X', simulateVotes: true }, STDIO_CTX);
    expect(result.isError).not.toBe(true);
    const output = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(output['simulated']).toBe(true);
  });

  // #4772: the fields exist on DevPipelineResult and must reach the MCP
  // envelope. A live dry run on 4.1.1 showed they did not — the response is
  // built from an explicit field list, so adding them to the result type was
  // not enough. "The field exists" and "a caller sees it" are different claims.
  it('surfaces securityRan and planStatus in the response envelope', async () => {
    runDevPipelineMock.mockResolvedValueOnce({
      completed: false,
      plan: '',
      tasks: [],
      voteIterations: 1,
      qaIterations: 0,
      securityPassed: false,
      securityRan: false,
      planStatus: 'empty',
    } as never);
    const handler = captureHandler();

    const result = await handler({ task: 'Build feature X', dryRun: true }, STDIO_CTX);
    const output = JSON.parse(result.content[0]!.text) as Record<string, unknown>;

    // securityPassed:false alone reads as "security rejected this".
    expect(output['securityPassed']).toBe(false);
    expect(output['securityRan']).toBe(false);
    expect(output['planStatus']).toBe('empty');
  });

  it('surfaces terminal plan-vote evidence in the response envelope', async () => {
    runDevPipelineMock.mockResolvedValueOnce({
      completed: false,
      plan: 'last plan',
      tasks: [],
      voteIterations: 3,
      qaIterations: 0,
      securityPassed: false,
      securityRan: false,
      planStatus: 'unapproved',
      planVoteApprovalPercentage: 40,
      planVoteFeedback: 'Still not right',
    } as never);
    const result = await captureHandler()({ task: 'Build feature X' }, STDIO_CTX);

    const output = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(output['planStatus']).toBe('unapproved');
    expect(output['planVoteApprovalPercentage']).toBe(40);
    expect(output['planVoteFeedback']).toBe('Still not right');
  });

  it('surfaces the dryRun marker too', async () => {
    // #4993 added `dryRun` to DevPipelineResult for the same reason as the two
    // fields above — `completed: false` was the request, not a fault — and then
    // did not list it in `buildStructuredOutput` either. A live
    // `run_dev_pipeline({ dryRun: true })` came back with no way to tell a
    // successful dry run from a failed pipeline. Same omission, same function,
    // under the comment describing it.
    runDevPipelineMock.mockResolvedValueOnce({
      completed: false,
      dryRun: true,
      plan: 'a real plan',
      tasks: [],
      voteIterations: 2,
      qaIterations: 0,
      securityPassed: false,
      securityRan: false,
    } as never);
    const handler = captureHandler();

    const result = await handler({ task: 'Build feature X', dryRun: true }, STDIO_CTX);
    const output = JSON.parse(result.content[0]!.text) as Record<string, unknown>;

    expect(output['dryRun']).toBe(true);
    expect(output['completed']).toBe(false);
  });

  it('surfaces taskStatus in the response envelope (#5645)', async () => {
    runDevPipelineMock.mockResolvedValueOnce({
      completed: true,
      plan: 'a real plan',
      tasks: [],
      voteIterations: 1,
      qaIterations: 1,
      securityPassed: true,
      securityRan: true,
      taskStatus: 'all_done',
    } as never);
    const handler = captureHandler();

    const result = await handler({ task: 'Build feature X' }, STDIO_CTX);
    const output = JSON.parse(result.content[0]!.text) as Record<string, unknown>;

    expect(output['taskStatus']).toBe('all_done');
  });

  it('omits both fields when the pipeline did not report them', async () => {
    // Absent means the producer predates the distinction — not false, not 'empty'.
    const handler = captureHandler();

    const result = await handler({ task: 'Build feature X' }, STDIO_CTX);
    const output = JSON.parse(result.content[0]!.text) as Record<string, unknown>;

    expect(output).not.toHaveProperty('securityRan');
    expect(output).not.toHaveProperty('planStatus');
    // The pair for dryRun: an ordinary run must not claim to have been one.
    expect(output).not.toHaveProperty('dryRun');
    expect(output).not.toHaveProperty('taskStatus');
  });

  it('stays allowed inside a test runner with no simulated flag (existing suites unaffected)', async () => {
    // Default vitest env: VITEST=true.
    const handler = captureHandler();
    const result = await handler({ task: 'Build feature X', simulateVotes: true }, STDIO_CTX);
    expect(result.isError).not.toBe(true);
    const output = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(output['simulated']).toBeUndefined();
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

  // #4733: these fixtures now carry `caller`, because a tier without one is
  // not a measurement — `createRequestContext` derives from `caller = {}` and
  // no production site supplies `options.trustTier` explicitly, so a
  // caller-less tier is the constant fallback rather than a threaded value.
  it('threads the real RequestContext.trustTier into runDevPipeline options', async () => {
    const handler = captureHandler();
    await handler(
      { task: 'Build feature X' },
      { requestContext: { trustTier: '1', caller: { transport: 'stdio' } } }
    );
    expect(runDevPipelineMock).toHaveBeenCalledTimes(1);
    expect(runDevPipelineMock.mock.calls[0]?.[2]?.trustTier).toBe('1');
  });

  it("forwards an untrusted tier '3' unchanged (not silently downgraded to trusted)", async () => {
    const handler = captureHandler();
    await handler(
      { task: 'Build feature X' },
      { requestContext: { trustTier: '3', caller: { authenticated: false } } }
    );
    expect(runDevPipelineMock.mock.calls[0]?.[2]?.trustTier).toBe('3');
  });

  it('does NOT thread a caller-less tier — that is the constant, not a measurement', async () => {
    // The shipped reality until a callerInfo producer exists (#4733).
    const handler = captureHandler();
    await handler({ task: 'Build feature X' }, { requestContext: { trustTier: '3' } });
    expect(runDevPipelineMock.mock.calls[0]?.[2]?.trustTier).toBeUndefined();
  });
});

// ============================================================================
// The iteration caps reach the pipeline (#4939)
// ============================================================================

describe('run_dev_pipeline iteration caps are wired (#4939)', () => {
  // Both were bounds-checked, defaulted and described in the generated tool
  // reference, and neither was read off `parsed.data` — a documented parameter
  // a caller could set to no effect. The schema tests above prove parsing; this
  // proves the value leaves the handler.
  beforeEach(() => {
    runDevPipelineMock.mockClear();
  });

  it('passes both caps through to the pipeline', async () => {
    const handler = captureHandler();
    await handler({ task: 'Build feature X', maxVoteIterations: 1, maxQaIterations: 2 }, STDIO_CTX);

    const options = runDevPipelineMock.mock.calls[0]?.[2] as
      { maxVoteIterations?: number; maxQaIterations?: number } | undefined;
    expect(options?.maxVoteIterations).toBe(1);
    expect(options?.maxQaIterations).toBe(2);
  });

  it('passes the schema defaults when the caller sets neither', async () => {
    // The pair: forwarding `undefined` would satisfy nothing above and let the
    // pipeline fall back on its own constants, which happen to agree today and
    // would diverge the moment either changed.
    const handler = captureHandler();
    await handler({ task: 'Build feature X' }, STDIO_CTX);

    const options = runDevPipelineMock.mock.calls[0]?.[2] as
      { maxVoteIterations?: number; maxQaIterations?: number } | undefined;
    expect(options?.maxVoteIterations).toBe(3);
    expect(options?.maxQaIterations).toBe(3);
  });
});

describe('runDevPipelineForGoal — dryRun reaches the pipeline (#4806)', () => {
  beforeEach(() => runDevPipelineMock.mockClear());

  // The seam. `run-tool.test.ts` asserts that `run` calls
  // `runDevPipelineForGoal` with `dryRun: true`, and stops there — one link
  // short of the only place the flag does anything. This function parsed the
  // flag into `input`, which only `createStages` reads, and then built the
  // options from `trustTier` alone, so `dev-pipeline.ts`'s dry-run
  // short-circuit never fired and the "plan and vote only" run implemented,
  // QA'd and security-scanned for real.
  it('passes dryRun through to runDevPipeline options', async () => {
    await runDevPipelineForGoal('add retry logic', undefined, true);

    expect(runDevPipelineMock).toHaveBeenCalledTimes(1);
    expect(runDevPipelineMock.mock.calls[0]?.[2]?.dryRun).toBe(true);
  });

  it('leaves dryRun unset on an ordinary run', async () => {
    // The pair: a fix that hardcoded `dryRun: true` would pass the test above
    // while turning every `run` into a no-op.
    await runDevPipelineForGoal('add retry logic', undefined, undefined);

    expect(runDevPipelineMock.mock.calls[0]?.[2]?.dryRun).toBeUndefined();
  });

  it('still threads trustTier alongside it', async () => {
    await runDevPipelineForGoal('add retry logic', '3', true);

    expect(runDevPipelineMock.mock.calls[0]?.[2]).toMatchObject({
      trustTier: '3',
      dryRun: true,
    });
  });
});
