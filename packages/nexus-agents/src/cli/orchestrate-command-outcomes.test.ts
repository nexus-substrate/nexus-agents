/**
 * `orchestrate` CLI routed runs feed the router and the outcome store (#6533).
 *
 * The router is mocked at the `cli-adapters` boundary; the outcome store is
 * real (in-memory), so these assert the persisted rows themselves.
 */
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';

vi.mock('../cli-adapters/index.js', () => ({
  getAvailableClis: vi.fn(),
  createAllAdapters: vi.fn(),
  createCompositeRouter: vi.fn(),
  routingArmDisplaySlot: (arm: string): string => (arm === 'api:anthropic' ? 'claude' : arm),
}));

import { orchestrateCommand } from './orchestrate-command.js';
import {
  getAvailableClis,
  createAllAdapters,
  createCompositeRouter,
} from '../cli-adapters/index.js';
import { OutcomeStore, setOutcomeStore } from '../orchestration/outcomes/outcome-store.js';

/** Contains `test`, so the detected category is `testing`. */
const TESTING_TASK = 'write unit tests for the parser';

interface Harness {
  readonly adapter: { execute: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> };
  readonly route: ReturnType<typeof vi.fn>;
  readonly executeDecision: ReturnType<typeof vi.fn>;
}

/** An `api:anthropic` arm, so the routed slot (`claude`) differs from the arm id. */
function setUp(withExecuteDecision = true): Harness {
  const adapter = {
    name: 'api:anthropic',
    execute: vi.fn().mockResolvedValue({ ok: true, value: { text: 'direct' } }),
    dispose: vi.fn().mockResolvedValue(undefined),
  };
  const decision = {
    cliName: 'api:anthropic',
    adapter,
    model: 'claude-sonnet',
    confidence: 0.9,
    reason: 'best',
  };
  const route = vi.fn().mockResolvedValue({ ok: true, value: decision });
  const executeDecision = vi.fn().mockResolvedValue({
    ok: true,
    value: { text: 'routed', routedCli: 'claude', routedDurationMs: 321 },
  });
  vi.mocked(getAvailableClis).mockResolvedValue([]);
  vi.mocked(createAllAdapters).mockReturnValue(new Map([['api:anthropic', adapter]]) as never);
  vi.mocked(createCompositeRouter).mockReturnValue({
    route,
    ...(withExecuteDecision && { executeDecision }),
  } as never);
  return { adapter, route, executeDecision };
}

describe('orchestrate CLI routed outcomes (#6533)', () => {
  let store: OutcomeStore;
  let logSpy: MockInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXUS_PERSIST_LEARNING', 'false');
    store = new OutcomeStore();
    setOutcomeStore(store);
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    setOutcomeStore(new OutcomeStore());
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('runs through executeDecision and records the ran arm with its own duration', async () => {
    const h = setUp();

    const exitCode = await orchestrateCommand({ task: TESTING_TASK });

    expect(exitCode).toBe(0);
    expect(h.adapter.execute).not.toHaveBeenCalled();
    const [decision, task, runTask] = h.executeDecision.mock.calls[0] as [
      unknown,
      { content: string; model?: string },
      { model?: string },
    ];
    expect(decision).toBe((await h.route.mock.results[0]?.value)?.value);
    // The router learns against the SAME object it routed: pendingRoutingOutcomes
    // is a WeakMap keyed by it, so a copy would silently lose attribution.
    expect(task).toBe(h.route.mock.calls[0]?.[0]);
    expect(task.model).toBeUndefined();
    expect(runTask.model).toBe('claude-sonnet');
    expect(store.query()).toEqual([
      expect.objectContaining({
        cli: 'claude',
        routedBy: 'composite-router',
        category: 'testing',
        success: true,
        durationMs: 321,
      }),
    ]);
    expect(String(logSpy.mock.calls[0]?.[0])).toContain('routed');
  });

  it('records a routed failure with a failureCategory and exits 1', async () => {
    const h = setUp();
    h.executeDecision.mockResolvedValueOnce({
      ok: false,
      error: {
        code: 'TIMEOUT',
        message: 'request timed out',
        cli: 'claude',
        retryable: true,
        routedCli: 'claude',
        routedDurationMs: 900,
      },
    });

    const exitCode = await orchestrateCommand({ task: TESTING_TASK });

    expect(exitCode).toBe(1);
    expect(store.query()).toEqual([
      expect.objectContaining({
        cli: 'claude',
        routedBy: 'composite-router',
        success: false,
        durationMs: 900,
        failureCategory: 'timeout',
      }),
    ]);
  });

  it('records nothing when routing fails, and runs no arm', async () => {
    const h = setUp();
    h.route.mockResolvedValueOnce({ ok: false, error: { message: 'no arm' } });

    expect(await orchestrateCommand({ task: TESTING_TASK })).toBe(1);
    expect(h.executeDecision).not.toHaveBeenCalled();
    expect(store.query()).toHaveLength(0);
  });

  it('records nothing on --dry-run', async () => {
    const h = setUp();

    await orchestrateCommand({ task: TESTING_TASK, dryRun: true });

    expect(h.executeDecision).not.toHaveBeenCalled();
    expect(store.query()).toHaveLength(0);
  });

  it('feeds the router but persists no row when the category is undetected', async () => {
    const h = setUp();

    await orchestrateCommand({ task: 'zzqx flurb' });

    expect(h.executeDecision).toHaveBeenCalledTimes(1);
    expect(store.query()).toHaveLength(0);
  });

  it('records nothing for a pinned --model run: the router chose no CLI', async () => {
    const h = setUp();

    await orchestrateCommand({ task: TESTING_TASK, model: 'api:anthropic' as never });

    expect(h.route).not.toHaveBeenCalled();
    expect(store.query()).toHaveLength(0);
  });

  it('still runs the arm, unrecorded, on a router without executeDecision', async () => {
    const h = setUp(false);

    expect(await orchestrateCommand({ task: TESTING_TASK })).toBe(0);
    expect(h.adapter.execute).toHaveBeenCalledTimes(1);
    expect(store.query()).toHaveLength(0);
  });
});
