/**
 * Seam test: `cancel_job` stops an in-flight async `execute_spec` (#6305).
 *
 * The chain is runner arity → tool `run:` closure → `createFullResponse` →
 * `executeSpec({ signal })` → the graph executor's super-step gate plus
 * `executeSpec`'s own boundary checks. The runner's `signalAccepted` record
 * follows the closure's arity alone, so it stays green if a middle link drops
 * the signal. This file drives the REAL registered handler, the REAL spec
 * executor and graph executor and the REAL `cancel_job` handler. The only
 * substitution is the node handler factory — the tool passes none, so it would
 * otherwise run dry-run placeholders — replaced with one whose handlers count
 * calls. It asserts that no node runs after the cancel lands.
 *
 * @module mcp/tools/execute-spec-cancel-seam.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { NodeHandlerFactory } from '../../orchestration/spec-pipeline-types.js';

const nodeCalls: string[] = [];
let countingFactory: NodeHandlerFactory | undefined;

vi.mock('../../orchestration/spec-pipeline.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../orchestration/spec-pipeline.js')>();
  return {
    ...real,
    compileSpecToGraph: (
      markdown: string,
      options?: Parameters<typeof real.compileSpecToGraph>[1]
    ): ReturnType<typeof real.compileSpecToGraph> => {
      if (countingFactory === undefined) throw new Error('counting factory not installed');
      return real.compileSpecToGraph(markdown, { ...options, handlerFactory: countingFactory });
    },
  };
});

vi.mock('./tool-memory.js', () => ({
  getToolMemory: () => ({
    recordTask: vi.fn(),
    recordLearning: vi.fn(),
    recordError: vi.fn(),
  }),
}));

import { registerExecuteSpecTool } from './execute-spec-tool.js';
import { registerCancelJobTool } from './cancel-job-tool.js';
import { RateLimiter } from '../middleware/index.js';
import { readJobResult } from '../jobs/job-result-store.js';
import { _resetForTests as resetJobConcurrency, getInFlight } from '../jobs/job-concurrency.js';
import { resetNexusDataDirCache } from '../../config/nexus-data-dir.js';

type ToolResponse = { content: Array<{ type: 'text'; text: string }> };
type ToolHandler = (args: unknown) => Promise<ToolResponse>;

function captureHandler(register: (server: McpServer) => void): ToolHandler {
  let handler: ToolHandler | undefined;
  register({
    registerTool(_name: string, _config: unknown, cb: ToolHandler): void {
      handler = cb;
    },
  } as unknown as McpServer);
  if (handler === undefined) throw new Error('handler not registered');
  return handler;
}

const deps = (): { rateLimiter: RateLimiter } => ({
  rateLimiter: new RateLimiter({ capacity: 1000, refillRate: 1000, refillIntervalMs: 1000 }),
});

/** One requirement and one criterion: `code-0`, then `test-0` in the next super-step. */
const SPEC = [
  '# Feature',
  '',
  '## Requirements',
  '- Build the helper',
  '',
  '## Acceptance Criteria',
  '- The helper works',
].join('\n');

/**
 * Handlers that record every call. The first node parks until the test
 * releases it: the window in which the cancel lands mid-run.
 */
function installCountingHandlers(): { firstStarted: Promise<void>; release: () => void } {
  let started: () => void = () => undefined;
  let release: () => void = () => undefined;
  const firstStarted = new Promise<void>((r) => {
    started = r;
  });
  const gate = new Promise<void>((r) => {
    release = r;
  });
  countingFactory = (node) => async () => {
    nodeCalls.push(node.id);
    if (nodeCalls.length === 1) {
      started();
      await gate;
    }
    return { results: [`${node.id}: The helper works`] };
  };
  return { firstStarted, release };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 500 && getInFlight('execute_spec') > 0; i++) {
    await new Promise((r) => setTimeout(r, 5));
  }
  if (getInFlight('execute_spec') > 0) throw new Error('execute_spec job never settled');
}

describe('cancel_job interrupts an in-flight execute_spec (#6305)', () => {
  let tmpDir: string;
  const originalDataDir = process.env['NEXUS_DATA_DIR'];

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'nexus-es-cancel-'));
    process.env['NEXUS_DATA_DIR'] = tmpDir;
    resetNexusDataDirCache();
    resetJobConcurrency();
    nodeCalls.length = 0;
    countingFactory = undefined;
  });

  afterEach(() => {
    if (originalDataDir === undefined) delete process.env['NEXUS_DATA_DIR'];
    else process.env['NEXUS_DATA_DIR'] = originalDataDir;
    resetNexusDataDirCache();
    resetJobConcurrency();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('runs no node after the cancel lands', async () => {
    const fake = installCountingHandlers();
    const spec = captureHandler((s) => {
      registerExecuteSpecTool(s, deps());
    });
    const cancel = captureHandler((s) => {
      registerCancelJobTool(s, deps());
    });

    const env = JSON.parse(
      (await spec({ spec: SPEC, dispatch: 'async' })).content[0]!.text
    ) as Record<string, unknown>;
    expect(env['status']).toBe('pending');
    const jobId = env['jobId'] as string;
    // The runner takes the signal; the rest of this test proves something reads it.
    expect(readJobResult(jobId)?.signalAccepted).toBe(true);

    await fake.firstStarted;
    expect(nodeCalls).toEqual(['code-0']);

    const cancelled = JSON.parse((await cancel({ jobId })).content[0]!.text) as Record<
      string,
      unknown
    >;
    expect(cancelled['outcome']).toBe('cancelled');

    fake.release();
    await settle();

    // Without the gate, `test-0` runs after `code-0` returns.
    expect(nodeCalls).toEqual(['code-0']);
    expect(readJobResult(jobId)?.status).toBe('cancelled');
  });

  it('runs every node when nothing cancels — the empty case', async () => {
    const fake = installCountingHandlers();
    fake.release();
    const spec = captureHandler((s) => {
      registerExecuteSpecTool(s, deps());
    });

    const env = JSON.parse(
      (await spec({ spec: SPEC, dispatch: 'async' })).content[0]!.text
    ) as Record<string, unknown>;
    const jobId = env['jobId'] as string;
    await settle();

    expect(nodeCalls).toEqual(['code-0', 'test-0']);
    expect(readJobResult(jobId)?.status).toBe('complete');
  });
});
