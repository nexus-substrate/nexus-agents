/** Price-basis evidence at the task-class ceiling (#5095). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BudgetRouter } from './budget-router.js';
import type { CliTask, RoutingArmId } from './types.js';
import { recordCeilingCostOfArm } from './budget-arm-cost.js';
import { priceBasisCaveat } from '../core/price-basis.js';

const log = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock('../core/logger.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../core/logger.js')>();
  return {
    ...actual,
    createLogger: vi.fn(() => ({ ...log, child: () => log, setLevel: vi.fn() })),
  };
});

describe('task-class ceiling price-basis evidence (#5095)', () => {
  const task: CliTask = { content: 'implement a function', maxTokens: 10_000 };
  let router: BudgetRouter;

  beforeEach(() => {
    vi.stubEnv('NEXUS_BILLING_MODE', 'api');
    vi.stubEnv('NEXUS_GATEWAY_COST', 'priced');
    vi.stubEnv('NEXUS_CUSTOM_MODEL', 'totally-unknown-gateway-model-xyz');
    router = new BudgetRouter(new Map(), {
      taskClassCostCeilings: { code_generation: 0.2 },
      sessionBudget: { resetIntervalMs: 0 },
    });
  });

  afterEach(() => {
    router.dispose();
    vi.unstubAllEnvs();
  });

  it('admits a list candidate under the ceiling with a warning and caveat', () => {
    expect(router.filterByTaskClassCeiling(task, ['gemini'])).toEqual(['gemini']);
    expect(log.warn).toHaveBeenCalledWith('Cost ceiling: candidate evaluated', {
      arm: 'gemini',
      ceiling: 0.2,
      cost: expect.any(Number),
      priceBasis: 'list',
      ceilingMeasurement: 'estimated',
      withinCeiling: true,
      caveat: priceBasisCaveat('list'),
    });
    expect(log.info).not.toHaveBeenCalledWith(
      'Cost ceiling: candidate evaluated',
      expect.anything()
    );
  });

  it('drops a list candidate over the ceiling at info with no caveat or warning', () => {
    expect(router.filterByTaskClassCeiling(task, ['claude'])).toEqual([]);
    expect(log.info).toHaveBeenCalledWith('Cost ceiling: candidate evaluated', {
      arm: 'claude',
      ceiling: 0.2,
      cost: expect.any(Number),
      priceBasis: 'list',
      ceilingMeasurement: 'estimated',
      withinCeiling: false,
    });
    expect(log.warn).not.toHaveBeenCalled();
  });

  it.each(['codex', 'api:custom-openai'] as const)(
    'records unknown basis and an unmeasured ceiling for unpriced %s',
    (arm) => {
      expect(router.filterByTaskClassCeiling(task, [arm])).toEqual([]);
      expect(log.info).toHaveBeenCalledWith('Cost ceiling: candidate evaluated', {
        arm,
        ceiling: 0.2,
        priceBasis: 'unknown',
        ceilingMeasurement: 'unmeasured',
        withinCeiling: false,
      });
      expect(log.warn).not.toHaveBeenCalled();
    }
  );

  it.each(['free', 'local'])('records an explicitly %s gateway as declared', (declaration) => {
    vi.stubEnv('NEXUS_GATEWAY_COST', declaration);
    expect(router.filterByTaskClassCeiling(task, ['api:custom-openai'])).toEqual([
      'api:custom-openai',
    ]);
    expect(log.info).toHaveBeenCalledWith('Cost ceiling: candidate evaluated', {
      arm: 'api:custom-openai',
      cost: 0,
      ceiling: 0.2,
      priceBasis: 'declared',
      ceilingMeasurement: 'estimated',
      withinCeiling: true,
    });
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('admits explicit declared rates under the ceiling at info with no caveat or warning', () => {
    vi.stubEnv('NEXUS_GATEWAY_COST', 'priced:2,10');
    expect(router.filterByTaskClassCeiling(task, ['api:custom-openai'])).toEqual([
      'api:custom-openai',
    ]);
    expect(log.info).toHaveBeenCalledWith('Cost ceiling: candidate evaluated', {
      arm: 'api:custom-openai',
      cost: expect.any(Number),
      ceiling: 0.2,
      priceBasis: 'declared',
      ceilingMeasurement: 'estimated',
      withinCeiling: true,
    });
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('drops declared rates over the ceiling at info with no caveat or warning', () => {
    vi.stubEnv('NEXUS_GATEWAY_COST', 'priced:50,50');
    expect(router.filterByTaskClassCeiling(task, ['api:custom-openai'])).toEqual([]);
    expect(log.info).toHaveBeenCalledWith('Cost ceiling: candidate evaluated', {
      arm: 'api:custom-openai',
      cost: expect.any(Number),
      ceiling: 0.2,
      priceBasis: 'declared',
      ceilingMeasurement: 'estimated',
      withinCeiling: false,
    });
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('records explicit gateway rates as declared while bare priced remains list', () => {
    const target = { arm: 'api:custom-openai' as const, adapter: undefined };
    expect(
      recordCeilingCostOfArm(target, 1_000_000, 500_000, 10, {
        NEXUS_GATEWAY_COST: 'priced:2,10',
      })
    ).toEqual({ costUsd: 7, priceBasis: 'declared' });
    expect(
      recordCeilingCostOfArm(target, 1_000, 200, 10, {
        NEXUS_GATEWAY_COST: 'priced',
        NEXUS_CUSTOM_MODEL: 'claude-sonnet-4-6',
      })
    ).toEqual({ costUsd: expect.any(Number), priceBasis: 'list' });
  });

  it('names the empty pool: no candidates and no candidate measurements', () => {
    expect(router.filterByTaskClassCeiling(task, [])).toEqual([]);
    expect(log.warn).not.toHaveBeenCalled();
    expect(log.info).not.toHaveBeenCalledWith(
      'Cost ceiling: candidate evaluated',
      expect.anything()
    );
  });

  it('does not record a ceiling measurement when no ceiling is configured', () => {
    const disabled = new BudgetRouter(new Map(), { sessionBudget: { resetIntervalMs: 0 } });
    try {
      expect(disabled.filterByTaskClassCeiling(task, ['codex'])).toEqual(['codex']);
      expect(disabled.filterByTaskClassCeiling(task, ['gemini'])).toEqual(['gemini']);
      expect(log.warn).not.toHaveBeenCalled();
      expect(log.info).not.toHaveBeenCalledWith(
        'Cost ceiling: candidate evaluated',
        expect.anything()
      );
    } finally {
      disabled.dispose();
    }
  });

  it('preserves byte-identical routing choices for the fixed pre-plumbing fixture', () => {
    const candidates: RoutingArmId[] = ['claude', 'gemini', 'codex', 'api:custom-openai'];
    const declarations = [undefined, 'priced', 'free', 'local', 'priced:2,10', 'priced:50,50'];
    const choices = declarations.map((declaration) => {
      vi.stubEnv('NEXUS_GATEWAY_COST', declaration);
      return router.filterByTaskClassCeiling(task, candidates);
    });
    // Captured against the unchanged implementation before #5095 plumbing.
    expect(JSON.stringify(choices)).toBe(
      '[["gemini"],["gemini"],["gemini","api:custom-openai"],["gemini","api:custom-openai"],["gemini","api:custom-openai"],["gemini"]]'
    );
  });
});
