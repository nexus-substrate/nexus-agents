/** Actual router consumers must distinguish native Flash from API Pro (#7423). */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IModelAdapter, TaskProfile } from '../core/index.js';
import type { QualityConstraintConfig } from './routing/stages/quality-constraint-stage.js';
import { CompositeRouter } from './composite-router.js';
import { createModelToCliAdapter } from './model-to-cli-adapter.js';
import { GeminiCliAdapter } from './adapters/gemini-adapter.js';
import { ClaudeCliAdapter } from './adapters/claude-adapter.js';
import { applyTopsisRanking } from './composite-router-helpers.js';
import { TopsisRouter } from './topsis-router.js';
import { DEFAULT_MODEL_PER_CLI } from '../config/in-tree-data.js';
import { getDefaultRegistry } from '../config/model-registry.js';
import type { ICliAdapter, RoutingArmId } from './types.js';

function apiPro(): ICliAdapter {
  return createModelToCliAdapter({ modelId: 'gemini-3.1-pro-preview' } as IModelAdapter, {
    name: 'gemini',
    capabilities: { reasoning: 10, codeGeneration: 9, speed: 8, cost: 6, contextWindow: 1_048_576 },
  });
}

function router(
  adapters: Map<RoutingArmId, ICliAdapter>,
  minQuality = 0,
  maxCostUsd = 0.01,
  overrides: Partial<QualityConstraintConfig> = {}
): CompositeRouter {
  return new CompositeRouter(adapters, {
    enableBudgetFilter: false,
    enableTopsisRanking: false,
    enableLinUCBSelection: false,
    enableCapacityBalancing: false,
    enableRoutingMemory: false,
    enableStrategyDistillation: false,
    enableResourceStrategy: false,
    enableQualityConstraint: true,
    qualityConstraintConfig: {
      minQuality,
      maxCostUsd,
      maxLatencyMs: 100_000,
      expectedTokens: 1500,
      allowFallback: false,
      ...overrides,
    },
  });
}

function priceClaudeControl(unpricedApi = false): void {
  const registry = getDefaultRegistry();
  const getEntry = registry.getEntry.bind(registry);
  const claude = getEntry(DEFAULT_MODEL_PER_CLI.claude).id;
  vi.spyOn(registry, 'getEntry').mockImplementation((id) => {
    const entry = { ...getEntry(id) };
    if (unpricedApi && entry.id === 'gemini-3-pro') delete entry.pricing;
    return entry.id === claude
      ? { ...entry, pricing: { inputPer1M: 0.01, outputPer1M: 0.01 } }
      : entry;
  });
}

afterEach(() => vi.restoreAllMocks());

const task: TaskProfile = {
  taskType: 'general',
  reasoningComplexity: 5,
  contextRequired: 5000,
  codeGeneration: false,
  multimodal: false,
  parallelizable: false,
  budgetSensitive: true,
};

describe('actual-arm API quality constraints', () => {
  it('rejects the API Pro bound above a ceiling while admitting a cheap control', async () => {
    priceClaudeControl();
    const result = await router(
      new Map([
        ['api:google', apiPro()],
        ['claude', new ClaudeCliAdapter()],
      ])
    ).route({ content: 'bounded task' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.cliName).toBe('claude');
  });

  it('rejects API Pro alone when the configured cost bound fails and fallback is disabled', async () => {
    const result = await router(new Map([['api:google', apiPro()]])).route({
      content: 'bounded task',
    });
    expect(result.ok).toBe(false);
  });

  it('keeps native Flash admissible when the simultaneous API Pro arm exceeds its ceiling', async () => {
    const result = await router(
      new Map([
        ['api:google', apiPro()],
        ['gemini', new GeminiCliAdapter()],
      ])
    ).route({ content: 'bounded task' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.cliName).toBe('gemini');
  });

  it('keeps API Pro admissible when the simultaneous native Flash arm lacks required quality', async () => {
    const result = await router(
      new Map([
        ['gemini', new GeminiCliAdapter()],
        ['api:google', apiPro()],
      ]),
      0.9,
      1
    ).route({ content: 'bounded task' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.cliName).toBe('api:google');
  });

  it('fails closed for missing API pricing instead of using priced native Flash', async () => {
    priceClaudeControl(true);
    const result = await router(
      new Map([
        ['api:google', apiPro()],
        ['claude', new ClaudeCliAdapter()],
      ])
    ).route({ content: 'bounded task' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.cliName).toBe('claude');
  });
});

describe('actual-arm price absence, free and token split controls', () => {
  it('does not turn unknown API pricing into a fallback candidate', async () => {
    priceClaudeControl(true);
    const result = await router(new Map([['api:google', apiPro()]]), 0, 0.01, {
      allowFallback: true,
    }).route({ content: 'bounded task' });
    expect(result.ok).toBe(false);
  });

  it('accepts explicit canonical free pricing at a zero ceiling', async () => {
    const registry = getDefaultRegistry();
    const original = registry.getEntry.bind(registry);
    vi.spyOn(registry, 'getEntry').mockImplementation((id) => {
      const entry = original(id);
      return entry.id === 'gemini-3-pro'
        ? { ...entry, pricing: { inputPer1M: 0, outputPer1M: 0 } }
        : entry;
    });
    const result = await router(new Map([['api:google', apiPro()]]), 0, 0).route({
      content: 'free task',
    });
    expect(result.ok).toBe(true);
  });

  it.each([
    { label: 'unknown', split: {}, accepted: false },
    { label: 'incomplete', split: { expectedInputTokens: 0 }, accepted: false },
    {
      label: 'complete cheap output',
      split: { expectedInputTokens: 0, expectedOutputTokens: 1_000_000 },
      accepted: true,
    },
    {
      label: 'complete expensive input',
      split: { expectedInputTokens: 1_000_000, expectedOutputTokens: 0 },
      accepted: false,
    },
  ])('uses canonical API rates for $label split', async ({ split, accepted }) => {
    const registry = getDefaultRegistry();
    const original = registry.getEntry.bind(registry);
    vi.spyOn(registry, 'getEntry').mockImplementation((id) => {
      const entry = original(id);
      return entry.id === 'gemini-3-pro'
        ? { ...entry, pricing: { inputPer1M: 20, outputPer1M: 1 } }
        : entry;
    });
    const result = await router(new Map([['api:google', apiPro()]]), 0, 2, {
      expectedTokens: 1_000_000,
      ...split,
    }).route({ content: 'bounded task' });
    expect(result.ok).toBe(accepted);
  });

  it('leaves TOPSIS confidence absent when the sole API profile is unpriced', async () => {
    priceClaudeControl(true);
    const r = new CompositeRouter(new Map([['api:google', apiPro()]]), {
      enableBudgetFilter: false,
      enableTopsisRanking: true,
      enableLinUCBSelection: false,
      enableCapacityBalancing: false,
      enableRoutingMemory: false,
      enableStrategyDistillation: false,
      enableQualityConstraint: false,
    });
    const result = await r.route({ content: 'unpriced task' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.topsisScore).toBeUndefined();
  });
});

describe('actual-arm API TOPSIS profiles', () => {
  it('does not give simultaneous native Flash and API Pro one shared score', () => {
    const adapters = new Map<RoutingArmId, ICliAdapter>([
      ['gemini', new GeminiCliAdapter()],
      ['api:google', apiPro()],
    ]);
    const result = applyTopsisRanking(
      task,
      [...adapters.keys()],
      new TopsisRouter(),
      Object.assign({ billingMode: 'api' as const }, { adapters })
    );
    expect(result.scoresByArm?.has('gemini')).toBe(true);
    expect(result.scoresByArm?.has('api:google')).toBe(true);
    expect(result.scoresByArm?.get('gemini')).not.toBe(result.scoresByArm?.get('api:google'));
  });

  it('keeps an unchanged API model score invariant when only the native default changes', () => {
    const previous = DEFAULT_MODEL_PER_CLI.gemini;
    const adapters = new Map<RoutingArmId, ICliAdapter>([
      ['api:google', apiPro()],
      ['claude', new ClaudeCliAdapter()],
    ]);
    const scores: Array<number | undefined> = [];
    try {
      for (const nativeDefault of ['gemini-3-pro', 'gemini-3.8-flash'] as const) {
        DEFAULT_MODEL_PER_CLI.gemini = nativeDefault;
        const result = applyTopsisRanking(
          task,
          [...adapters.keys()],
          new TopsisRouter(),
          Object.assign({ billingMode: 'api' as const }, { adapters })
        );
        scores.push(result.scoresByArm?.get('api:google'));
      }
      expect(scores[0]).toBeDefined();
      expect(scores[1]).toBe(scores[0]);
    } finally {
      DEFAULT_MODEL_PER_CLI.gemini = previous;
    }
  });
});
