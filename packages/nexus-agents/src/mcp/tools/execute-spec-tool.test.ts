/**
 * Tests for execute_spec MCP tool.
 *
 * (Source: Issue #853 — Phase 5 of AI Software Factory Epic #843)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { outcomeAppendMock, recordErrorMock, recordLearningMock, recordTaskMock } = vi.hoisted(
  () => ({
    outcomeAppendMock: vi.fn(),
    recordErrorMock: vi.fn(),
    recordLearningMock: vi.fn(),
    recordTaskMock: vi.fn(),
  })
);

// Pass-through the secure-handler / timeout chain so the registered callback is
// the bare handler — lets the tests invoke it directly (mirrors run_pipeline).
vi.mock('../middleware/tool-wrapper.js', () => ({
  wrapToolWithTimeout: (_name: string, fn: unknown) => fn,
  toSdkCallback: (fn: unknown) => fn,
  getToolTimeout: () => 900_000,
}));
vi.mock('../middleware/secure-handler.js', () => ({
  createSecureHandler: (fn: unknown) => fn,
}));
vi.mock('./tool-memory.js', () => ({
  getToolMemory: () => ({
    recordError: recordErrorMock,
    recordLearning: recordLearningMock,
    recordTask: recordTaskMock,
  }),
}));
vi.mock('../../orchestration/outcomes/index.js', () => ({
  categorizeOutcomeErrorMessage: () => 'unknown',
  getOutcomeStore: () => ({ append: outcomeAppendMock }),
}));

// #3732: stub the spec executor so the async background run resolves fast and
// deterministically (no live adapters in unit tests).
const EXECUTE_SPEC_RESULT = {
  ok: true as const,
  value: {
    validation: { satisfaction: 1, allMet: true },
  },
};
const executeSpecMock = vi.fn(() => Promise.resolve(EXECUTE_SPEC_RESULT));
vi.mock('../../orchestration/spec-executor.js', () => ({
  executeSpec: () => executeSpecMock(),
}));
vi.mock('../../orchestration/failure-analyzer.js', () => ({
  analyzeFailures: () => ({ ok: true, value: { passed: true } }),
}));

import { ExecuteSpecInputSchema, registerExecuteSpecTool } from './execute-spec-tool.js';
import { readJobResult } from '../jobs/job-result-store.js';
import { _resetForTests as resetJobConcurrency } from '../jobs/job-concurrency.js';
import { resetNexusDataDirCache } from '../../config/nexus-data-dir.js';

// ============================================================================
// Schema Validation
// ============================================================================

describe('ExecuteSpecInputSchema', () => {
  it('accepts valid spec input', () => {
    const result = ExecuteSpecInputSchema.safeParse({
      spec: '# Feature\n\n## Requirements\n- Build it',
    });
    expect(result.success).toBe(true);
  });

  it('accepts spec with dryRun flag', () => {
    const result = ExecuteSpecInputSchema.safeParse({
      spec: '# Feature',
      dryRun: true,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.dryRun).toBe(true);
  });

  it('defaults dryRun to false', () => {
    const result = ExecuteSpecInputSchema.safeParse({
      spec: '# Feature',
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.dryRun).toBe(false);
  });

  it('rejects empty spec', () => {
    const result = ExecuteSpecInputSchema.safeParse({ spec: '' });
    expect(result.success).toBe(false);
  });

  it('rejects missing spec', () => {
    const result = ExecuteSpecInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects spec exceeding max length', () => {
    const result = ExecuteSpecInputSchema.safeParse({
      spec: 'x'.repeat(50_001),
    });
    expect(result.success).toBe(false);
  });

  it('defaults dispatch to sync and accepts async (#3732)', () => {
    expect(ExecuteSpecInputSchema.parse({ spec: '# Feature' }).dispatch).toBe('sync');
    expect(ExecuteSpecInputSchema.parse({ spec: '# Feature', dispatch: 'async' }).dispatch).toBe(
      'async'
    );
    expect(() => ExecuteSpecInputSchema.parse({ spec: '# Feature', dispatch: 'bogus' })).toThrow();
  });
});

// ============================================================================
// Async dispatch (#3732)
// ============================================================================

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
  registerExecuteSpecTool(mockServer as never, {
    rateLimiter: { tryConsume: () => ({ allowed: true, remaining: 99 }) } as never,
  });
  expect(registeredName).toBe('execute_spec');
  if (captured === undefined) throw new Error('handler not registered');
  return captured;
}

describe('execute_spec result recording (#5530)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    executeSpecMock.mockResolvedValue(EXECUTE_SPEC_RESULT);
  });

  it('records unmet acceptance criteria as failure without success learning', async () => {
    executeSpecMock.mockResolvedValueOnce({
      ok: true,
      value: { validation: { satisfaction: 0.5, allMet: false } },
    });

    await captureHandler()({ spec: '# Feature\n\n## Requirements\n- x' });

    expect(outcomeAppendMock).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    expect(recordLearningMock).not.toHaveBeenCalled();
    expect(recordTaskMock).not.toHaveBeenCalled();
    expect(recordErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('acceptance criteria unmet') })
    );
  });

  it('preserves successful outcome and learning when all criteria are met', async () => {
    await captureHandler()({ spec: '# Feature\n\n## Requirements\n- x' });

    expect(outcomeAppendMock).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(recordLearningMock).toHaveBeenCalledWith(
      expect.objectContaining({ pattern: 'spec_execution → satisfaction=1' })
    );
    expect(recordTaskMock).toHaveBeenCalledOnce();
    expect(recordErrorMock).not.toHaveBeenCalled();
  });
});

// #3732: `dispatch: 'async'` returns a jobId immediately and runs the full spec
// DAG pipeline in the background (poll get_job_result). execute_spec has no
// sessionId, so a fresh `es-<uuid>` jobId is always minted.
describe('execute_spec async dispatch (#3732)', () => {
  let tmpDir: string;
  const originalDataDir = process.env['NEXUS_DATA_DIR'];

  function envelope(result: CapturedToolResult): Record<string, unknown> {
    return JSON.parse(result.content[0]!.text) as Record<string, unknown>;
  }

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'nexus-es-async-'));
    process.env['NEXUS_DATA_DIR'] = tmpDir;
    resetNexusDataDirCache();
    resetJobConcurrency();
    executeSpecMock.mockClear();
  });

  afterEach(() => {
    if (originalDataDir === undefined) delete process.env['NEXUS_DATA_DIR'];
    else process.env['NEXUS_DATA_DIR'] = originalDataDir;
    resetNexusDataDirCache();
    resetJobConcurrency();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns { status: 'pending', jobId } and mints an es-<uuid> id", async () => {
    const handler = captureHandler();
    const result = await handler({ spec: '# Feature\n\n## Requirements\n- x', dispatch: 'async' });
    const env = envelope(result);
    expect(env['status']).toBe('pending');
    expect(typeof env['jobId']).toBe('string');
    expect(env['jobId'] as string).toMatch(/^es-/);
    expect(env['pollTool']).toBe('get_job_result');
  });

  it('runs the pipeline inline (sync) by default — no pending envelope', async () => {
    const handler = captureHandler();
    const result = await handler({ spec: '# Feature\n\n## Requirements\n- x' });
    expect(envelope(result)['status']).toBeUndefined();
    expect(executeSpecMock).toHaveBeenCalledTimes(1);
  });

  it('records the result to the sidecar when the background run completes', async () => {
    const handler = captureHandler();
    const result = await handler({ spec: '# Feature\n\n## Requirements\n- x', dispatch: 'async' });
    const jobId = envelope(result)['jobId'] as string;
    // The background run is fire-and-forget; let the microtask queue drain.
    await new Promise((r) => setImmediate(r));
    const record = readJobResult(jobId);
    expect(record?.status).toBe('complete');
  });
});
