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

// Lets one test force the pipeline's selection past the candidate filter, the
// way a routing-memory recommendation (a display slot) can.
const { forcedSelection } = vi.hoisted(() => ({
  forcedSelection: { arm: undefined as string | undefined },
}));
vi.mock('./composite-router-stages.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./composite-router-stages.js')>();
  return {
    ...actual,
    runPipeline: async (...args: Parameters<typeof actual.runPipeline>) => {
      const result = await actual.runPipeline(...args);
      if (!result.ok || forcedSelection.arm === undefined) return result;
      return { ...result, value: { ...result.value, selectedCli: forcedSelection.arm } };
    },
  };
});

const { CompositeRouter } = await import('./composite-router.js');
const { armsForAccessMode, selectedArmAccessRefusal } =
  await import('./composite-router-access-mode.js');

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

function router(
  arms: ReadonlyArray<readonly [RoutingArmId, ICliAdapter]>
): InstanceType<typeof CompositeRouter> {
  return new CompositeRouter(new Map(arms), FIRST_CANDIDATE_CONFIG);
}

beforeEach(() => {
  forcedSelection.arm = undefined;
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

  it('refuses a selection that lands on a non-enforcing arm after the filter', async () => {
    const gemini = mockAdapter('gemini', undefined);
    const r = router([
      ['gemini', gemini],
      ['claude', mockAdapter('claude', true)],
    ]);
    forcedSelection.arm = 'gemini';

    const result = await r.executeTask(READ_ONLY);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/Selected arm gemini does not enforce/);
    expect(gemini.execute).not.toHaveBeenCalled();
  });
});

describe('armsForAccessMode / selectedArmAccessRefusal (#6768)', () => {
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

  it('treats an arm with no adapter as non-enforcing', () => {
    expect(selectedArmAccessRefusal(READ_ONLY, 'codex', undefined)).toBeDefined();
    expect(selectedArmAccessRefusal(DEFAULT_TASK, 'codex', undefined)).toBeUndefined();
    expect(selectedArmAccessRefusal(READ_ONLY, 'claude', adapters.get('claude'))).toBeUndefined();
  });
});
