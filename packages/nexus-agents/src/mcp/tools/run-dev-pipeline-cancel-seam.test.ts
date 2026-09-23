/**
 * Seam test: `cancel_job` stops an in-flight async `run_dev_pipeline` (#6305).
 *
 * The chain is runner arity → tool `run:` closure → `DevPipelineOptions.signal`
 * → the engine's stage-boundary gate. The runner's `signalAccepted` record
 * follows the closure's arity alone, so it stays green if the tool drops the
 * signal before the engine. This file drives the REAL registered handler, the
 * REAL `runDevPipeline` and the REAL `cancel_job` handler, with fake stages
 * that count calls, and asserts that no stage runs after the cancel lands —
 * not merely that the record says `cancelled`.
 *
 * @module mcp/tools/run-dev-pipeline-cancel-seam.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DevPipelineStages } from '../../pipeline/dev-pipeline.js';
import { researchContextFromText } from '../../pipeline/research-context.js';

const stageCalls: string[] = [];
let fakeStages: DevPipelineStages | undefined;

vi.mock('../../pipeline/agent-executor.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../pipeline/agent-executor.js')>()),
  createAgentStages: () => {
    if (fakeStages === undefined) throw new Error('fake stages not installed');
    return fakeStages;
  },
}));

import { registerDevPipelineTool } from './dev-pipeline-tool.js';
import { registerCancelJobTool } from './cancel-job-tool.js';
import { RateLimiter } from '../middleware/index.js';
import { readJobResult } from '../jobs/job-result-store.js';
import { _resetForTests as resetJobConcurrency, getInFlight } from '../jobs/job-concurrency.js';
import { resetNexusDataDirCache } from '../../config/nexus-data-dir.js';

type ToolResponse = { content: Array<{ type: 'text'; text: string }> };
type ToolHandler = (args: unknown) => Promise<ToolResponse>;

function captureHandler(register: (server: never) => void): ToolHandler {
  let handler: ToolHandler | undefined;
  register({
    registerTool(_name: string, _config: unknown, cb: ToolHandler): void {
      handler = cb;
    },
  } as never);
  if (handler === undefined) throw new Error('handler not registered');
  return handler;
}

const deps = (): { rateLimiter: RateLimiter } => ({
  rateLimiter: new RateLimiter({ capacity: 1000, refillRate: 1000, refillIntervalMs: 1000 }),
});

/**
 * Stages that record every call. `research` — the first stage — parks until
 * the test releases it: the window in which the cancel lands mid-run.
 */
function installCountingStages(): { researchStarted: Promise<void>; release: () => void } {
  let started: () => void = () => undefined;
  let release: () => void = () => undefined;
  const researchStarted = new Promise<void>((r) => {
    started = r;
  });
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const record = (name: string): void => {
    stageCalls.push(name);
  };
  fakeStages = {
    research: async () => {
      record('research');
      started();
      await gate;
      return researchContextFromText('research notes');
    },
    plan: () => {
      record('plan');
      return Promise.resolve('1. do the thing');
    },
    vote: () => {
      record('vote');
      return Promise.resolve({ kind: 'approved', approvalPercentage: 100 } as never);
    },
    decompose: () => {
      record('decompose');
      return Promise.resolve([
        { id: 't1', title: 'T1', description: 'd', assignedTo: 'coder', status: 'pending' },
      ] as never);
    },
    implement: () => {
      record('implement');
      return Promise.resolve('impl');
    },
    qaReview: () => {
      record('qaReview');
      return Promise.resolve({ verdict: 'pass', feedback: 'ok', issues: [] } as never);
    },
    securityScan: () => {
      record('securityScan');
      return Promise.resolve({ passed: true, verdict: 'pass', feedback: 'ok' } as const);
    },
  };
  return { researchStarted, release };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 500 && getInFlight('run_dev_pipeline') > 0; i++) {
    await new Promise((r) => setTimeout(r, 5));
  }
  if (getInFlight('run_dev_pipeline') > 0) throw new Error('run_dev_pipeline job never settled');
}

describe('cancel_job interrupts an in-flight run_dev_pipeline (#6305)', () => {
  let tmpDir: string;
  const originalDataDir = process.env['NEXUS_DATA_DIR'];

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'nexus-dp-cancel-'));
    process.env['NEXUS_DATA_DIR'] = tmpDir;
    resetNexusDataDirCache();
    resetJobConcurrency();
    stageCalls.length = 0;
    fakeStages = undefined;
  });

  afterEach(() => {
    if (originalDataDir === undefined) delete process.env['NEXUS_DATA_DIR'];
    else process.env['NEXUS_DATA_DIR'] = originalDataDir;
    resetNexusDataDirCache();
    resetJobConcurrency();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('runs no stage after the cancel lands', async () => {
    const fake = installCountingStages();
    const pipeline = captureHandler((s) => {
      registerDevPipelineTool(s, deps());
    });
    const cancel = captureHandler((s) => {
      registerCancelJobTool(s, deps());
    });

    const env = JSON.parse(
      (await pipeline({ task: 'Implement a helper function', dispatch: 'async' })).content[0]!.text
    ) as Record<string, unknown>;
    expect(env['status']).toBe('pending');
    const jobId = env['jobId'] as string;
    // The runner takes the signal; the rest of this test proves something reads it.
    expect(readJobResult(jobId)?.signalAccepted).toBe(true);

    await fake.researchStarted;
    expect(stageCalls).toEqual(['research']);

    const cancelled = JSON.parse((await cancel({ jobId })).content[0]!.text) as Record<
      string,
      unknown
    >;
    expect(cancelled['outcome']).toBe('cancelled');

    fake.release();
    await settle();

    // Without the boundary gate, plan → vote → decompose → implement →
    // qaReview → securityScan all run after research returns.
    expect(stageCalls).toEqual(['research']);
    expect(readJobResult(jobId)?.status).toBe('cancelled');
  });

  it('runs every stage when nothing cancels — the empty case', async () => {
    const fake = installCountingStages();
    fake.release();
    const pipeline = captureHandler((s) => {
      registerDevPipelineTool(s, deps());
    });

    const env = JSON.parse(
      (await pipeline({ task: 'Implement a helper function', dispatch: 'async' })).content[0]!.text
    ) as Record<string, unknown>;
    const jobId = env['jobId'] as string;
    await settle();

    expect(stageCalls).toEqual([
      'research',
      'plan',
      'vote',
      'decompose',
      'implement',
      'qaReview',
      'securityScan',
    ]);
    expect(readJobResult(jobId)?.status).toBe('complete');
  });
});
