/** Exercise actual router tier wiring, not just the standalone resolver (#7423). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildGatewaySlotRouterArm } from './gateway-slot-arm.js';
import {
  setGatewaySlotCatalog,
  _resetGatewaySlotCatalog,
} from '../adapters/gateway-family-slots.js';
import { fakeGatewayModel } from '../testing/adapters/fake-gateway-model.js';
import { CompositeRouter } from './composite-router.js';
import { GeminiCliAdapter } from './adapters/gemini-adapter.js';
import { ZeroRouter } from './zero-router.js';
import { createModelToCliAdapter } from './model-to-cli-adapter.js';
import type { IModelAdapter } from '../core/index.js';
import type { CliTask, ICliAdapter, RoutingArmId } from './types.js';
import * as agyMap from '../config/agy-model-map.js';
import { getCliModelName } from '../config/model-config-helpers.js';

const originalEstimate = ZeroRouter.prototype.estimateDifficulty;
beforeEach(() => {
  vi.stubEnv('NEXUS_ROUTE_MODEL_SELECTION', '1');
  vi.spyOn(ZeroRouter.prototype, 'estimateDifficulty').mockImplementation(function (
    this: ZeroRouter,
    task: CliTask
  ) {
    return { ...originalEstimate.call(this, task), recommendedTier: 'powerful' };
  });
});
afterEach(() => {
  _resetGatewaySlotCatalog();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function routerFor(arm: RoutingArmId, adapter: ICliAdapter): CompositeRouter {
  return new CompositeRouter(new Map([[arm, adapter]]), {
    enableZeroRouter: true,
    enableBudgetFilter: false,
    enableTopsisRanking: false,
    enableLinUCBSelection: false,
    enableCapacityBalancing: false,
    enableRoutingMemory: false,
    enableStrategyDistillation: false,
  });
}

function apiBridge(): ICliAdapter {
  const model = {
    providerId: 'google',
    modelId: getCliModelName('gemini-3-pro'),
    capabilities: [],
    complete: vi.fn(),
    stream: vi.fn(),
    countTokens: vi.fn(),
    validateConfig: vi.fn(),
  } as unknown as IModelAdapter;
  return createModelToCliAdapter(model, { name: 'gemini' });
}

describe('AGY-only tier availability (#7423)', () => {
  it('selects the actual available Flash model for a powerful native CLI task', async () => {
    const router = routerFor('gemini', new GeminiCliAdapter());
    const result = await router.route({ content: 'Explain this code' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.difficultyTier).toBe('powerful');
      expect(result.value.model).toBe('gemini-3.8-flash');
    }
  });

  it('names an empty reverse-map eligibility set by retaining the supported Flash default', async () => {
    vi.spyOn(agyMap, 'fromAgyModelSlug').mockReturnValue(null);
    const router = routerFor('gemini', new GeminiCliAdapter());
    const result = await router.route({ content: 'Explain this code' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.model).toBe('gemini-3.8-flash');
  });

  it.each(['api:google', 'gemini'] as const)(
    'does not apply native availability to the API bridge on %s',
    async (arm) => {
      const adapter = apiBridge();
      // Both transports say subprocess; identity must not be inferred from this marker.
      expect(adapter.transport).toBe('subprocess');
      const router = routerFor(arm, adapter);
      const result = await router.route({ content: 'Explain this code' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.difficultyTier).toBe('powerful');
        expect(result.value.model).toBe('gemini-3-pro');
      }
    }
  );
});

it('does not constrain a gateway-backed Gemini slot to native AGY availability', async () => {
  vi.stubEnv('NEXUS_DISABLED_CLIS', 'gemini');
  setGatewaySlotCatalog([fakeGatewayModel('gemini-3.1-pro-preview', 'api:openai-compat')]);
  const createCli = vi.fn(() => new GeminiCliAdapter());
  const arm = buildGatewaySlotRouterArm('gemini', createCli, () => Promise.resolve(false));
  expect(arm).toBeDefined();
  expect(arm).not.toBe('unavailable');
  if (arm === undefined || arm === 'unavailable') return;
  const result = await routerFor('gemini', arm).route({ content: 'Explain this code' });
  expect(result.ok).toBe(true);
  if (result.ok) expect(result.value.model).toBe('gemini-3-pro');
  expect(createCli).not.toHaveBeenCalled();
  await arm.dispose();
});
