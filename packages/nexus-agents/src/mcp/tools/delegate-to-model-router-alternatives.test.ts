/** Alternative identity is captured from actual route targets (#7430). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ok, err, type IModelAdapter } from '../../core/index.js';
import { CompositeRouter } from '../../cli-adapters/composite-router.js';
import type { CompositeRoutingDecision } from '../../cli-adapters/composite-router-types.js';
import type { ICliAdapter, RoutingArmId } from '../../cli-adapters/types.js';
import { createModelToCliAdapter } from '../../cli-adapters/model-to-cli-adapter.js';
import { GeminiCliAdapter } from '../../cli-adapters/adapters/gemini-adapter.js';
import { createCliError } from '../../cli-adapters/cli-error-helpers.js';
import { buildGatewaySlotRouterArm } from '../../cli-adapters/gateway-slot-arm.js';
import {
  setGatewaySlotCatalog,
  _resetGatewaySlotCatalog,
} from '../../adapters/gateway-family-slots.js';
import { DEFAULT_MODEL_PER_CLI } from '../../config/in-tree-data.js';
import { UNRESOLVED_MODEL_ID } from '../../config/model-equivalence.js';
import { mapCompositeDecisionToOutput } from './delegate-to-model-router.js';

const providerCall = vi.fn((): never => {
  throw new Error('This route-only test must never invoke a provider');
});
const owned: ICliAdapter[] = [];
const originalDefault = DEFAULT_MODEL_PER_CLI.gemini;

function model(modelId: string): IModelAdapter {
  return {
    providerId: 'openai',
    modelId,
    capabilities: [],
    complete: providerCall,
    stream: providerCall,
    countTokens: () => Promise.resolve(1),
    validateConfig: () => ok(undefined),
  };
}

function bridge(modelId: string, name: 'claude' | 'gemini' = 'claude'): ICliAdapter {
  const adapter = createModelToCliAdapter(model(modelId), { name });
  owned.push(adapter);
  return adapter;
}

function router(alternative: ICliAdapter, arm: RoutingArmId = 'gemini'): CompositeRouter {
  return new CompositeRouter(
    new Map([
      ['claude', bridge('claude-fable-5')],
      [arm, alternative],
    ]),
    {
      enableZeroRouter: false,
      enablePreferenceRouting: false,
      enableCapabilityMatch: false,
      enableBudgetFilter: false,
      enableTopsisRanking: false,
      enableLinUCBSelection: false,
      enableCapacityBalancing: false,
      enableRoutingMemory: false,
      enableStrategyDistillation: false,
      enableQualityConstraint: false,
      enableResourceStrategy: false,
    }
  );
}

async function decision(instance: CompositeRouter): Promise<CompositeRoutingDecision> {
  const result = await instance.route({ content: 'Read-only preview' });
  expect(result.ok).toBe(true);
  if (!result.ok) throw result.error;
  expect(result.value.cliName).toBe('claude');
  return result.value;
}

function gateway(modelId = 'gemini-3.1-pro-preview'): ICliAdapter {
  vi.stubEnv('NEXUS_DISABLED_CLIS', 'gemini');
  setGatewaySlotCatalog([model(modelId)]);
  const arm = buildGatewaySlotRouterArm(
    'gemini',
    () => {
      throw new Error('Disabled native arm must not be acquired');
    },
    () => Promise.resolve(false)
  );
  if (arm === undefined || arm === 'unavailable') throw new Error('Expected gateway arm');
  owned.push(arm);
  return arm;
}

beforeEach(() => vi.stubEnv('NEXUS_DISABLED_CLIS', ''));
afterEach(async () => {
  await Promise.all(owned.splice(0).map(async (adapter) => adapter.dispose()));
  _resetGatewaySlotCatalog();
  DEFAULT_MODEL_PER_CLI.gemini = originalDefault;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  expect(providerCall).not.toHaveBeenCalled();
  providerCall.mockClear();
});

describe('actual route-to-output alternative descriptors', () => {
  it('preserves a native alternative whose declared identity is established', async () => {
    const native = new GeminiCliAdapter();
    owned.push(native);
    const output = mapCompositeDecisionToOutput(await decision(router(native)), 1000);
    expect(output.alternatives[0]?.model).toBe(native.getModelInfo().id);
  });

  it.each(['gemini-3.8-flash', 'gemini-3-pro'] as const)(
    'describes gateway Pro independently of the native default %s',
    async (nativeDefault) => {
      DEFAULT_MODEL_PER_CLI.gemini = nativeDefault;
      const output = mapCompositeDecisionToOutput(await decision(router(gateway())), 1000);
      expect(output.alternatives).toHaveLength(1);
      expect(output.alternatives[0]?.model).toBe('gemini-3.1-pro-preview');
      expect(output.alternatives[0]?.tradeoff).toContain(
        "not ranked — score shown is the selected model's, not this alternative's; "
      );
    }
  );

  it('uses actual API identity rather than the vendor default', async () => {
    const output = mapCompositeDecisionToOutput(
      await decision(router(bridge('gemini-3.1-pro-preview', 'gemini'), 'api:google')),
      1000
    );
    expect(output.alternatives[0]?.model).toBe('gemini-3.1-pro-preview');
  });

  it('retains established endpoint alternatives and discloses unknown quality', async () => {
    const output = mapCompositeDecisionToOutput(
      await decision(router(bridge('unknown-gateway-model'), 'api:custom-preview')),
      1000
    );
    expect(output.alternatives[0]?.model).toBe('unknown-gateway-model');
    expect(output.alternatives[0]?.tradeoff).toContain('unmeasured');
    expect(output.alternatives[0]?.tradeoff).not.toContain('faster');
  });

  it('omits legacy identities that were not established, preserving the empty case', async () => {
    const current = await decision(router(gateway()));
    const legacy = { ...current, alternativeDescriptors: undefined };
    expect(mapCompositeDecisionToOutput(legacy, 1000).alternatives).toEqual([]);
    expect(
      mapCompositeDecisionToOutput({ ...current, alternatives: [] }, 1000).alternatives
    ).toEqual([]);
  });

  it('copies capability values rather than retaining the adapter object', async () => {
    const alternative = bridge('gemini-3.1-pro-preview', 'gemini');
    const current = await decision(router(alternative, 'api:google'));
    const captured = current.alternativeDescriptors?.get('api:google');
    expect(captured?.capabilities).toEqual(alternative.capabilities);
    expect(captured?.capabilities).not.toBe(alternative.capabilities);
    expect(Object.isFrozen(captured)).toBe(true);
    expect(Object.isFrozen(captured?.capabilities)).toBe(true);
    Object.assign(alternative.capabilities, { reasoning: 1 });
    expect(captured?.capabilities.reasoning).not.toBe(1);
  });

  it.each(['', UNRESOLVED_MODEL_ID])('omits an unestablished target %s', async (id) => {
    const current = await decision(router(bridge(id), 'api:unknown-target'));
    expect(mapCompositeDecisionToOutput(current, 1000).alternatives).toEqual([]);
  });

  it('does not turn unavailable optional metadata into a routing failure', async () => {
    const alternative = bridge('unknown-gateway-model');
    vi.spyOn(alternative, 'getModelInfo').mockImplementation(() => {
      throw new Error('Controlled unavailable metadata');
    });
    const current = await decision(router(alternative, 'api:unavailable-metadata'));
    expect(mapCompositeDecisionToOutput(current, 1000).alternatives).toEqual([]);
  });

  it('copies only the public capability fields, excluding unrelated adapter metadata', async () => {
    const alternative = bridge('gemini-3.1-pro-preview', 'gemini');
    Object.assign(alternative.capabilities, { endpointConfig: 'nonsecret-private-fixture' });
    const current = await decision(router(alternative, 'api:google'));
    const captured = current.alternativeDescriptors?.get('api:google');
    expect(captured?.modelId).toBe('gemini-3.1-pro-preview');
    expect(Object.keys(captured?.capabilities ?? {})).toHaveLength(5);
    expect(captured?.capabilities).not.toHaveProperty('endpointConfig');
  });

  it('keeps earlier alternatives stable when a reused slot changes its target', async () => {
    setGatewaySlotCatalog([model('gemini-3.1-pro-preview')]);
    const native = new GeminiCliAdapter();
    let nativeAvailable = true;
    vi.spyOn(native, 'execute').mockResolvedValue(
      err(createCliError('NOT_FOUND', 'Controlled native boundary unavailable', 'gemini'))
    );
    const arm = buildGatewaySlotRouterArm(
      'gemini',
      () => native,
      () => Promise.resolve(nativeAvailable)
    );
    if (arm === undefined || arm === 'unavailable') throw new Error('Expected combined arm');
    owned.push(arm);
    const instance = router(arm);
    const first = await decision(instance);
    const firstModel = mapCompositeDecisionToOutput(first, 1000).alternatives[0]?.model;
    expect(firstModel).toBe(originalDefault);
    nativeAvailable = false;
    await arm.execute({ content: 'Controlled unavailable native boundary' });
    const second = await decision(instance);
    expect(mapCompositeDecisionToOutput(second, 1000).alternatives[0]?.model).toBe(
      'gemini-3.1-pro-preview'
    );
    expect(mapCompositeDecisionToOutput(first, 1000).alternatives[0]?.model).toBe(firstModel);
  });
});
