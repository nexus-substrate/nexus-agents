/**
 * Seam test: `cancel_job` stops an in-flight async `orchestrate` (#6305).
 *
 * The chain is runner arity → tool `run:` closure → `runOrchestratePipelineAsJob`
 * → `runOrchestratePipeline`'s stage-boundary gates. The runner's
 * `signalAccepted` record follows the closure's arity alone, so it stays green
 * if a middle link drops the signal. This file drives the REAL registered
 * handler, the REAL orchestrate pipeline and the REAL `cancel_job` handler,
 * with a fake memory read, a fake worker dispatch and a fake orchestrator that
 * count calls, and asserts that no stage runs after the cancel lands — not
 * merely that the record says `cancelled`.
 *
 * @module mcp/tools/orchestrate-cancel-seam.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { UnifiedContext } from '../../context/context-retriever.js';
import type { WorkerDispatchResult } from './orchestrate-dispatch.js';

const stageCalls: string[] = [];

/** One parking gate per stage the test can hold open. */
interface Park {
  readonly started: Promise<void>;
  readonly release: () => void;
  readonly wait: () => Promise<void>;
}

function makePark(): Park {
  let started: () => void = () => undefined;
  let release: () => void = () => undefined;
  const startedP = new Promise<void>((r) => {
    started = r;
  });
  const gate = new Promise<void>((r) => {
    release = r;
  });
  return {
    started: startedP,
    release,
    wait: async () => {
      started();
      await gate;
    },
  };
}

let memoryPark: Park | undefined;
let dispatchPark: Park | undefined;

vi.mock('../../context/context-retriever.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../context/context-retriever.js')>();
  return {
    ...actual,
    getContextForTask: async (): Promise<UnifiedContext> => {
      stageCalls.push('memory');
      if (memoryPark !== undefined) await memoryPark.wait();
      return {
        beliefs: [],
        similarMemories: [],
        recentLearnings: [],
        experiencePatterns: [],
      } as unknown as UnifiedContext;
    },
  };
});

vi.mock('./orchestrate-dispatch.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./orchestrate-dispatch.js')>()),
  isWorkerDispatchEnabled: () => true,
  executeWorkerDispatch: async (): Promise<WorkerDispatchResult> => {
    stageCalls.push('dispatch');
    if (dispatchPark !== undefined) await dispatchPark.wait();
    return {
      results: [],
      totalWorkers: 0,
      successCount: 0,
      errorCount: 0,
      durationMs: 0,
      conflicts: [],
      totalModelCalls: 0,
    };
  },
}));

// The reflection call spends a model call on the dummy adapter; keep it inert.
vi.mock('./orchestrate-reflection.js', () => ({
  generateReflection: () => Promise.resolve(undefined),
}));

import {
  registerOrchestrateTool,
  runOrchestrateInBackground,
  createMockOrchestrator,
  type OrchestrateDeps,
} from './orchestrate.js';
import { NOOP_NOTIFIER } from '../mcp-notifier.js';
import { createLogger } from '../../core/index.js';
import { registerCancelJobTool } from './cancel-job-tool.js';
import { RateLimiter } from '../middleware/index.js';
import { readJobResult, writeJobPending } from '../jobs/job-result-store.js';
import { _resetForTests as resetJobConcurrency, getInFlight } from '../jobs/job-concurrency.js';
import { resetNexusDataDirCache } from '../../config/nexus-data-dir.js';
import type { IModelAdapter } from '../../core/index.js';
import type { IOrchestrator } from '../../core/types/orchestrator.js';

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

const rateLimiter = (): RateLimiter =>
  new RateLimiter({ capacity: 1000, refillRate: 1000, refillIntervalMs: 1000 });

/** A task loaded with high-complexity keywords so neither the fast path nor the planner skips. */
const COMPLEX_TASK =
  'Refactor the distributed authentication architecture to optimize security ' +
  'and performance under concurrent load, analyze the trade-off decisions, ' +
  'and migrate the legacy session services.';

/** The real mock orchestrator, with each `execute` counted as the final stage. */
function countingOrchestrator(): IOrchestrator {
  const inner = createMockOrchestrator();
  return {
    ...inner,
    getStatus: inner.getStatus.bind(inner),
    cancel: inner.cancel.bind(inner),
    execute: (definition, inputs, options) => {
      stageCalls.push('orchestrator');
      return inner.execute(definition, inputs, options);
    },
  };
}

function orchestrateDeps(): OrchestrateDeps {
  return {
    orchestrator: countingOrchestrator(),
    // Only its presence matters: worker dispatch is gated on an adapter.
    modelAdapter: {} as IModelAdapter,
    rateLimiter: rateLimiter(),
  };
}

function handlers(): { orchestrate: ToolHandler; cancel: ToolHandler } {
  const orchestrate = captureHandler((s) => {
    registerOrchestrateTool(s, orchestrateDeps());
  });
  const cancel = captureHandler((s) => {
    registerCancelJobTool(s, { rateLimiter: rateLimiter() });
  });
  return { orchestrate, cancel };
}

async function startJob(orchestrate: ToolHandler): Promise<string> {
  const env = JSON.parse(
    (await orchestrate({ task: COMPLEX_TASK, dispatch: 'async' })).content[0]!.text
  ) as Record<string, unknown>;
  expect(env['status']).toBe('pending');
  return env['jobId'] as string;
}

async function cancelJob(cancel: ToolHandler, jobId: string): Promise<void> {
  const out = JSON.parse((await cancel({ jobId })).content[0]!.text) as Record<string, unknown>;
  expect(out['outcome']).toBe('cancelled');
}

async function settle(): Promise<void> {
  for (let i = 0; i < 500 && getInFlight('orchestrate') > 0; i++) {
    await new Promise((r) => setTimeout(r, 5));
  }
  if (getInFlight('orchestrate') > 0) throw new Error('orchestrate job never settled');
}

describe('cancel_job interrupts an in-flight orchestrate (#6305)', () => {
  let tmpDir: string;
  const saved = {
    data: process.env['NEXUS_DATA_DIR'],
    aorchestra: process.env['NEXUS_AORCHESTRA'],
  };

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'nexus-orch-cancel-'));
    process.env['NEXUS_DATA_DIR'] = tmpDir;
    // The agent plan is what worker dispatch runs over; force the default on.
    process.env['NEXUS_AORCHESTRA'] = '1';
    resetNexusDataDirCache();
    resetJobConcurrency();
    stageCalls.length = 0;
    memoryPark = undefined;
    dispatchPark = undefined;
  });

  afterEach(() => {
    if (saved.data === undefined) delete process.env['NEXUS_DATA_DIR'];
    else process.env['NEXUS_DATA_DIR'] = saved.data;
    if (saved.aorchestra === undefined) delete process.env['NEXUS_AORCHESTRA'];
    else process.env['NEXUS_AORCHESTRA'] = saved.aorchestra;
    resetNexusDataDirCache();
    resetJobConcurrency();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('a cancel during the memory read stops before worker dispatch', async () => {
    memoryPark = makePark();
    const { orchestrate, cancel } = handlers();
    const jobId = await startJob(orchestrate);
    // The runner takes the signal; the rest of this test proves something reads it.
    expect(readJobResult(jobId)?.signalAccepted).toBe(true);

    await memoryPark.started;
    await cancelJob(cancel, jobId);
    memoryPark.release();
    await settle();

    expect(stageCalls).toEqual(['memory']);
    expect(readJobResult(jobId)?.status).toBe('cancelled');
  });

  it('a cancel during worker dispatch stops before the orchestrator runs', async () => {
    dispatchPark = makePark();
    const { orchestrate, cancel } = handlers();
    const jobId = await startJob(orchestrate);

    await dispatchPark.started;
    expect(stageCalls).toEqual(['memory', 'dispatch']);
    await cancelJob(cancel, jobId);
    dispatchPark.release();
    await settle();

    // Without the boundary gate the orchestrator runs after dispatch returns.
    expect(stageCalls).toEqual(['memory', 'dispatch']);
    expect(readJobResult(jobId)?.status).toBe('cancelled');
  });

  it('the runJobInBackground re-entry threads the signal too', async () => {
    memoryPark = makePark();
    const { cancel } = handlers();
    const jobId = 'orch-reentry-cancel';
    // What `runAsJob` writes before it starts the runner.
    writeJobPending(jobId, 'orchestrate');
    const done = runOrchestrateInBackground(jobId, {
      input: { task: COMPLEX_TASK, maxIterations: 10 },
      deps: orchestrateDeps(),
      notifier: NOOP_NOTIFIER,
      logger: createLogger({ component: 'test-orch-cancel' }),
    });

    await memoryPark.started;
    await cancelJob(cancel, jobId);
    memoryPark.release();
    await done;

    expect(stageCalls).toEqual(['memory']);
    expect(readJobResult(jobId)?.status).toBe('cancelled');
  });

  it('runs every stage when nothing cancels — the empty case', async () => {
    const { orchestrate } = handlers();
    const jobId = await startJob(orchestrate);
    await settle();

    expect(stageCalls).toEqual(['memory', 'dispatch', 'orchestrator']);
    expect(readJobResult(jobId)?.status).toBe('complete');
  });
});
