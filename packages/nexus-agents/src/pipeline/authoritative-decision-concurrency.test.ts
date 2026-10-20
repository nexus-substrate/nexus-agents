/** Real-process regression for duplicate pipeline admission (T10 / C21). */
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { PlanContract, TaskContract } from './task-contract.js';
import { AuthoritativeDecisionStore } from './authoritative-decision-store.js';
import { EventBus } from './event-bus.js';
import { PipelineRunner } from './pipeline-runner.js';
import { createCorePluginRegistry } from './core-plugins.js';

const WORKER_TIMEOUT_MS = 15_000;
const BARRIER_TIMEOUT_MS = 10_000;
const POLL_INTERVAL_MS = 10;
const MAX_CAPTURE_BYTES = 32_768;
const RESULT_PREFIX = 'NEXUS_ADMISSION_RESULT:';
const PACKAGE_DIR = fileURLToPath(new URL('../../', import.meta.url));

const WorkerResultSchema = z.object({
  workerId: z.enum(['one', 'two']),
  success: z.boolean(),
  error: z.string().optional(),
});

interface WorkerExit {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
}

interface RunningWorker {
  readonly child: ChildProcess;
  readonly done: Promise<WorkerExit>;
}

function taskFixture(): TaskContract {
  return {
    id: 'task-concurrent-admission',
    description: 'Analyze one accepted work intent across two processes',
    status: 'approved',
    analysis: { complexity: 'medium', taskType: 'code', ambiguityScore: 0.1 },
    constraints: { scope: [] },
    requiredCapabilities: { tools: [], experts: [] },
    capabilityGaps: {
      available: { tools: [], experts: [] },
      gaps: [],
      allSatisfied: true,
      gapsMeasured: true,
    },
    artifacts: [],
    metadata: {},
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    contractVersion: '1.0.0',
  };
}

function planFixture(): PlanContract {
  return {
    taskId: taskFixture().id,
    stages: [
      {
        id: 'analyze-once',
        type: 'analyze',
        pluginId: 'nexus:task-analyzer',
        inputArtifacts: [],
        outputArtifacts: ['analysis'],
        dependencies: [],
        config: {},
      },
    ],
    policyGates: [],
    estimatedCost: {
      totalTokensIn: 100,
      totalTokensOut: 100,
      estimatedCostUsd: 0.01,
      modelCalls: 1,
    },
    approvalRequired: false,
    maxIterations: 1,
    timeoutMs: BARRIER_TIMEOUT_MS,
  };
}

function workerSource(): string {
  const moduleUrl = (name: string): string => JSON.stringify(new URL(name, import.meta.url).href);
  return `
import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { AuthoritativeDecisionStore } from ${moduleUrl('./authoritative-decision-store.ts')};
import { PipelineRunner } from ${moduleUrl('./pipeline-runner.ts')};
import { createCorePluginRegistry } from ${moduleUrl('./core-plugins.ts')};

const [storageDir, workerId] = process.argv.slice(1);
const runner = new PipelineRunner();
const compiled = runner.compile(${JSON.stringify(planFixture())}, {
  pluginRegistry: createCorePluginRegistry(),
});
if (!compiled.ok) throw new Error('Worker could not compile the real analyze pipeline');
writeFileSync(join(storageDir, workerId + '.ready'), 'ready');
const deadline = Date.now() + ${String(BARRIER_TIMEOUT_MS)};
while (!existsSync(join(storageDir, 'release'))) {
  if (Date.now() >= deadline) throw new Error('Worker start barrier timed out');
  await delay(${String(POLL_INTERVAL_MS)});
}
const store = new AuthoritativeDecisionStore({ storageDir });
const result = await runner.execute(compiled.value, ${JSON.stringify(taskFixture())}, {
  decisionStore: store,
  onStageComplete: () => appendFileSync(join(storageDir, 'effects.jsonl'),
    JSON.stringify({ workerId }) + '\\n'),
});
const outcome = result.ok ? result.value : { success: false, error: String(result.error) };
console.log(${JSON.stringify(RESULT_PREFIX)} + JSON.stringify({
  workerId,
  success: outcome.success,
  ...(outcome.error === undefined ? {} : { error: outcome.error }),
}));
`;
}

function crashContext(): { attemptId: string; subjectRevision: string; scope: string } {
  return {
    attemptId: 'attempt-crash-boundary',
    subjectRevision: createHash('sha256')
      .update(JSON.stringify({ task: taskFixture(), plan: planFixture() }))
      .digest('hex'),
    scope: 'pipeline-attempt',
  };
}

function crashWorkerSource(phase: 'before-commit' | 'after-commit'): string {
  const moduleUrl = (name: string): string => JSON.stringify(new URL(name, import.meta.url).href);
  return `
import { appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AuthoritativeDecisionStore } from ${moduleUrl('./authoritative-decision-store.ts')};
import { openSqliteDatabase } from ${moduleUrl('../context/open-database.ts')};
import { PipelineRunner } from ${moduleUrl('./pipeline-runner.ts')};
import { createCorePluginRegistry } from ${moduleUrl('./core-plugins.ts')};
const [storageDir] = process.argv.slice(1);
const beforeCommit = ${String(phase === 'before-commit')};
const openDatabase = (filePath) => {
  const db = openSqliteDatabase(filePath);
  return { prepare: db.prepare.bind(db), close: () => db.close(), exec: (sql) => {
    if (beforeCommit && sql === 'COMMIT') {
      writeFileSync(join(storageDir, 'crash-boundary'), 'before-commit');
      process.kill(process.pid, 'SIGKILL');
      throw new Error('SIGKILL must terminate before SQLite COMMIT');
    }
    db.exec(sql);
  } };
};
const store = new AuthoritativeDecisionStore({ storageDir, openDatabase });
const task = ${JSON.stringify(taskFixture())};
const context = ${JSON.stringify(crashContext())};
if (beforeCommit) {
  const runner = new PipelineRunner();
  const compiled = runner.compile(${JSON.stringify(planFixture())}, {
    pluginRegistry: createCorePluginRegistry(),
  });
  if (!compiled.ok) throw new Error('Crash worker failed to compile analyze pipeline');
  await runner.execute(compiled.value, task, { decisionStore: store,
    decisionAttemptId: context.attemptId,
    onStageComplete: () => appendFileSync(join(storageDir, 'effects.jsonl'), 'effect\\n'),
  });
  throw new Error('Crash worker unexpectedly survived admission');
}
const error = store.recordPipelineStart(task, context);
if (error !== null) throw new Error(error);
writeFileSync(join(storageDir, 'crash-boundary'), 'after-commit');
process.kill(process.pid, 'SIGKILL');
throw new Error('SIGKILL must terminate before outbox flushing');
`;
}

function startWorker(storageDir: string, workerId: string, source = workerSource()): RunningWorker {
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', '--input-type=module', '--eval', source, storageDir, workerId],
    {
      cwd: PACKAGE_DIR,
      // Do not inherit credentials, model configuration, NODE_OPTIONS, or agent hooks.
      env: {
        HOME: storageDir,
        TMPDIR: storageDir,
        NEXUS_DATA_DIR: storageDir,
        NEXUS_REPO_PREFERRED: '0',
        NEXUS_LOG_LEVEL: 'error',
        TZ: 'UTC',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
  const done = new Promise<WorkerExit>((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => child.kill('SIGKILL'), WORKER_TIMEOUT_MS);
    child.stdout.on('data', (chunk: Buffer) => {
      stdout = (stdout + chunk.toString()).slice(-MAX_CAPTURE_BYTES);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-MAX_CAPTURE_BYTES);
    });
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('close', (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal, stdout, stderr });
    });
  });
  return { child, done };
}

async function releaseReadyWorkers(storageDir: string): Promise<void> {
  const deadline = Date.now() + BARRIER_TIMEOUT_MS;
  while (!existsSync(join(storageDir, 'one.ready')) || !existsSync(join(storageDir, 'two.ready'))) {
    if (Date.now() >= deadline) throw new Error('Both subprocesses must reach the start barrier');
    await delay(POLL_INTERVAL_MS);
  }
  writeFileSync(join(storageDir, 'release'), 'run');
}

function readOutcome(exit: WorkerExit): z.infer<typeof WorkerResultSchema> {
  expect(exit.signal, exit.stderr).toBeNull();
  expect(exit.code, exit.stderr).toBe(0);
  const resultLine = exit.stdout.split('\n').find((line) => line.startsWith(RESULT_PREFIX));
  expect(resultLine, 'A successful worker must report its real execution result').toBeDefined();
  return WorkerResultSchema.parse(JSON.parse(resultLine?.slice(RESULT_PREFIX.length) ?? 'null'));
}

describe('authoritative pipeline admission across real processes', () => {
  let storageDir: string | undefined;
  let workers: RunningWorker[] = [];

  afterEach(async () => {
    for (const worker of workers) {
      if (worker.child.exitCode === null && worker.child.signalCode === null) {
        worker.child.kill('SIGKILL');
      }
    }
    await Promise.allSettled(workers.map((worker) => worker.done));
    workers = [];
    if (storageDir !== undefined) rmSync(storageDir, { recursive: true, force: true });
    storageDir = undefined;
  });

  it('admits one logical execution and explicitly refuses the concurrent duplicate', async () => {
    storageDir = mkdtempSync(join(tmpdir(), 'nexus-admission-processes-'));
    // Pre-create the observation file: empty means no stage effects, never a pass.
    writeFileSync(join(storageDir, 'effects.jsonl'), '');
    workers = [startWorker(storageDir, 'one'), startWorker(storageDir, 'two')];
    await releaseReadyWorkers(storageDir);
    const outcomes = (await Promise.all(workers.map((worker) => worker.done))).map(readOutcome);
    const effects = readFileSync(join(storageDir, 'effects.jsonl'), 'utf8')
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => WorkerResultSchema.pick({ workerId: true }).parse(JSON.parse(line)));

    expect(effects, 'Duplicate accepted work must not execute a second graph stage').toHaveLength(
      1
    );
    expect(outcomes.filter((outcome) => outcome.success)).toHaveLength(1);
    expect(effects[0]?.workerId).toBe(outcomes.find((outcome) => outcome.success)?.workerId);
    const refused = outcomes.filter((outcome) => !outcome.success);
    expect(refused).toHaveLength(1);
    expect(refused[0]?.error).toMatch(/duplicate|already|admission/i);
  });

  it('recovers no admission or graph effect after SIGKILL immediately before commit', async () => {
    storageDir = mkdtempSync(join(tmpdir(), 'nexus-admission-killed-before-'));
    writeFileSync(join(storageDir, 'effects.jsonl'), '');
    const worker = startWorker(storageDir, 'one', crashWorkerSource('before-commit'));
    workers = [worker];
    const exit = await worker.done;

    expect(exit.signal, exit.stderr).toBe('SIGKILL');
    expect(exit.code, exit.stderr).toBeNull();
    expect(readFileSync(join(storageDir, 'crash-boundary'), 'utf8')).toBe('before-commit');
    const restarted = new AuthoritativeDecisionStore({ storageDir });
    expect(restarted.getTaskSnapshot(taskFixture().id)).toEqual({ ok: true, value: null });
    expect(readFileSync(join(storageDir, 'effects.jsonl'), 'utf8')).toBe('');
  });

  it('recovers committed intent after SIGKILL before dispatch and refuses duplicate graph work', async () => {
    storageDir = mkdtempSync(join(tmpdir(), 'nexus-admission-killed-after-'));
    const effectsFile = join(storageDir, 'effects.jsonl');
    writeFileSync(effectsFile, '');
    const worker = startWorker(storageDir, 'one', crashWorkerSource('after-commit'));
    workers = [worker];
    const exit = await worker.done;
    expect(exit.signal, exit.stderr).toBe('SIGKILL');
    expect(exit.code, exit.stderr).toBeNull();
    expect(readFileSync(join(storageDir, 'crash-boundary'), 'utf8')).toBe('after-commit');
    const restarted = new AuthoritativeDecisionStore({ storageDir });
    const snapshot = restarted.getTaskSnapshot(taskFixture().id);
    if (!snapshot.ok) throw new Error(snapshot.error);
    expect(snapshot.value?.currentState).toBe('executing');
    expect(snapshot.value?.pendingOutboxIntents).toHaveLength(1);
    const bus = new EventBus();
    expect(restarted.flushPendingOutbox(taskFixture().id, bus).dispatchedIntentIds).toEqual([
      `start:${crashContext().attemptId}`,
    ]);
    expect(restarted.flushPendingOutbox(taskFixture().id, bus).dispatchedIntentIds).toEqual([]);
    expect(bus.query({ type: 'pipeline.started' })).toEqual([
      expect.objectContaining({
        intentId: `start:${crashContext().attemptId}`,
        attemptId: crashContext().attemptId,
      }),
    ]);
    expect(restarted.recordPipelineStart(taskFixture(), crashContext())).toMatch(/duplicate/i);
    const runner = new PipelineRunner();
    const compiled = runner.compile(planFixture(), { pluginRegistry: createCorePluginRegistry() });
    if (!compiled.ok) throw new Error(compiled.error);
    const repeated = await runner.execute(compiled.value, taskFixture(), {
      decisionStore: restarted,
      decisionAttemptId: crashContext().attemptId,
      onStageComplete: () => {
        appendFileSync(effectsFile, 'effect\n');
      },
    });
    if (!repeated.ok) throw new Error(repeated.error);
    expect(repeated.value.success).toBe(false);
    expect(repeated.value.error).toMatch(/duplicate/i);
    expect(repeated.value.stepsExecuted).toBe(0);
    expect(readFileSync(effectsFile, 'utf8')).toBe('');
  });
});
