/**
 * Seam test: `cancel_job` interrupts an `orchestrate` job INSIDE worker
 * dispatch (#6680).
 *
 * `orchestrate-cancel-seam.test.ts` covers the stage boundaries with a fake
 * dispatch. This file keeps the REAL `executeWorkerDispatch`, the REAL wave
 * dispatcher and watchdog, and — for the subprocess case — the REAL
 * `CliToModelAdapter` over a real `SubprocessCliAdapter` spawning a fake
 * long-running CLI. Only the plan, the per-role routing and the memory read are
 * faked, so the signal has to cross every middle link to have any effect.
 *
 * @module mcp/tools/orchestrate-cancel-dispatch-seam.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { UnifiedContext } from '../../context/context-retriever.js';
import type { AgentPlan } from '../../orchestration/aorchestra/agent-planner.js';
import type {
  CompletionRequest,
  CompletionResponse,
  IModelAdapter,
  ModelError,
  Result,
} from '../../core/index.js';

vi.mock('../../context/context-retriever.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../context/context-retriever.js')>();
  return {
    ...actual,
    getContextForTask: (): Promise<UnifiedContext> =>
      Promise.resolve({
        beliefs: [],
        similarMemories: [],
        recentLearnings: [],
        experiencePatterns: [],
      } as unknown as UnifiedContext),
  };
});

// The reflection call spends a model call; keep it out of the call count.
vi.mock('./orchestrate-reflection.js', () => ({
  generateReflection: () => Promise.resolve(undefined),
}));

/** Two waves of one worker each, so "no further wave" is observable. */
const TWO_WAVE_PLAN: AgentPlan = {
  entries: [
    { role: 'architecture', subTask: 'WAVE-ONE', priority: 1, reasoning: 't', wave: 1 },
    { role: 'security', subTask: 'WAVE-TWO', priority: 2, reasoning: 't', wave: 2 },
  ],
  totalExperts: 2,
  taskType: 'architecture',
  complexity: 'complex',
  reasoning: 'test',
  suggestedWaveSize: 1,
} as unknown as AgentPlan;

vi.mock('./orchestrate-aorchestra.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./orchestrate-aorchestra.js')>()),
  computeAgentPlan: () => TWO_WAVE_PLAN,
}));

vi.mock('./orchestrate-dispatch.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./orchestrate-dispatch.js')>()),
  isWorkerDispatchEnabled: () => true,
}));

// Per-role routing would reach the global registry; every worker uses the fallback.
vi.mock('./create-expert-routing.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./create-expert-routing.js')>()),
  resolveAdapterForRole: () => undefined,
}));

import {
  registerOrchestrateTool,
  createMockOrchestrator,
  type OrchestrateDeps,
} from './orchestrate.js';
import { registerCancelJobTool } from './cancel-job-tool.js';
import { RateLimiter } from '../middleware/index.js';
import { readJobResult } from '../jobs/job-result-store.js';
import { _resetForTests as resetJobConcurrency, getInFlight } from '../jobs/job-concurrency.js';
import { resetNexusDataDirCache } from '../../config/nexus-data-dir.js';
import { getOutcomeStore, resetOutcomeStore } from '../../orchestration/outcomes/index.js';
import { executeWorkerDispatch } from './orchestrate-dispatch.js';
import { createLogger } from '../../core/index.js';
import type { IOrchestrator } from '../../core/types/orchestrator.js';
import {
  SIGKILL_GRACE_MS,
  SubprocessCliAdapter,
  type CommandConfig,
} from '../../cli-adapters/subprocess-adapter.js';
import { CliToModelAdapter } from '../../cli-adapters/cli-to-model-adapter.js';
import type { CliTask, ICliResponseParser } from '../../cli-adapters/types.js';
import { ClaudeResponseParser } from '../../cli-adapters/parsers/claude-parser.js';

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

const COMPLEX_TASK =
  'Refactor the distributed authentication architecture to optimize security ' +
  'and performance under concurrent load, analyze the trade-off decisions, ' +
  'and migrate the legacy session services.';

/** What the orchestrator and every adapter call saw, in order. */
const calls: string[] = [];

function callLabel(request: CompletionRequest): string {
  const text = JSON.stringify(request.messages);
  if (text.includes('You are a synthesis agent')) return 'synthesis';
  if (text.includes('WAVE-TWO')) return 'wave-2';
  if (text.includes('WAVE-ONE')) return 'wave-1';
  return 'other';
}

/**
 * Both workers name the same file, so the dispatch sees a conflict and the
 * synthesis phase spends a real model call — which makes it countable.
 */
function textResponse(text: string): Result<CompletionResponse, ModelError> {
  return {
    ok: true,
    value: {
      content: [{ type: 'text', text: `${text}: edit src/shared/config.ts` }],
      stopReason: 'end_turn',
      model: 'fake-model',
    },
  };
}

interface Deferred {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
}

function deferred(): Deferred {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/**
 * A model adapter whose wave-1 call parks until released. `abortable` decides
 * whether that call honours `request.signal` (an SDK fetch) or ignores it.
 */
function parkingAdapter(opts: {
  readonly abortable: boolean;
  readonly started: Deferred;
  readonly release: Deferred;
  readonly sawAbort: { value: boolean };
}): IModelAdapter {
  return {
    providerId: 'fake',
    modelId: 'fake-model',
    capabilities: [],
    complete: async (request: CompletionRequest) => {
      const label = callLabel(request);
      calls.push(label);
      if (label !== 'wave-1') return textResponse(`${label} output`);
      opts.started.resolve();
      const signal = request.signal;
      if (opts.abortable && signal !== undefined) {
        await new Promise<void>((resolve) => {
          if (signal.aborted) resolve();
          signal.addEventListener(
            'abort',
            () => {
              resolve();
            },
            { once: true }
          );
          void opts.release.promise.then(resolve);
        });
        if (signal.aborted) {
          opts.sawAbort.value = true;
          return {
            ok: false,
            // An aborted HTTP request can surface as a connection reset, which
            // triage classes as transient — the case a retry would re-spend.
            error: { name: 'ModelError', message: 'socket hang up', code: 'CANCELLED' },
          } as unknown as Result<CompletionResponse, ModelError>;
        }
        return textResponse('wave-1 output');
      }
      await opts.release.promise;
      return textResponse('wave-1 output');
    },
    stream: () => {
      throw new Error('not used');
    },
    countTokens: () => Promise.resolve(0),
  } as unknown as IModelAdapter;
}

/** When set, the orchestrator run parks until released (it ignores any signal). */
let orchestratorPark: { started: Deferred; release: Deferred } | undefined;

function countingOrchestrator(): IOrchestrator {
  const inner = createMockOrchestrator();
  return {
    ...inner,
    getStatus: inner.getStatus.bind(inner),
    cancel: inner.cancel.bind(inner),
    execute: async (definition, inputs, options) => {
      calls.push('orchestrator');
      if (orchestratorPark !== undefined) {
        orchestratorPark.started.resolve();
        await orchestratorPark.release.promise;
      }
      return inner.execute(definition, inputs, options);
    },
  };
}

function orchestratorOutcomes(): number {
  return getOutcomeStore()
    .query()
    .filter((o) => o.model === 'orchestrator').length;
}

function handlers(modelAdapter: IModelAdapter): { orchestrate: ToolHandler; cancel: ToolHandler } {
  const deps: OrchestrateDeps = {
    orchestrator: countingOrchestrator(),
    modelAdapter,
    rateLimiter: rateLimiter(),
  };
  return {
    orchestrate: captureHandler((s) => {
      registerOrchestrateTool(s, deps);
    }),
    cancel: captureHandler((s) => {
      registerCancelJobTool(s, { rateLimiter: rateLimiter() });
    }),
  };
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
  for (let i = 0; i < 2000 && getInFlight('orchestrate') > 0; i++) {
    await new Promise((r) => setTimeout(r, 5));
  }
  if (getInFlight('orchestrate') > 0) throw new Error('orchestrate job never settled');
}

/** Only ESRCH proves a process is gone; EPERM means it exists but is not ours. */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: unknown) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

/** Every fake-CLI PID a test saw, SIGKILLed afterwards so a failing run leaks nothing. */
const spawnedPids: number[] = [];

function reapSpawned(): void {
  for (const pid of spawnedPids.splice(0)) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // Already gone.
    }
  }
}

function readPid(file: string): number {
  const pid = Number(readFileSync(file, 'utf8'));
  spawnedPids.push(pid);
  return pid;
}

async function waitFor(predicate: () => boolean, what: string, limitMs = 10_000): Promise<void> {
  const deadline = Date.now() + limitMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

/**
 * A subprocess CLI whose binary is `node` running a script that records its
 * PID and then idles forever — a CLI call that only a kill can end. With
 * `grandchild`, it first relaunches itself as a child the way gemini-cli does
 * and records that PID too. `ignore-sigterm` makes the grandchild ignore
 * SIGTERM and detach its stdio, so the CLI's `close` fires once the parent
 * dies while the grandchild runs on; only the SIGKILL escalation to the
 * descendants collected at SIGTERM time ends it.
 */
class LongRunningFakeCli extends SubprocessCliAdapter {
  override readonly name = 'claude' as const;
  readonly version = '1.0.0';
  protected override readonly transientRetry = { enabled: true };
  protected readonly parser: ICliResponseParser = new ClaudeResponseParser();
  spawnCount = 0;
  constructor(
    private readonly pidFile: string,
    private readonly grandchild?: {
      readonly pidFile: string;
      readonly mode: 'default' | 'ignore-sigterm';
    }
  ) {
    super();
  }
  protected getCommand(_task: CliTask): CommandConfig {
    this.spawnCount++;
    const idle = 'setInterval(() => {}, 1000);';
    const ignores = this.grandchild?.mode === 'ignore-sigterm';
    // The grandchild writes its own PID once its SIGTERM handler is installed,
    // so a test that waits for the file never signals it before it is ready.
    const relaunch =
      this.grandchild === undefined
        ? ''
        : `require('child_process').spawn(process.execPath, ['-e', ${JSON.stringify(
            (ignores ? "process.on('SIGTERM', () => {});" : '') +
              `require('fs').writeFileSync(${JSON.stringify(this.grandchild.pidFile)}, String(process.pid));` +
              idle
          )}], { stdio: ${ignores ? "'ignore'" : "'inherit'"} });`;
    const script =
      relaunch +
      `require('fs').writeFileSync(${JSON.stringify(this.pidFile)}, String(process.pid));` +
      idle;
    return { command: process.execPath, args: ['-e', script] };
  }
  override initialize(): Promise<void> {
    this.initialized = true;
    return Promise.resolve();
  }
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  getModelInfo() {
    return {
      id: 'fake-cli-model',
      name: 'Fake CLI Model',
      contextWindow: 100000,
      maxOutput: 10000,
      costPerMillionInput: 0,
      costPerMillionOutput: 0,
    };
  }
}

/** One spawn per call, so every PID the timeout test must see dead is recorded. */
class NoRetryFakeCli extends LongRunningFakeCli {
  protected override readonly transientRetry = { enabled: false };
}

describe('cancel_job interrupts orchestrate inside worker dispatch (#6680)', () => {
  let tmpDir: string;
  const saved = {
    data: process.env['NEXUS_DATA_DIR'],
    aorchestra: process.env['NEXUS_AORCHESTRA'],
  };

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'nexus-orch-cancel-dispatch-'));
    process.env['NEXUS_DATA_DIR'] = tmpDir;
    process.env['NEXUS_AORCHESTRA'] = '1';
    resetNexusDataDirCache();
    resetOutcomeStore();
    resetJobConcurrency();
    calls.length = 0;
    orchestratorPark = undefined;
  });

  afterEach(() => {
    reapSpawned();
    if (saved.data === undefined) delete process.env['NEXUS_DATA_DIR'];
    else process.env['NEXUS_DATA_DIR'] = saved.data;
    if (saved.aorchestra === undefined) delete process.env['NEXUS_AORCHESTRA'];
    else process.env['NEXUS_AORCHESTRA'] = saved.aorchestra;
    resetNexusDataDirCache();
    resetOutcomeStore();
    resetJobConcurrency();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('a cancel during wave 1 runs no later wave, no synthesis and no orchestrator', async () => {
    const started = deferred();
    const release = deferred();
    const adapter = parkingAdapter({
      abortable: false,
      started,
      release,
      sawAbort: { value: false },
    });
    const { orchestrate, cancel } = handlers(adapter);
    const jobId = await startJob(orchestrate);

    await started.promise;
    await cancelJob(cancel, jobId);
    // This call ignores the signal, so it completes; what follows must not run.
    release.resolve();
    await settle();

    expect(calls).toEqual(['wave-1']);
    expect(readJobResult(jobId)?.status).toBe('cancelled');
  });

  it('a cancel during an abortable adapter call aborts that call', async () => {
    const started = deferred();
    const release = deferred();
    const sawAbort = { value: false };
    const adapter = parkingAdapter({ abortable: true, started, release, sawAbort });
    const { orchestrate, cancel } = handlers(adapter);
    const jobId = await startJob(orchestrate);

    await started.promise;
    await cancelJob(cancel, jobId);
    // Never released: only the abort can end the call.
    await settle();
    release.resolve();

    expect(sawAbort.value).toBe(true);
    // No triage retry of the aborted call, no wave 2, no synthesis.
    expect(calls).toEqual(['wave-1']);
    expect(readJobResult(jobId)?.status).toBe('cancelled');
  });

  it('a cancel during a CLI worker kills the subprocess and spawns no other', async () => {
    const pidFile = join(tmpDir, 'fake-cli.pid');
    const cli = new LongRunningFakeCli(pidFile);
    const adapter = new CliToModelAdapter(cli, { defaultTimeoutMs: 60_000 });
    const { orchestrate, cancel } = handlers(adapter);
    const jobId = await startJob(orchestrate);

    await waitFor(() => existsSync(pidFile) && readFileSync(pidFile, 'utf8') !== '', 'fake CLI');
    const pid = readPid(pidFile);
    expect(isAlive(pid)).toBe(true);

    await cancelJob(cancel, jobId);
    await settle();

    await waitFor(() => !isAlive(pid), `fake CLI pid ${String(pid)} to exit`, 3_000);
    // No transient retry, no triage retry, no wave 2, no synthesis.
    expect(cli.spawnCount).toBe(1);
    expect(readJobResult(jobId)?.status).toBe('cancelled');
  }, 20_000);

  it('a cancel kills a CLI that relaunched itself, grandchild included', async () => {
    const pidFile = join(tmpDir, 'fake-cli.pid');
    const grandchildPidFile = join(tmpDir, 'fake-cli-grandchild.pid');
    const cli = new LongRunningFakeCli(pidFile, { pidFile: grandchildPidFile, mode: 'default' });
    const adapter = new CliToModelAdapter(cli, { defaultTimeoutMs: 60_000 });
    const { orchestrate, cancel } = handlers(adapter);
    const jobId = await startJob(orchestrate);

    await waitFor(() => existsSync(pidFile) && readFileSync(pidFile, 'utf8') !== '', 'fake CLI');
    const pid = readPid(pidFile);
    await waitFor(
      () => existsSync(grandchildPidFile) && readFileSync(grandchildPidFile, 'utf8') !== '',
      'grandchild'
    );
    const grandchildPid = readPid(grandchildPidFile);
    expect(isAlive(grandchildPid)).toBe(true);

    await cancelJob(cancel, jobId);
    await settle();

    await waitFor(() => !isAlive(pid), `fake CLI pid ${String(pid)} to exit`, 3_000);
    await waitFor(
      () => !isAlive(grandchildPid),
      `grandchild pid ${String(grandchildPid)} to exit`,
      3_000
    );
    expect(readJobResult(jobId)?.status).toBe('cancelled');
  }, 20_000);

  it('a cancelled CLI call SIGKILLs a grandchild that ignores SIGTERM', async () => {
    const pidFile = join(tmpDir, 'fake-cli.pid');
    const grandchildPidFile = join(tmpDir, 'fake-cli-grandchild.pid');
    const cli = new NoRetryFakeCli(pidFile, {
      pidFile: grandchildPidFile,
      mode: 'ignore-sigterm',
    });
    const controller = new AbortController();

    const done = cli.execute(
      { content: 'x' },
      { timeoutMs: 60_000, allowRetry: false, signal: controller.signal }
    );
    await waitFor(() => existsSync(pidFile) && readFileSync(pidFile, 'utf8') !== '', 'fake CLI');
    const pid = readPid(pidFile);
    await waitFor(
      () => existsSync(grandchildPidFile) && readFileSync(grandchildPidFile, 'utf8') !== '',
      'grandchild'
    );
    const grandchildPid = readPid(grandchildPidFile);
    controller.abort();
    const result = await done;
    expect(result.ok).toBe(false);

    await waitFor(() => !isAlive(pid), `fake CLI pid ${String(pid)} to exit`, 3_000);
    // The grandchild outlives SIGTERM and its parent; only the SIGKILL escalation ends it.
    await waitFor(
      () => !isAlive(grandchildPid),
      `grandchild pid ${String(grandchildPid)} to exit`,
      SIGKILL_GRACE_MS + 3_000
    );
  }, 20_000);

  it('a CLI timeout SIGKILLs a grandchild that ignores SIGTERM', async () => {
    const pidFile = join(tmpDir, 'fake-cli.pid');
    const grandchildPidFile = join(tmpDir, 'fake-cli-grandchild.pid');
    const cli = new NoRetryFakeCli(pidFile, {
      pidFile: grandchildPidFile,
      mode: 'ignore-sigterm',
    });

    const done = cli.execute({ content: 'x' }, { timeoutMs: 1_000, allowRetry: false });
    await waitFor(() => existsSync(pidFile) && readFileSync(pidFile, 'utf8') !== '', 'fake CLI');
    const pid = readPid(pidFile);
    await waitFor(
      () => existsSync(grandchildPidFile) && readFileSync(grandchildPidFile, 'utf8') !== '',
      'grandchild'
    );
    const grandchildPid = readPid(grandchildPidFile);
    const result = await done;
    expect(result.ok).toBe(false);

    await waitFor(() => !isAlive(pid), `fake CLI pid ${String(pid)} to exit`, 3_000);
    // The grandchild outlives SIGTERM and its parent; only the SIGKILL escalation ends it.
    await waitFor(
      () => !isAlive(grandchildPid),
      `grandchild pid ${String(grandchildPid)} to exit`,
      SIGKILL_GRACE_MS + 3_000
    );
  }, 20_000);

  it('runs both waves, synthesis and the orchestrator when nothing cancels — the empty case', async () => {
    const started = deferred();
    const release = deferred();
    release.resolve();
    const adapter = parkingAdapter({
      abortable: true,
      started,
      release,
      sawAbort: { value: false },
    });
    const { orchestrate } = handlers(adapter);
    const jobId = await startJob(orchestrate);
    await settle();

    expect(calls).toEqual(['wave-1', 'wave-2', 'synthesis', 'orchestrator']);
    expect(readJobResult(jobId)?.status).toBe('complete');
    // The outcome query below sees a real run's record.
    expect(orchestratorOutcomes()).toBe(1);
  });

  it('a cancel during orchestrator.execute completes that call but records no outcome', async () => {
    orchestratorPark = { started: deferred(), release: deferred() };
    const started = deferred();
    const release = deferred();
    release.resolve();
    const adapter = parkingAdapter({
      abortable: true,
      started,
      release,
      sawAbort: { value: false },
    });
    const { orchestrate, cancel } = handlers(adapter);
    const jobId = await startJob(orchestrate);

    await orchestratorPark.started.promise;
    await cancelJob(cancel, jobId);
    orchestratorPark.release.resolve();
    await settle();

    expect(calls.at(-1)).toBe('orchestrator');
    expect(orchestratorOutcomes()).toBe(0);
    expect(readJobResult(jobId)?.status).toBe('cancelled');
  });
});

describe('executeWorkerDispatch cancellation (#6680)', () => {
  it('throws instead of synthesising when the cancel lands during the last wave', async () => {
    calls.length = 0;
    const controller = new AbortController();
    const oneWave: AgentPlan = {
      ...TWO_WAVE_PLAN,
      entries: TWO_WAVE_PLAN.entries.map((e) => ({ ...e, wave: 1 })),
    };
    const adapter = {
      providerId: 'fake',
      modelId: 'fake-model',
      capabilities: [],
      complete: (request: CompletionRequest) => {
        const label = callLabel(request);
        calls.push(label);
        // Both workers answer; the cancel lands as the wave finishes.
        if (label === 'wave-2') controller.abort();
        return Promise.resolve(textResponse(`${label} output`));
      },
      countTokens: () => Promise.resolve(0),
    } as unknown as IModelAdapter;

    await expect(
      executeWorkerDispatch({
        agentPlan: oneWave,
        taskDescription: COMPLEX_TASK,
        modelAdapter: adapter,
        logger: createLogger({ component: 'test-dispatch-cancel' }),
        synthesize: true,
        refine: true,
        signal: controller.signal,
      })
    ).rejects.toMatchObject({ name: 'WorkerDispatchCancelledError' });
    // Both workers conflict on one file, so without the gate synthesis would call the model.
    expect(calls).not.toContain('synthesis');
  });

  it('a cancel during the synthesis call skips reimagine and throws before refinement', async () => {
    calls.length = 0;
    const controller = new AbortController();
    const oneWave: AgentPlan = {
      ...TWO_WAVE_PLAN,
      entries: TWO_WAVE_PLAN.entries.map((e) => ({ ...e, wave: 1 })),
    };
    let synthesisSignal: AbortSignal | undefined;
    const adapter = {
      providerId: 'fake',
      modelId: 'fake-model',
      capabilities: [],
      complete: (request: CompletionRequest) => {
        const label = callLabel(request);
        calls.push(label);
        if (label === 'synthesis') {
          synthesisSignal = request.signal;
          controller.abort();
          // An empty answer fails the quality gate: uncancelled, this escalates to reimagine.
          return Promise.resolve({
            ok: true,
            value: { content: [{ type: 'text', text: '' }], stopReason: 'end_turn', model: 'm' },
          } as Result<CompletionResponse, ModelError>);
        }
        return Promise.resolve(textResponse(`${label} output`));
      },
      countTokens: () => Promise.resolve(0),
    } as unknown as IModelAdapter;

    await expect(
      executeWorkerDispatch({
        agentPlan: oneWave,
        taskDescription: COMPLEX_TASK,
        modelAdapter: adapter,
        logger: createLogger({ component: 'test-dispatch-cancel' }),
        synthesize: true,
        refine: true,
        signal: controller.signal,
      })
    ).rejects.toMatchObject({ name: 'WorkerDispatchCancelledError' });
    expect(synthesisSignal).toBe(controller.signal);
    expect(calls.filter((c) => c === 'synthesis')).toHaveLength(1);
  });
});
