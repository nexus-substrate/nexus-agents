/** Optional trace diagnostics must preserve the TaskContract ID/execution contract. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readdir, readFile, rm, symlink } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { EventBus } from './event-bus.js';
import { TraceWriter } from './trace-writer.js';
import { PipelineRunner, type PipelineExecuteOptions } from './pipeline-runner.js';
import { createCorePluginRegistry } from './core-plugins.js';
import { TaskContractSchema } from './task-contract.js';
import { getGlobalLogLevel, setGlobalLogLevel } from '../core/logger.js';
import { queryTraceFromDisk } from '../mcp/tools/query-trace-tool.js';

let directory: string;
const writers: TraceWriter[] = [];
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'trace-task-id-'));
});
afterEach(async () => {
  for (const value of writers.splice(0)) value.stop();
  await rm(directory, { recursive: true, force: true });
});

function executeTask(
  id: string,
  options?: PipelineExecuteOptions
): ReturnType<PipelineRunner['execute']> {
  const task = TaskContractSchema.parse({
    id,
    description: 'Model-free diagnostic compatibility control',
    status: 'approved',
    analysis: { complexity: 'simple', taskType: 'general', ambiguityScore: 0 },
    constraints: { scope: [] },
    requiredCapabilities: { tools: [], experts: [] },
    capabilityGaps: {
      available: { tools: [], experts: [] },
      gaps: [],
      allSatisfied: true,
      gapsMeasured: false,
    },
    artifacts: [],
    metadata: {},
    createdAt: 1,
    updatedAt: 1,
  });
  const runner = new PipelineRunner();
  const compiled = runner.compile(
    {
      taskId: id,
      stages: [
        {
          id: 'local',
          type: 'analyze',
          pluginId: 'nexus:task-analyzer',
          inputArtifacts: [],
          outputArtifacts: ['result'],
          dependencies: [],
          config: {},
        },
      ],
      policyGates: [],
      estimatedCost: { totalTokensIn: 0, totalTokensOut: 0, estimatedCostUsd: 0, modelCalls: 0 },
      approvalRequired: false,
      maxIterations: 1,
      timeoutMs: 5_000,
    },
    { pluginRegistry: createCorePluginRegistry() }
  );
  if (!compiled.ok) throw new Error(compiled.error);
  return runner.execute(compiled.value, task, options);
}

describe('schema-valid task execution with trace diagnostics', () => {
  it.each(['task.v1', '任务.v1'])(
    'keeps a safe ordinary logical ID unchanged and traceable: %s',
    async (id) => {
      const runsDir = join(directory, 'runs');
      expect(await executeTask(id)).toMatchObject({
        ok: true,
        value: { success: true, stepsExecuted: 1 },
      });
      expect(await executeTask(id, { eventBus: new EventBus(), runsDir })).toMatchObject({
        ok: true,
        value: { success: true, stepsExecuted: 1 },
      });
      const queried = await queryTraceFromDisk({ runId: id }, runsDir);
      expect(queried).toMatchObject({
        runId: id,
        totalEvents: 3,
        attribution: {
          status: 'measured',
          retained: { unattributed: 3, run_related: 0, attempt_owned: 0 },
        },
      });
      expect(queried.events.map((event) => event['eventType'])).toEqual([
        'pipeline.started',
        'stage.completed',
        'pipeline.completed',
      ]);
      expect(
        JSON.parse(await readFile(join(runsDir, id, 'trace-attribution.json'), 'utf8'))
      ).toMatchObject({ runId: id });
    }
  );
  it.each(['../escaped', '.', 'x'.repeat(257)])(
    'preserves execution with explicit trace-loss warning for unsafe/unrepresentable ID: %s',
    async (id) => {
      const previous = getGlobalLogLevel();
      setGlobalLogLevel('warn');
      const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      try {
        const result = await executeTask(id, {
          eventBus: new EventBus(),
          runsDir: join(directory, 'runs'),
        });
        expect(result).toMatchObject({ ok: true, value: { success: true, stepsExecuted: 1 } });
        expect(stderr.mock.calls.map(([chunk]) => String(chunk)).join('')).toContain(
          'Trace flush failed — trace data may be lost'
        );
        expect(await readdir(directory)).toEqual([]);
        const reading = await queryTraceFromDisk({ runId: id }, join(directory, 'runs'));
        expect(reading.attribution?.status).not.toBe('measured');
      } finally {
        stderr.mockRestore();
        setGlobalLogLevel(previous);
      }
    }
  );
});

describe('direct trace output containment and explicit metadata loss', () => {
  it.each(['../escaped', '.'])(
    'refuses non-descendant output before writing: %s',
    async (runId) => {
      const writer = new TraceWriter(new EventBus(), { runsDir: join(directory, 'runs'), runId });
      writers.push(writer);
      await expect(writer.flush()).rejects.toThrow(/contained descendant/);
      expect(await readdir(directory)).toEqual([]);
    }
  );
  it.each(['inside', 'outside'] as const)(
    'honors resolved run-directory containment: %s',
    async (mode) => {
      const runsDir = join(directory, 'runs');
      const target = mode === 'inside' ? join(runsDir, 'shared') : join(directory, 'outside');
      await mkdir(runsDir);
      await mkdir(target);
      await symlink(target, join(runsDir, 'run-a'));
      const writer = new TraceWriter(new EventBus(), { runsDir, runId: 'run-a' });
      writers.push(writer);
      if (mode === 'inside') {
        await writer.flush();
        expect(await queryTraceFromDisk({ runId: 'run-a' }, runsDir)).toMatchObject({
          attribution: { status: 'measured' },
        });
      } else {
        await expect(writer.flush()).rejects.toThrow(/contained descendant/);
        expect(await readdir(target)).toEqual([]);
      }
    }
  );
  it('normalizes a relative runs root without changing the logical ID', async () => {
    const runsDir = join(directory, 'runs');
    const writer = new TraceWriter(new EventBus(), {
      runsDir: relative(process.cwd(), runsDir),
      runId: 'ordinary',
    });
    writers.push(writer);
    await writer.flush();
    expect(await queryTraceFromDisk({ runId: 'ordinary' }, runsDir)).toMatchObject({
      attribution: { status: 'measured' },
    });
  });
  it('refuses metadata identity over its declared bound instead of reporting measured zero', async () => {
    const writer = new TraceWriter(new EventBus(), {
      runsDir: join(directory, 'runs'),
      runId: 'x'.repeat(257),
    });
    writers.push(writer);
    await expect(writer.flush()).rejects.toThrow(/256/);
    expect(await readdir(directory)).toEqual([]);
  });
});
