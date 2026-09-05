/**
 * run_pipeline MCP Tool Tests (#1736)
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

// #3730: stub the adaptive orchestrator so the async background run resolves
// fast and deterministically (no live adapters in unit tests).
interface StubOrchestratorResult {
  success: boolean;
  templateId: string;
  selectionMethod: string;
  taskClassification: { pipelineType: string };
  stepsExecuted: number;
  durationMs: number;
  /** Present only on the #4363 failure fixtures. */
  error?: string;
}
const ORCHESTRATOR_RESULT: StubOrchestratorResult = {
  success: true,
  templateId: 'general',
  selectionMethod: 'auto',
  taskClassification: { pipelineType: 'general' },
  stepsExecuted: 1,
  durationMs: 1,
};
const runAdaptiveOrchestratorMock = vi.fn(() => Promise.resolve(ORCHESTRATOR_RESULT));
vi.mock('../../pipeline/adaptive-orchestrator.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../pipeline/adaptive-orchestrator.js')>();
  return {
    ...actual,
    runAdaptiveOrchestrator: () => runAdaptiveOrchestratorMock(),
  };
});

import { PipelineInputSchema, registerPipelineTool, runPipelineForGoal } from './pipeline-tool.js';
import type { ILogger } from '../../core/index.js';
import { ERROR_ENVELOPE_META_KEY } from '../error-envelope.js';
import { readJobResult } from '../jobs/job-result-store.js';
import { _resetForTests as resetJobConcurrency } from '../jobs/job-concurrency.js';
import { resetNexusDataDirCache } from '../../config/nexus-data-dir.js';

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

  it('defaults dispatch to sync and accepts async (#3730)', () => {
    expect(PipelineInputSchema.parse({ task: 'valid task' }).dispatch).toBe('sync');
    expect(PipelineInputSchema.parse({ task: 'valid task', dispatch: 'async' }).dispatch).toBe(
      'async'
    );
    expect(() => PipelineInputSchema.parse({ task: 'valid task', dispatch: 'bogus' })).toThrow();
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

// #3730: async dispatch mode. A real run can exceed the 900s MCP request
// timeout, so `dispatch: 'async'` returns a jobId immediately and runs the
// pipeline in the background (poll get_job_result). run_pipeline has no
// sessionId, so a fresh `rp-<uuid>` jobId is always minted (no idempotency
// surface).
describe('run_pipeline async dispatch (#3730)', () => {
  let tmpDir: string;
  const originalDataDir = process.env['NEXUS_DATA_DIR'];

  /** Parse the JSON envelope out of a captured tool result. */
  function envelope(result: CapturedToolResult): Record<string, unknown> {
    return JSON.parse(result.content[0]!.text) as Record<string, unknown>;
  }

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'nexus-rp-async-'));
    process.env['NEXUS_DATA_DIR'] = tmpDir;
    resetNexusDataDirCache();
    resetJobConcurrency();
    runAdaptiveOrchestratorMock.mockClear();
  });

  afterEach(() => {
    if (originalDataDir === undefined) delete process.env['NEXUS_DATA_DIR'];
    else process.env['NEXUS_DATA_DIR'] = originalDataDir;
    resetNexusDataDirCache();
    resetJobConcurrency();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns { status: 'pending', jobId } and mints an rp-<uuid> id", async () => {
    const handler = captureHandler();
    const result = await handler({ task: 'Build feature X', dispatch: 'async' });
    const env = envelope(result);
    expect(env['status']).toBe('pending');
    expect(typeof env['jobId']).toBe('string');
    expect(env['jobId'] as string).toMatch(/^rp-/);
    expect(env['pollTool']).toBe('get_job_result');
  });

  it('runs the pipeline inline (sync) by default — no pending envelope', async () => {
    const handler = captureHandler();
    const result = await handler({ task: 'Build feature X' });
    expect(envelope(result)['status']).toBeUndefined();
    expect(runAdaptiveOrchestratorMock).toHaveBeenCalledTimes(1);
  });

  it('records the pipeline result to the sidecar when the background run completes', async () => {
    const handler = captureHandler();
    const result = await handler({ task: 'Build feature X', dispatch: 'async' });
    const jobId = envelope(result)['jobId'] as string;
    // The background run is fire-and-forget; let the microtask queue drain.
    await new Promise((r) => setImmediate(r));
    const record = readJobResult(jobId);
    expect(record?.status).toBe('complete');
  });

  // #4363 caller audit. `toolSuccessStructured` nests the payload under
  // `structuredContent`, so a `success: false` run left the ToolResult's own
  // root clean — it slipped past both the caller and `runAsJob`'s root-key
  // fail-closed check, and the job recorded `complete` for a failed pipeline.
  describe('a failed pipeline is not a successful job (#4363)', () => {
    function failedRun(): typeof ORCHESTRATOR_RESULT {
      return {
        ...ORCHESTRATOR_RESULT,
        success: false,
        error: '1 stage(s) failed — plan: adapter rejected the request',
      };
    }

    it('returns a business error envelope on the sync path', async () => {
      runAdaptiveOrchestratorMock.mockResolvedValueOnce(failedRun());
      const handler = captureHandler();

      const result = await handler({ task: 'Build feature X' });

      expect(result.isError).toBe(true);
    });

    it('records the job failed on the async path', async () => {
      runAdaptiveOrchestratorMock.mockResolvedValueOnce(failedRun());
      const handler = captureHandler();

      const result = await handler({ task: 'Build feature X', dispatch: 'async' });
      const jobId = envelope(result)['jobId'] as string;
      await new Promise((r) => setImmediate(r));

      expect(readJobResult(jobId)?.status).toBe('failed');
    });

    it('still records a successful pipeline as complete', async () => {
      const handler = captureHandler();

      const result = await handler({ task: 'Build feature X', dispatch: 'async' });
      const jobId = envelope(result)['jobId'] as string;
      await new Promise((r) => setImmediate(r));

      expect(readJobResult(jobId)?.status).toBe('complete');
    });
  });
});

// #4170: simulateVotes must FAIL CLOSED outside test runners. The old guard
// only logged a warning and proceeded — a random panel could resolve
// outcome:'approved' with zero live voters. Outside a test runner the handler
// now rejects with a `permission` envelope unless NEXUS_ALLOW_SIMULATE=1.
// The estimate-relative budget (#3262) is gated behind NEXUS_BUDGET_ENFORCE.
// The gate read the literal `1` only, so `true` — the spelling every other
// boolean flag accepts — left the run silently unenforced (#5155). The
// observable is the logger: `resolveRunBudget` logs "token budget enforced"
// (or the no-estimate warn) only when enforcement is on.
describe('run budget gate NEXUS_BUDGET_ENFORCE (#3262, #5155)', () => {
  const originalEnforce = process.env['NEXUS_BUDGET_ENFORCE'];

  afterEach(() => {
    if (originalEnforce === undefined) delete process.env['NEXUS_BUDGET_ENFORCE'];
    else process.env['NEXUS_BUDGET_ENFORCE'] = originalEnforce;
    runAdaptiveOrchestratorMock.mockClear();
  });

  function makeLogger(): ILogger & { info: ReturnType<typeof vi.fn> } {
    return {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as unknown as ILogger & { info: ReturnType<typeof vi.fn> };
  }

  function budgetEnforced(logger: { info: ReturnType<typeof vi.fn> }): boolean {
    return logger.info.mock.calls.some((call) => String(call[0]).includes('token budget enforced'));
  }

  it('enforces when NEXUS_BUDGET_ENFORCE=true (was silently unenforced)', async () => {
    process.env['NEXUS_BUDGET_ENFORCE'] = 'true';
    const logger = makeLogger();
    await runPipelineForGoal('Build a login form with validation and tests', logger);
    expect(budgetEnforced(logger)).toBe(true);
  });

  it('still enforces for the original spelling NEXUS_BUDGET_ENFORCE=1', async () => {
    process.env['NEXUS_BUDGET_ENFORCE'] = '1';
    const logger = makeLogger();
    await runPipelineForGoal('Build a login form with validation and tests', logger);
    expect(budgetEnforced(logger)).toBe(true);
  });

  it('does not enforce when unset (default off — existing runs unchanged)', async () => {
    delete process.env['NEXUS_BUDGET_ENFORCE'];
    const logger = makeLogger();
    await runPipelineForGoal('Build a login form with validation and tests', logger);
    expect(budgetEnforced(logger)).toBe(false);
  });
});

describe('run_pipeline simulateVotes fail-closed gate (#4170)', () => {
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
    const result = await handler({ task: 'Build feature X', simulateVotes: true });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('NEXUS_ALLOW_SIMULATE');
    const meta = (result as { _meta?: Record<string, unknown> })._meta;
    const envelope = meta?.[ERROR_ENVELOPE_META_KEY] as { errorCategory: string };
    expect(envelope.errorCategory).toBe('permission');
  });

  it('rejects identically in async dispatch mode — no pending envelope leaks out', async () => {
    const handler = captureHandler();
    leaveTestRunnerEnv();
    const result = await handler({
      task: 'Build feature X',
      simulateVotes: true,
      dispatch: 'async',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('NEXUS_ALLOW_SIMULATE');
  });

  it('proceeds with simulated: true in the output when NEXUS_ALLOW_SIMULATE=1', async () => {
    const handler = captureHandler();
    leaveTestRunnerEnv();
    process.env['NEXUS_ALLOW_SIMULATE'] = '1';
    const result = await handler({ task: 'Build feature X', simulateVotes: true });
    expect(result.isError).not.toBe(true);
    const output = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(output['simulated']).toBe(true);
  });

  it('stays allowed inside a test runner with no simulated flag (existing suites unaffected)', async () => {
    // Default vitest env: VITEST=true.
    const result = await captureHandler()({ task: 'Build feature X', simulateVotes: true });
    expect(result.isError).not.toBe(true);
    const output = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(output['simulated']).toBeUndefined();
  });
});

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
