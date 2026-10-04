/** Price-basis evidence at the task-class ceiling (#5095). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BudgetRouter } from './budget-router.js';
import type { CliTask, RoutingArmId } from './types.js';

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

  it.each([
    { arm: 'gemini', withinCeiling: true },
    { arm: 'claude', withinCeiling: false },
  ] as const)(
    'records list basis for $arm with withinCeiling=$withinCeiling',
    ({ arm, withinCeiling }) => {
      router.filterByTaskClassCeiling(task, [arm]);
      expect(log.info).toHaveBeenCalledWith(
        'Cost ceiling: candidate evaluated',
        expect.objectContaining({
          arm,
          ceiling: 0.2,
          cost: expect.any(Number),
          priceBasis: 'list',
          ceilingMeasurement: 'estimated',
          withinCeiling,
        })
      );
    }
  );

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
    }
  );

  it('records an explicitly free gateway as priced, rather than unmeasured', () => {
    vi.stubEnv('NEXUS_GATEWAY_COST', 'free');
    expect(router.filterByTaskClassCeiling(task, ['api:custom-openai'])).toEqual([
      'api:custom-openai',
    ]);
    expect(log.info).toHaveBeenCalledWith('Cost ceiling: candidate evaluated', {
      arm: 'api:custom-openai',
      cost: 0,
      ceiling: 0.2,
      priceBasis: 'list',
      ceilingMeasurement: 'estimated',
      withinCeiling: true,
    });
  });

  it('names the empty pool: no candidates and no candidate measurements', () => {
    expect(router.filterByTaskClassCeiling(task, [])).toEqual([]);
    expect(log.info).not.toHaveBeenCalledWith(
      'Cost ceiling: candidate evaluated',
      expect.anything()
    );
  });

  it('does not record a ceiling measurement when no ceiling is configured', () => {
    const disabled = new BudgetRouter(new Map(), { sessionBudget: { resetIntervalMs: 0 } });
    try {
      expect(disabled.filterByTaskClassCeiling(task, ['codex'])).toEqual(['codex']);
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
