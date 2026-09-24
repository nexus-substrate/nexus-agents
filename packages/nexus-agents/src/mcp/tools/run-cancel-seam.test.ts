/**
 * Seam test: `cancel_job` stops an in-flight async `run { execute: true }` (#6305).
 *
 * The chain is runner arity → tool `run:` closure → `executeRunBodyOrThrow` →
 * `executeGoal` → the default strategy executor → the engine's own boundary
 * gate. The runner's `signalAccepted` record follows the closure's arity
 * alone, so it stays green if any middle link drops the signal. The seam
 * tests drive the REAL registered `run` handler, the REAL MetaDispatcher and
 * engines and the REAL `cancel_job` handler, with fake agent stages that
 * count calls, and assert that no stage runs after the cancel lands — not
 * merely that the record says `cancelled`. The consensus executor and the
 * pre-dispatch gate are pinned directly below them.
 *
 * @module mcp/tools/run-cancel-seam.test
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

const consensusSpy = vi.fn();
vi.mock('./consensus-vote.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./consensus-vote.js')>()),
  runConsensusForGoal: (...args: unknown[]): unknown => consensusSpy(...args),
}));

import { registerRunTool, buildDefaultExecutors, executeGoal } from './run-tool.js';
import { registerCancelJobTool } from './cancel-job-tool.js';
import { RateLimiter } from '../middleware/index.js';
import { readJobResult } from '../jobs/job-result-store.js';
import { _resetForTests as resetJobConcurrency, getInFlight } from '../jobs/job-concurrency.js';
import { resetNexusDataDirCache } from '../../config/nexus-data-dir.js';
import type { MetaDecision, MetaOrchestratorInput } from '../../orchestration/meta-orchestrator.js';

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
 * Stages that record every call. `research` — the first stage in both
 * engines — parks until the test releases it: the window in which the cancel
 * lands mid-run.
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

const ALL_STAGES = [
  'research',
  'plan',
  'vote',
  'decompose',
  'implement',
  'qaReview',
  'securityScan',
];

async function settle(): Promise<void> {
  for (let i = 0; i < 500 && getInFlight('run') > 0; i++) {
    await new Promise((r) => setTimeout(r, 5));
  }
  if (getInFlight('run') > 0) throw new Error('run job never settled');
}

type SeamStrategy = 'dev-pipeline' | 'pipeline' | 'research';

async function startRun(strategy: SeamStrategy): Promise<string> {
  const run = captureHandler((s) => {
    registerRunTool(s, deps());
  });
  const env = JSON.parse(
    (
      await run({
        goal: 'Implement a helper function',
        execute: true,
        forceStrategy: strategy,
        dispatch: 'async',
      })
    ).content[0]!.text
  ) as Record<string, unknown>;
  expect(env['status']).toBe('pending');
  return env['jobId'] as string;
}

describe('cancel_job interrupts an in-flight run (#6305)', () => {
  let tmpDir: string;
  const originalDataDir = process.env['NEXUS_DATA_DIR'];

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'nexus-run-cancel-'));
    process.env['NEXUS_DATA_DIR'] = tmpDir;
    resetNexusDataDirCache();
    resetJobConcurrency();
    stageCalls.length = 0;
    fakeStages = undefined;
    consensusSpy.mockReset();
  });

  afterEach(() => {
    if (originalDataDir === undefined) delete process.env['NEXUS_DATA_DIR'];
    else process.env['NEXUS_DATA_DIR'] = originalDataDir;
    resetNexusDataDirCache();
    resetJobConcurrency();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it.each(['dev-pipeline', 'pipeline', 'research'] as const)(
    'the %s strategy runs no stage after the cancel lands',
    async (strategy) => {
      const fake = installCountingStages();
      const cancel = captureHandler((s) => {
        registerCancelJobTool(s, deps());
      });
      const jobId = await startRun(strategy);
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

      // Without the engine's boundary gate, plan → … → securityScan all run.
      expect(stageCalls).toEqual(['research']);
      expect(readJobResult(jobId)?.status).toBe('cancelled');
    }
  );

  it.each(['dev-pipeline', 'pipeline', 'research'] as const)(
    'the %s strategy runs every stage when nothing cancels — the empty case',
    async (strategy) => {
      const fake = installCountingStages();
      fake.release();
      const jobId = await startRun(strategy);
      await settle();

      expect(stageCalls).toEqual(ALL_STAGES);
      expect(readJobResult(jobId)?.status).toBe('complete');
    }
  );
});

const DECISION = { strategy: 'consensus', decisionId: 'd-1' } as unknown as MetaDecision;
const META_INPUT = { goal: 'Should we ship it?' } as unknown as MetaOrchestratorInput;
const VERDICT = { decision: 'approved', votes: [] };

describe('run strategy executors and the dispatch gate (#6305)', () => {
  beforeEach(() => {
    consensusSpy.mockReset();
  });

  it('the consensus executor hands the signal to the vote and discards a post-cancel verdict', async () => {
    const controller = new AbortController();
    consensusSpy.mockImplementation(() => {
      // The vote stops launching seats and returns a verdict over the rest.
      controller.abort();
      return Promise.resolve(VERDICT);
    });
    const consensus = buildDefaultExecutors(
      undefined,
      undefined,
      undefined,
      undefined,
      controller.signal
    ).consensus;
    if (consensus === undefined) throw new Error('consensus executor not wired');

    await expect(consensus(DECISION, META_INPUT)).rejects.toThrow(
      'run cancelled during the consensus strategy'
    );
    expect(consensusSpy).toHaveBeenCalledTimes(1);
    expect(consensusSpy.mock.calls[0]?.[4]).toBe(controller.signal);
  });

  it('the consensus executor returns the verdict when nothing cancels — the empty case', async () => {
    consensusSpy.mockResolvedValue(VERDICT);
    const consensus = buildDefaultExecutors(
      undefined,
      undefined,
      undefined,
      undefined,
      new AbortController().signal
    ).consensus;
    if (consensus === undefined) throw new Error('consensus executor not wired');

    await expect(consensus(DECISION, META_INPUT)).resolves.toBe(VERDICT);
  });

  it('executeGoal refuses to dispatch once the signal has fired', async () => {
    const controller = new AbortController();
    controller.abort();
    const executor = vi.fn(() => Promise.resolve({ success: true }));

    await expect(
      executeGoal(
        { goal: 'Summarise the repo', execute: true, forceStrategy: 'pipeline' },
        { executors: { pipeline: executor }, signal: controller.signal }
      )
    ).rejects.toThrow('run cancelled before dispatching the pipeline strategy');
    expect(executor).not.toHaveBeenCalled();
  });
});
