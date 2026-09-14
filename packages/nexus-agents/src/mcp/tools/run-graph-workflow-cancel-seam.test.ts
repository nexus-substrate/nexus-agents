/**
 * Seam test: `cancel_job`'s signal reaches `executeGraph` from an async
 * `run_graph_workflow` dispatch (#5393).
 *
 * The executor's own super-step gate is covered in `graph-executor.test.ts`
 * ("respects abort signal") and the runner's `signalAccepted` record follows
 * its arity — both stay green if the tool drops the signal between them.
 * Asserted on what the executor RECEIVED, and on the sync path passing no
 * signal key at all (the empty case).
 *
 * @module mcp/tools/run-graph-workflow-cancel-seam.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const executeGraphMock = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('../../orchestration/graph/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../orchestration/graph/index.js')>()),
  executeGraph: (...args: unknown[]) => executeGraphMock(...args),
}));

import { registerRunGraphWorkflowTool } from './run-graph-workflow.js';
import { RateLimiter } from '../middleware/index.js';
import { readJobResult } from '../jobs/job-result-store.js';
import { _resetForTests as resetJobConcurrency } from '../jobs/job-concurrency.js';
import { resetNexusDataDirCache } from '../../config/nexus-data-dir.js';

type ToolResponse = { content: Array<{ type: 'text'; text: string }> };
type ToolHandler = (args: unknown) => Promise<ToolResponse>;

function captureHandler(): ToolHandler {
  let handler: ToolHandler | undefined;
  registerRunGraphWorkflowTool(
    {
      registerTool(_name: string, _config: unknown, cb: ToolHandler): void {
        handler = cb;
      },
    } as never,
    { rateLimiter: new RateLimiter({ capacity: 1000, refillRate: 1000, refillIntervalMs: 1000 }) }
  );
  if (handler === undefined) throw new Error('handler not registered');
  return handler;
}

function executorOptions(): Record<string, unknown> {
  const call = executeGraphMock.mock.calls[0];
  if (call === undefined) throw new Error('executeGraph was not called');
  return call[2] as Record<string, unknown>;
}

describe('run_graph_workflow hands cancel_job’s signal to the executor (#5393)', () => {
  let tmpDir: string;
  const originalDataDir = process.env['NEXUS_DATA_DIR'];

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'nexus-gw-cancel-'));
    process.env['NEXUS_DATA_DIR'] = tmpDir;
    resetNexusDataDirCache();
    resetJobConcurrency();
    executeGraphMock.mockReset();
    executeGraphMock.mockResolvedValue({
      ok: true,
      value: { finalState: {}, stepsExecuted: 1, nodeResults: [] },
    });
  });

  afterEach(async () => {
    await new Promise((r) => setImmediate(r));
    if (originalDataDir === undefined) delete process.env['NEXUS_DATA_DIR'];
    else process.env['NEXUS_DATA_DIR'] = originalDataDir;
    resetNexusDataDirCache();
    resetJobConcurrency();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('async dispatch: the executor receives an AbortSignal and the record says so', async () => {
    // Park the executor so the job is still PENDING when the record is read —
    // `signalAccepted` lives on the pending record, where it is actionable.
    let release: () => void = () => undefined;
    const parked = new Promise<void>((r) => {
      release = r;
    });
    executeGraphMock.mockImplementation(async () => {
      await parked;
      return { ok: true, value: { finalState: {}, stepsExecuted: 1, nodeResults: [] } };
    });

    const response = await captureHandler()({
      workflow: 'echo',
      inputs: { input: 'hi' },
      dispatch: 'async',
    });
    const jobId = (JSON.parse(response.content[0]!.text) as { jobId: string }).jobId;
    expect(readJobResult(jobId)?.signalAccepted).toBe(true);

    await new Promise((r) => setImmediate(r));
    expect(executorOptions()['signal']).toBeInstanceOf(AbortSignal);
    release();
  });

  it('sync path: no signal key reaches the executor — the empty case', async () => {
    await captureHandler()({ workflow: 'echo', inputs: { input: 'hi' } });
    expect('signal' in executorOptions()).toBe(false);
  });
});
