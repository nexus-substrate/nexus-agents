/**
 * Tests for the execute_expert MCP Tasks async handler (#1298, moved out of
 * execute-expert.ts in #6148). Everything goes through the exported surface:
 * `createTaskHandler` with an injected `execute`, and `EXECUTE_EXPERT_TOOL_SCHEMA`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import type {
  CreateTaskRequestHandlerExtra,
  TaskRequestHandlerExtra,
} from '@modelcontextprotocol/sdk/experimental/tasks';
import type { ILogger } from '../../core/index.js';
import type { IMcpNotifier } from '../mcp-notifier.js';
import { DEFAULT_TASK_TTL_MS } from '../task-store.js';
import { EXPERT_TIMEOUTS } from '../../config/timeouts.js';
import { createTaskHandler, EXECUTE_EXPERT_TOOL_SCHEMA } from './execute-expert-task-handler.js';
import { ExecuteExpertInputSchema } from './execute-expert.js';
import { resetNexusDataDirCache } from '../../config/nexus-data-dir.js';
import { defaultBusyEnvelope, runAsJob } from '../jobs/run-as-job.js';
import {
  _resetForTests as resetConcurrency,
  getInFlight,
  getTotalInFlight,
  suggestRetryAfterMs,
  tryAcquire,
} from '../jobs/job-concurrency.js';

/** The parent's `ExpertResult` shape, as the injected execute path returns it. */
type StubResult =
  | {
      ok: true;
      value: {
        expertId: string;
        role: string;
        status: 'success' | 'error';
        tokensUsed: number;
        tokensMeasured?: boolean;
      };
    }
  | { ok: false; error: string };

interface StubDeps {
  logger?: ILogger;
  notifier?: IMcpNotifier;
  /** Proves the deps object reaches `execute` untouched. */
  marker: string;
}

/** The full input schema the parent injects; the tool schema plus one chain-only field. */
const inputSchema = z.object({
  ...EXECUTE_EXPERT_TOOL_SCHEMA,
  previousExpertSummary: z.string().max(2000).optional(),
});

function createMockLogger(): ILogger {
  const logger: ILogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => logger),
    setLevel: vi.fn(),
  };
  return logger;
}

function createNotifier(): IMcpNotifier {
  return { info: vi.fn(), debug: vi.fn(), warn: vi.fn() };
}

interface Harness {
  deps: StubDeps;
  logger: ILogger;
  notifier: IMcpNotifier;
  execute: ReturnType<typeof vi.fn>;
  storeTaskResult: ReturnType<typeof vi.fn>;
  createTaskInStore: ReturnType<typeof vi.fn>;
  extra: CreateTaskRequestHandlerExtra;
  handler: ReturnType<typeof createTaskHandler>;
}

function createHarness(
  execute: (deps: StubDeps, args: z.infer<typeof inputSchema>) => Promise<StubResult>,
  options: { withNotifier?: boolean; storeTaskResult?: ReturnType<typeof vi.fn> } = {}
): Harness {
  const logger = createMockLogger();
  const notifier = createNotifier();
  const deps: StubDeps = { logger, marker: 'deps-1' };
  if (options.withNotifier !== false) deps.notifier = notifier;
  const executeSpy = vi.fn(execute);
  const storeTaskResult = options.storeTaskResult ?? vi.fn().mockResolvedValue(undefined);
  const createTaskInStore = vi.fn().mockResolvedValue({ taskId: 'task-1', status: 'working' });
  const extra = {
    taskStore: { createTask: createTaskInStore, storeTaskResult },
  } as unknown as CreateTaskRequestHandlerExtra;
  const handler = createTaskHandler(deps, logger, { inputSchema, execute: executeSpy });
  return {
    deps,
    logger,
    notifier,
    execute: executeSpy,
    storeTaskResult,
    createTaskInStore,
    extra,
    handler,
  };
}

/** The args type the SDK hands createTask (its optional keys are present-or-undefined). */
type CreateTaskArgs = Parameters<ReturnType<typeof createTaskHandler>['createTask']>[0];

const VALID_ARGS = { expertId: 'test-expert', task: 'Review code' } as CreateTaskArgs;

function eventsOf(notifier: IMcpNotifier): string[] {
  return (notifier.info as ReturnType<typeof vi.fn>).mock.calls.map(
    (call) => (call[1] as Record<string, unknown>)['event'] as string
  );
}

function completionOf(notifier: IMcpNotifier): Record<string, unknown> | undefined {
  return (notifier.info as ReturnType<typeof vi.fn>).mock.calls.find(
    (call) => (call[1] as Record<string, unknown>)['event'] === 'expert_complete'
  )?.[1] as Record<string, unknown> | undefined;
}

async function runToCompletion(h: Harness): Promise<void> {
  await h.handler.createTask(VALID_ARGS, h.extra);
  await vi.waitFor(() => {
    expect(h.storeTaskResult).toHaveBeenCalled();
  });
}

describe('EXECUTE_EXPERT_TOOL_SCHEMA', () => {
  it('is the parent ExecuteExpertInputSchema minus the chain-only previousExpertSummary field', () => {
    // The move replaced the EXPERT_TIMEOUT_FLOOR_MS alias with the value it
    // aliases; this pins that the registered schema still reads identically.
    const registered = z.toJSONSchema(z.object(EXECUTE_EXPERT_TOOL_SCHEMA), { io: 'input' });
    const full = z.toJSONSchema(ExecuteExpertInputSchema, { io: 'input' }) as {
      properties: Record<string, unknown>;
    };
    const { previousExpertSummary, ...expectedProperties } = full.properties;
    expect(previousExpertSummary).toBeDefined();
    expect(registered).toEqual({ ...full, properties: expectedProperties });
  });

  it('bounds timeoutMs by the expert timeout floor and max', () => {
    const shape = z.object(EXECUTE_EXPERT_TOOL_SCHEMA);
    expect(
      shape.safeParse({ ...VALID_ARGS, timeoutMs: EXPERT_TIMEOUTS.executeFloorMs }).success
    ).toBe(true);
    expect(
      shape.safeParse({ ...VALID_ARGS, timeoutMs: EXPERT_TIMEOUTS.executeFloorMs - 1 }).success
    ).toBe(false);
    expect(shape.safeParse({ ...VALID_ARGS, timeoutMs: EXPERT_TIMEOUTS.maxMs + 1 }).success).toBe(
      false
    );
  });
});

describe('createTaskHandler createTask', () => {
  it('rejects with a validation error before creating a task or running the expert', async () => {
    const h = createHarness(() => Promise.resolve({ ok: false, error: 'unreachable' }));

    await expect(
      h.handler.createTask({ expertId: '', task: 'x' } as CreateTaskArgs, h.extra)
    ).rejects.toThrow(/^Validation error: /);

    expect(h.createTaskInStore).not.toHaveBeenCalled();
    expect(h.execute).not.toHaveBeenCalled();
  });

  it('creates the task with the default TTL, returns it, and starts the injected execute path', async () => {
    const h = createHarness((deps, args) =>
      Promise.resolve({
        ok: true,
        value: { expertId: args.expertId, role: deps.marker, status: 'success', tokensUsed: 1 },
      })
    );

    const created = await h.handler.createTask(VALID_ARGS, h.extra);

    expect(created).toEqual({ task: { taskId: 'task-1', status: 'working' } });
    expect(h.createTaskInStore).toHaveBeenCalledWith({
      ttl: DEFAULT_TASK_TTL_MS,
      pollInterval: 5000,
    });
    expect(h.logger.info).toHaveBeenCalledWith('Task created for execute_expert', {
      taskId: 'task-1',
      expertId: 'test-expert',
    });
    await vi.waitFor(() => {
      expect(h.execute).toHaveBeenCalledWith(h.deps, VALID_ARGS);
    });
  });

  it('falls back to the no-op notifier when deps carry none', async () => {
    const h = createHarness(
      () =>
        Promise.resolve({
          ok: true,
          value: { expertId: 'e', role: 'r', status: 'success', tokensUsed: 2 },
        }),
      { withNotifier: false }
    );

    await runToCompletion(h);

    expect(h.storeTaskResult).toHaveBeenCalledWith('task-1', 'completed', expect.anything());
    expect(h.notifier.info).not.toHaveBeenCalled();
  });
});

describe('createTaskHandler background completion', () => {
  it('stores the serialized response as completed and reports expert_start then expert_complete', async () => {
    const value = { expertId: 'e1', role: 'code', status: 'success' as const, tokensUsed: 25 };
    const h = createHarness(() => Promise.resolve({ ok: true, value }));

    await runToCompletion(h);

    expect(h.storeTaskResult).toHaveBeenCalledWith('task-1', 'completed', {
      content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    });
    expect(eventsOf(h.notifier)).toEqual(['expert_start', 'expert_complete']);
    expect(completionOf(h.notifier)).toEqual({
      event: 'expert_complete',
      taskId: 'task-1',
      role: 'code',
      confidence: 1,
      tokenUsage: 25,
    });
  });

  it('reports confidence 0 for an error-status response', async () => {
    const h = createHarness(() =>
      Promise.resolve({
        ok: true,
        value: { expertId: 'e1', role: 'code', status: 'error', tokensUsed: 0 },
      })
    );

    await runToCompletion(h);

    expect(completionOf(h.notifier)).toMatchObject({ confidence: 0 });
  });

  // Moved from execute-expert.test.ts (#5536): token provenance reaches both
  // the stored result and the notifier.
  it('threads unmeasured provenance through the stored result and notifier', async () => {
    const h = createHarness(() =>
      Promise.resolve({
        ok: true,
        value: {
          expertId: 'e1',
          role: 'code',
          status: 'success',
          tokensUsed: 0,
          tokensMeasured: false,
        },
      })
    );

    await runToCompletion(h);

    const stored = h.storeTaskResult.mock.calls[0]?.[2] as { content: Array<{ text: string }> };
    expect(JSON.parse(stored.content[0]!.text)).toMatchObject({
      tokensUsed: 0,
      tokensMeasured: false,
    });
    expect(completionOf(h.notifier)).toMatchObject({ tokenUsage: 0, tokensMeasured: false });
  });

  it('threads measured provenance through the stored result and notifier', async () => {
    const h = createHarness(() =>
      Promise.resolve({
        ok: true,
        value: {
          expertId: 'e1',
          role: 'code',
          status: 'success',
          tokensUsed: 321,
          tokensMeasured: true,
        },
      })
    );

    await runToCompletion(h);

    const stored = h.storeTaskResult.mock.calls[0]?.[2] as { content: Array<{ text: string }> };
    expect(JSON.parse(stored.content[0]!.text)).toMatchObject({
      tokensUsed: 321,
      tokensMeasured: true,
    });
    expect(completionOf(h.notifier)).toMatchObject({ tokenUsage: 321, tokensMeasured: true });
  });
});

describe('createTaskHandler background failure', () => {
  it('stores an execute failure as a failed task and never reports expert_complete', async () => {
    const h = createHarness(() => Promise.resolve({ ok: false, error: 'no adapter' }));

    await runToCompletion(h);

    expect(h.storeTaskResult).toHaveBeenCalledTimes(1);
    const [taskId, status, result] = h.storeTaskResult.mock.calls[0] as [string, string, unknown];
    expect(taskId).toBe('task-1');
    expect(status).toBe('failed');
    expect(result).toMatchObject({
      isError: true,
      content: [{ type: 'text', text: 'Failed to execute expert: no adapter' }],
    });
    expect(eventsOf(h.notifier)).toEqual(['expert_start']);
  });

  it('stores a thrown execute error as a failed task and warns', async () => {
    const h = createHarness(() => Promise.reject(new Error('boom')));

    await runToCompletion(h);

    const [, status, result] = h.storeTaskResult.mock.calls[0] as [string, string, unknown];
    expect(status).toBe('failed');
    expect(result).toMatchObject({
      isError: true,
      content: [{ type: 'text', text: 'Expert execution error: boom' }],
    });
    expect(h.logger.warn).toHaveBeenCalledWith('Background expert task failed', {
      taskId: 'task-1',
      error: 'boom',
    });
  });

  it('warns instead of rejecting when storing the failure itself fails', async () => {
    const storeTaskResult = vi.fn().mockRejectedValue(new Error('store down'));
    const h = createHarness(() => Promise.reject(new Error('boom')), { storeTaskResult });

    await h.handler.createTask(VALID_ARGS, h.extra);
    await vi.waitFor(() => {
      expect(h.logger.warn).toHaveBeenCalledWith('Failed to store task failure result', {
        taskId: 'task-1',
        error: 'store down',
      });
    });
  });
});

describe('createTaskHandler getTask / getTaskResult', () => {
  it('delegate to the task store for the request taskId', async () => {
    const h = createHarness(() => Promise.resolve({ ok: false, error: 'unused' }));
    const getTask = vi.fn().mockResolvedValue({ taskId: 'task-9', status: 'working' });
    const getTaskResult = vi.fn().mockResolvedValue({ content: [] });
    const extra = {
      taskId: 'task-9',
      taskStore: { getTask, getTaskResult },
    } as unknown as TaskRequestHandlerExtra;

    await expect(h.handler.getTask(VALID_ARGS, extra)).resolves.toEqual({
      taskId: 'task-9',
      status: 'working',
    });
    await expect(h.handler.getTaskResult(VALID_ARGS, extra)).resolves.toEqual({ content: [] });
    expect(getTask).toHaveBeenCalledWith('task-9');
    expect(getTaskResult).toHaveBeenCalledWith('task-9');
  });
});

describe('createTaskHandler shared job concurrency caps', () => {
  let dataDir: string;

  beforeEach(() => {
    resetConcurrency();
    vi.stubEnv('NEXUS_JOB_MAX_CONCURRENT_EXECUTE_EXPERT', '4');
    vi.stubEnv('NEXUS_JOB_MAX_CONCURRENT_TOTAL', '10');
    dataDir = mkdtempSync(join(tmpdir(), 'nexus-expert-task-caps-'));
    vi.stubEnv('NEXUS_DATA_DIR', dataDir);
    resetNexusDataDirCache();
  });

  afterEach(() => {
    resetConcurrency();
    vi.unstubAllEnvs();
    resetNexusDataDirCache();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('rejects at the per-tool cap with the job busy error and creates no task', async () => {
    for (let i = 0; i < 4; i++) expect(tryAcquire('execute_expert')).toBe(true);
    const h = createHarness(() => Promise.resolve({ ok: false, error: 'unreachable' }));
    const busy = defaultBusyEnvelope(suggestRetryAfterMs('execute_expert'), 'execute_expert');

    await expect(h.handler.createTask(VALID_ARGS, h.extra)).rejects.toEqual(
      new Error(busy.content[0]!.text)
    );

    expect(h.createTaskInStore).not.toHaveBeenCalled();
    expect(h.execute).not.toHaveBeenCalled();
    expect(getInFlight('execute_expert')).toBe(4);
    expect(getTotalInFlight()).toBe(4);
  });

  it('rejects at the global cap even when no expert task is running', async () => {
    for (let i = 0; i < 10; i++) expect(tryAcquire('other_tool')).toBe(true);
    const h = createHarness(() => Promise.resolve({ ok: false, error: 'unreachable' }));
    const busy = defaultBusyEnvelope(suggestRetryAfterMs('execute_expert'), 'execute_expert');

    await expect(h.handler.createTask(VALID_ARGS, h.extra)).rejects.toEqual(
      new Error(busy.content[0]!.text)
    );

    expect(h.createTaskInStore).not.toHaveBeenCalled();
    expect(getInFlight('execute_expert')).toBe(0);
    expect(getTotalInFlight()).toBe(10);
  });

  it.each(['success', 'failed result', 'thrown executor'] as const)(
    'counts an in-flight task and releases exactly its slot after %s',
    async (outcome) => {
      expect(tryAcquire('execute_expert')).toBe(true);
      expect(tryAcquire('other_tool')).toBe(true);
      const priorTool = getInFlight('execute_expert');
      const priorTotal = getTotalInFlight();
      const gate = Promise.withResolvers<undefined>();
      const h = createHarness(async () => {
        await gate.promise;
        if (outcome === 'thrown executor') throw new Error('executor failed');
        if (outcome === 'failed result') return { ok: false, error: 'failed result' };
        return {
          ok: true,
          value: { expertId: 'e', role: 'code', status: 'success', tokensUsed: 1 },
        };
      });

      try {
        await h.handler.createTask(VALID_ARGS, h.extra);
        expect(getInFlight('execute_expert')).toBe(priorTool + 1);
        expect(getTotalInFlight()).toBe(priorTotal + 1);
      } finally {
        gate.resolve(undefined);
      }

      await vi.waitFor(() => {
        expect(h.storeTaskResult).toHaveBeenCalledWith(
          'task-1',
          outcome === 'success' ? 'completed' : 'failed',
          expect.anything()
        );
        expect(getInFlight('execute_expert')).toBe(priorTool);
        expect(getTotalInFlight()).toBe(priorTotal);
      });
    }
  );

  it('releases the reserved slot immediately when task creation rejects', async () => {
    expect(tryAcquire('execute_expert')).toBe(true);
    expect(tryAcquire('other_tool')).toBe(true);
    const priorTool = getInFlight('execute_expert');
    const priorTotal = getTotalInFlight();
    const h = createHarness(() => Promise.resolve({ ok: false, error: 'unreachable' }));
    const creation = Promise.withResolvers<never>();
    h.createTaskInStore.mockReturnValueOnce(creation.promise);
    const rejected = expect(h.handler.createTask(VALID_ARGS, h.extra)).rejects.toThrow(
      'store down'
    );

    try {
      expect(getInFlight('execute_expert')).toBe(priorTool + 1);
      expect(getTotalInFlight()).toBe(priorTotal + 1);
    } finally {
      creation.reject(new Error('store down'));
    }
    await rejected;

    expect(h.execute).not.toHaveBeenCalled();
    expect(getInFlight('execute_expert')).toBe(priorTool);
    expect(getTotalInFlight()).toBe(priorTotal);
  });

  it('enforces one shared cap for a job-lane slot plus task-lane slots', async () => {
    const job = Promise.withResolvers<{ ok: true }>();
    const tasks = Promise.withResolvers<StubResult>();
    const h = createHarness(() => tasks.promise);

    try {
      runAsJob({
        toolName: 'execute_expert',
        input: VALID_ARGS,
        freshJobId: () => 'job-shared-cap',
        run: () => job.promise,
      });
      for (let i = 0; i < 3; i++) await h.handler.createTask(VALID_ARGS, h.extra);
      expect(getInFlight('execute_expert')).toBe(4);
      expect(getTotalInFlight()).toBe(4);
      const busy = defaultBusyEnvelope(suggestRetryAfterMs('execute_expert'), 'execute_expert');

      await expect(h.handler.createTask(VALID_ARGS, h.extra)).rejects.toThrow(
        busy.content[0]!.text
      );
      const overflow = vi.fn(() => job.promise);
      expect(
        runAsJob({
          toolName: 'execute_expert',
          input: VALID_ARGS,
          freshJobId: () => 'job-overflow',
          run: overflow,
        })
      ).toEqual(busy);
      expect(overflow).not.toHaveBeenCalled();
      expect(h.createTaskInStore).toHaveBeenCalledTimes(3);
    } finally {
      job.resolve({ ok: true });
      tasks.resolve({ ok: false, error: 'settled' });
      await vi.waitFor(() => {
        expect(getInFlight('execute_expert')).toBe(0);
        expect(getTotalInFlight()).toBe(0);
      });
    }
  });
});
