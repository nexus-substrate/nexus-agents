/**
 * CompositeRouter honours read-only analysis mode (#6768).
 *
 * A read-only task is routed only to an arm whose adapter declares
 * `enforcesReadOnlyAnalysis: true`. The router does not fail over at execution
 * time, so an arm that would refuse the task is removed before selection, and a
 * route with no qualifying arm fails clearly without running anything.
 *
 * Selection is made deterministic by disabling the scoring stages: with TOPSIS
 * and LinUCB off the router picks the first remaining candidate, and the
 * non-enforcing arm is registered FIRST, so a missing filter selects it.
 *
 * @module cli-adapters/composite-router-access-mode.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CliName, CliTask, ICliAdapter, RoutingArmId } from './types.js';

vi.mock('../config/learning-persistence.js', () => ({
  isPersistenceEnabled: vi.fn(() => false),
  isStrategyDistillationEnabled: vi.fn(() => false),
  getModelSelectionShadowFile: vi.fn(() => '/dev/null'),
}));

// Lets a test force a high-confidence routing-memory pick. Memory recommends
// a display slot, so its pick can name an arm outside the filtered candidates.
const { forcedMemory } = vi.hoisted(() => ({
  forcedMemory: { slot: undefined as string | undefined },
}));
vi.mock('./composite-router-scoring-stages.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./composite-router-scoring-stages.js')>();
  return {
    ...actual,
    runRoutingMemoryStage: (...args: Parameters<typeof actual.runRoutingMemoryStage>) =>
      forcedMemory.slot === undefined
        ? actual.runRoutingMemoryStage(...args)
        : { recommendation: forcedMemory.slot, memoryConfidence: 0.9 },
  };
});

const { CompositeRouter } = await import('./composite-router.js');
const { armsForAccessMode } = await import('./composite-router-access-mode.js');

function mockAdapter(name: CliName, enforces: boolean | undefined): ICliAdapter {
  return {
    name,
    transport: 'subprocess',
    capabilities: { reasoning: 8, contextWindow: 200000, codeGeneration: 9, speed: 7, cost: 5 },
    ...(enforces !== undefined && { enforcesReadOnlyAnalysis: enforces }),
    execute: vi.fn().mockResolvedValue({ ok: true, value: { text: `ran on ${name}` } }),
    healthCheck: vi.fn().mockResolvedValue({ healthy: true, version: '1.0.0' }),
    getVersion: vi.fn().mockResolvedValue('1.0.0'),
    getCapacity: vi.fn().mockResolvedValue({ remainingTokens: 100000 }),
    getModelInfo: vi.fn().mockReturnValue({ id: name, name }),
    initialize: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
  } as unknown as ICliAdapter;
}

const FIRST_CANDIDATE_CONFIG = {
  enableBudgetFilter: false,
  enableZeroRouter: false,
  enableTopsisRanking: false,
  enableLinUCBSelection: false,
  enableResourceStrategy: false,
  enableLatencyTracking: false,
  enableCapacityBalancing: false,
};

const READ_ONLY: CliTask = { content: 'hello there', accessMode: 'read-only-analysis' };
const DEFAULT_TASK: CliTask = { content: 'hello there' };

/** The arm a default task takes with scoring on and no memory pick, measured before #6768's fallback. */
const BASELINE_DEFAULT_ARM = 'claude';

function router(
  arms: ReadonlyArray<readonly [RoutingArmId, ICliAdapter]>
): InstanceType<typeof CompositeRouter> {
  return new CompositeRouter(new Map(arms), FIRST_CANDIDATE_CONFIG);
}

beforeEach(() => {
  forcedMemory.slot = undefined;
});

describe('CompositeRouter read-only routing (#6768)', () => {
  it('selects the non-enforcing first arm for a default task (control)', async () => {
    const r = router([
      ['gemini', mockAdapter('gemini', undefined)],
      ['claude', mockAdapter('claude', true)],
    ]);
    const decision = await r.route(DEFAULT_TASK);
    expect(decision.ok && decision.value.cliName).toBe('gemini');
  });

  it('skips a non-enforcing arm for a read-only task', async () => {
    const gemini = mockAdapter('gemini', undefined);
    const claude = mockAdapter('claude', true);
    const r = router([
      ['gemini', gemini],
      ['claude', claude],
    ]);

    const result = await r.executeTask(READ_ONLY);

    expect(result.ok && result.value.text).toBe('ran on claude');
    expect(gemini.execute).not.toHaveBeenCalled();
  });

  it('treats an explicit false declaration as non-enforcing', async () => {
    const r = router([
      ['gemini', mockAdapter('gemini', false)],
      ['claude', mockAdapter('claude', true)],
    ]);
    const decision = await r.route(READ_ONLY);
    expect(decision.ok && decision.value.cliName).toBe('claude');
  });

  it('fails clearly, running nothing, when no arm enforces the mode', async () => {
    const gemini = mockAdapter('gemini', undefined);
    const codex = mockAdapter('codex', false);
    const r = router([
      ['gemini', gemini],
      ['codex', codex],
    ]);

    const result = await r.executeTask(READ_ONLY);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/No routing arm enforces read-only analysis mode/);
    expect((result.error as { stage?: string }).stage).toBe('access-mode');
    expect(gemini.execute).not.toHaveBeenCalled();
    expect(codex.execute).not.toHaveBeenCalled();
  });
});

describe('a routing-memory pick outside the read-only candidates (#6768)', () => {
  /** Scoring ON (default config); gemini does not enforce, claude and codex do. */
  function scoredArms(): {
    router: InstanceType<typeof CompositeRouter>;
    gemini: ICliAdapter;
  } {
    const gemini = mockAdapter('gemini', undefined);
    const arms = new Map<RoutingArmId, ICliAdapter>([
      ['gemini', gemini],
      ['claude', mockAdapter('claude', true)],
      ['codex', mockAdapter('codex', true)],
    ]);
    return { router: new CompositeRouter(arms), gemini };
  }

  it('the forced memory pick wins a default task (control: unchanged behaviour)', async () => {
    forcedMemory.slot = 'gemini';
    const decision = await scoredArms().router.route(DEFAULT_TASK);
    expect(decision.ok && decision.value.cliName).toBe('gemini');
  });

  it('a default task without a memory pick routes as before', async () => {
    const decision = await scoredArms().router.route(DEFAULT_TASK);
    expect(decision.ok && decision.value.cliName).toBe(BASELINE_DEFAULT_ARM);
  });

  it('falls back to an enforcing arm instead of failing the read-only route', async () => {
    forcedMemory.slot = 'gemini';
    const { router, gemini } = scoredArms();

    const decision = await router.route(READ_ONLY);

    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(['claude', 'codex']).toContain(decision.value.cliName);
    expect(decision.value.adapter.enforcesReadOnlyAnalysis).toBe(true);
    const run = await router.executeTask(READ_ONLY);
    expect(run.ok).toBe(true);
    expect(gemini.execute).not.toHaveBeenCalled();
  });
});

describe('armsForAccessMode (#6768)', () => {
  const adapters = new Map<RoutingArmId, ICliAdapter>([
    ['gemini', mockAdapter('gemini', undefined)],
    ['claude', mockAdapter('claude', true)],
  ]);

  it('keeps every arm for a default task', () => {
    const arms = armsForAccessMode(DEFAULT_TASK, ['gemini', 'claude'], adapters);
    expect(arms.ok && arms.value).toEqual(['gemini', 'claude']);
  });

  it('keeps only enforcing arms for a read-only task', () => {
    const arms = armsForAccessMode(READ_ONLY, ['gemini', 'claude'], adapters);
    expect(arms.ok && arms.value).toEqual(['claude']);
  });

  it('fails a read-only task with no candidate arms at all', () => {
    const arms = armsForAccessMode(READ_ONLY, [], adapters);
    expect(arms.ok).toBe(false);
  });
});
