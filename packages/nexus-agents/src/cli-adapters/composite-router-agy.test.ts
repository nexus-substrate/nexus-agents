/** Exercise actual router tier wiring, not just the standalone resolver (#7423). */
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildGatewaySlotRouterArm,
  resolveGatewayServedSlot,
  gatewayServedSlotOf,
} from './gateway-slot-arm.js';
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

it.skipIf(process.platform === 'win32').each([false, true])(
  'constrains the actual native target of a gateway-capable slot (already resolved=%s)',
  async (alreadyResolved) => {
    const bin = mkdtempSync(join(tmpdir(), 'nexus-7423-native-'));
    writeFileSync(join(bin, 'agy'), '#!/bin/sh\nexit 99\n', { mode: 0o700 });
    vi.stubEnv('PATH', bin);
    vi.stubEnv('NEXUS_DISABLED_CLIS', '');
    setGatewaySlotCatalog([fakeGatewayModel('gemini-3.1-pro-preview', 'api:openai-compat')]);
    const native = new GeminiCliAdapter();
    const available = vi.fn(() => Promise.resolve(true));
    const slot = buildGatewaySlotRouterArm('gemini', () => native, available);
    expect(slot).toBeDefined();
    expect(slot).not.toBe('unavailable');
    if (slot === undefined || slot === 'unavailable') {
      rmSync(bin, { recursive: true, force: true });
      return;
    }
    try {
      if (alreadyResolved) await resolveGatewayServedSlot(slot);
      const result = await routerFor('gemini', slot).route({ content: 'Explain this code' });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.model).toBe('gemini-3.8-flash');
      expect(gatewayServedSlotOf(slot)).toBeUndefined();
      expect(available).toHaveBeenCalledTimes(1);
    } finally {
      await slot.dispose();
      rmSync(bin, { recursive: true, force: true });
    }
  }
);

it.skipIf(process.platform === 'win32')(
  'binds gateway pricing before quality filtering an undecided slot',
  async () => {
    const bin = mkdtempSync(join(tmpdir(), 'nexus-7423-gateway-price-'));
    writeFileSync(join(bin, 'agy'), '#!/bin/sh\nexit 99\n', { mode: 0o700 });
    vi.stubEnv('PATH', bin);
    vi.stubEnv('NEXUS_DISABLED_CLIS', '');
    vi.stubEnv('NEXUS_GATEWAY_COST', 'priced:2,12');
    setGatewaySlotCatalog([fakeGatewayModel('gemini-3.1-pro-preview', 'api:openai-compat')]);
    const available = vi.fn(() => Promise.resolve(false));
    const slot = buildGatewaySlotRouterArm('gemini', () => new GeminiCliAdapter(), available);
    expect(slot).toBeDefined();
    expect(slot).not.toBe('unavailable');
    if (slot === undefined || slot === 'unavailable') throw new Error('fixture slot unavailable');
    try {
      const router = new CompositeRouter(new Map([['gemini', slot]]), {
        enableBudgetFilter: false,
        enableTopsisRanking: false,
        enableLinUCBSelection: false,
        enableCapacityBalancing: false,
        enableRoutingMemory: false,
        enableStrategyDistillation: false,
        enableQualityConstraint: true,
        qualityConstraintConfig: {
          minQuality: 0,
          maxCostUsd: 0.01,
          expectedTokens: 1500,
          allowFallback: false,
        },
      });
      const result = await router.route({ content: 'bounded task' });
      // Gateway Pro costs up to $0.018; native Flash's $0.005625 must not stand in for it.
      expect(result.ok).toBe(false);
      expect(available).toHaveBeenCalledTimes(1);
      expect(gatewayServedSlotOf(slot)?.modelId).toBe('gemini-3.1-pro-preview');
    } finally {
      await slot.dispose();
      rmSync(bin, { recursive: true, force: true });
    }
  }
);
