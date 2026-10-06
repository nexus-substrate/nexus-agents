/** #7151: real gateway bootstrap -> canonical factory -> router -> outcome. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLogger, err, ModelError, ok, type IModelAdapter } from '../core/index.js';
import { wireGateway } from '../cli-server-gateway.js';
import { resetGlobalRegistry, getGlobalRegistry } from '../adapters/unified-registry.js';
import { _resetGatewaySlotCatalog } from '../adapters/gateway-family-slots.js';
import { _resetGatewayCatalogs } from '../adapters/sdk/gateway-catalog.js';
import { setGatewayRediscovery } from '../adapters/gateway-rediscovery.js';
import { recordRoutedOrchestrateOutcome } from '../cli/orchestrate-outcome.js';
import {
  OutcomeStore,
  resetOutcomeStore,
  setOutcomeStore,
} from '../orchestration/outcomes/outcome-store.js';
import { createAllAdapters } from './factory.js';
import { CompositeRouter } from './composite-router.js';
import { AvailableModelsCache } from '../config/available-models-cache.js';
import {
  CliCircuitBreakerIntegration,
  getDefaultCliCircuitBreakerRegistry,
} from './cli-circuit-breaker.js';
import { OpenCodeCliAdapter } from './adapters/opencode-adapter.js';

const discovery = vi.hoisted(() => vi.fn());
const binaryOnPath = vi.hoisted(() => vi.fn((cli: string) => cli === 'opencode'));
vi.mock('../adapters/gateway-discovery.js', () => ({ discoverGatewayOnce: discovery }));
vi.mock('./cli-binary-on-path.js', () => ({ isCliBinaryOnPath: binaryOnPath }));

const ARM = 'api:gw-prod';
const TASK = { content: 'explain parser behavior' };
const logger = createLogger({ component: '7151-test', level: 'silent' });

function gatewayModel(modelId = 'unknown-chat'): IModelAdapter & { gatewayArm: typeof ARM } {
  return {
    gatewayArm: ARM,
    providerId: 'custom-openai',
    modelId,
    capabilities: [],
    complete: vi.fn().mockResolvedValue(
      ok({
        content: [{ type: 'text', text: 'gateway result' }],
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
        stopReason: 'end_turn',
        model: modelId,
      })
    ),
    stream: vi.fn(),
    countTokens: vi.fn().mockResolvedValue(10),
    validateConfig: () => ok(undefined),
  };
}

async function boot(models = [gatewayModel()]): Promise<ReturnType<typeof createAllAdapters>> {
  discovery.mockResolvedValue(ok(models));
  // No registry injection: exactly the production default, not test-side registration.
  await wireGateway(logger);
  return createAllAdapters(logger, 'subprocess');
}

describe('opted-in endpoint arms through production wiring (#7151)', () => {
  beforeEach(() => {
    resetGlobalRegistry();
    _resetGatewaySlotCatalog();
    _resetGatewayCatalogs();
    getDefaultCliCircuitBreakerRegistry().resetAll();
    vi.stubEnv('NEXUS_OPENAI_COMPAT_URL', 'https://gateway.example/v1');
    vi.stubEnv('NEXUS_OPENAI_COMPAT_KEY', 'test-placeholder');
    vi.stubEnv('NEXUS_OPENAI_COMPAT_ENDPOINT', 'gw-prod');
    vi.stubEnv('NEXUS_SANDBOX', 'false');
    vi.stubEnv('NEXUS_ROUTE_GATEWAY_ARMS', undefined);
    vi.stubEnv('NEXUS_GATEWAY_COST', 'free');
    vi.stubEnv('NEXUS_BILLING_MODE', 'plan');
    vi.stubEnv('NEXUS_CUSTOM_MODEL', undefined);
    vi.stubEnv('NEXUS_DISABLED_CLIS', 'claude,gemini,codex');
    vi.stubEnv('NEXUS_PERSIST_LEARNING', 'false');
    vi.stubEnv('NEXUS_STRATEGY_DISTILLATION', '0');
    for (const key of [
      'ANTHROPIC_API_KEY',
      'OPENAI_API_KEY',
      'GOOGLE_AI_API_KEY',
      'NEXUS_CUSTOM_API_KEY',
    ])
      vi.stubEnv(key, undefined);
    binaryOnPath.mockImplementation((cli: string) => cli === 'opencode');
    setOutcomeStore(new OutcomeStore());
    vi.spyOn(OpenCodeCliAdapter.prototype, 'getCapacity').mockResolvedValue({
      remainingTokens: 100000,
      remainingRequests: 1000,
      resetTime: new Date(),
      utilizationPercent: 0,
      rateLimited: false,
      exhausted: false,
      quotaExhausted: false,
      observed: false,
    });
  });
  afterEach(() => {
    resetGlobalRegistry();
    _resetGatewaySlotCatalog();
    _resetGatewayCatalogs();
    setGatewayRediscovery(undefined);
    resetOutcomeStore();
    getDefaultCliCircuitBreakerRegistry().resetAll();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it.each(['plan', 'api'])('defaults to CLI-only in %s billing mode', async (mode) => {
    vi.stubEnv('NEXUS_BILLING_MODE', mode);
    const arms = await boot();
    expect(arms.has(ARM)).toBe(false);
    expect(arms.has('opencode')).toBe(true);
    if (mode === 'plan') expect([...arms.keys()]).toEqual(['opencode']);
    expect(getGlobalRegistry().getSnapshot().cachedArms).toContain(ARM);
  });

  it.each(['true', '1', 'TRUE'])('admits a declared endpoint with opt-in %s', async (flag) => {
    vi.stubEnv('NEXUS_ROUTE_GATEWAY_ARMS', flag);
    const arms = await boot();
    expect([...arms.keys()]).toEqual(['opencode', ARM]);
    expect(arms.get(ARM)?.name).toBe(ARM);
  });

  it.each(['false', '0', 'FALSE', 'yes', 'on', ''])('does not opt in for %s', async (flag) => {
    vi.stubEnv('NEXUS_ROUTE_GATEWAY_ARMS', flag);
    expect((await boot()).has(ARM)).toBe(false);
  });

  it.each(['plan', 'api'])(
    'excludes undeclared endpoints in %s mode without a budget',
    async (mode) => {
      vi.stubEnv('NEXUS_BILLING_MODE', mode);
      vi.stubEnv('NEXUS_ROUTE_GATEWAY_ARMS', 'true');
      vi.stubEnv('NEXUS_GATEWAY_COST', undefined);
      const warning = vi.spyOn(logger, 'warn');
      expect((await boot()).has(ARM)).toBe(false);
      expect(warning).toHaveBeenCalledWith(
        'Gateway routing arm excluded: NEXUS_GATEWAY_COST declaration required',
        expect.objectContaining({ arm: ARM })
      );
    }
  );

  it.each(['plan', 'api'])(
    'selects, executes, and attributes its outcome while a CLI competes in %s mode',
    async (mode) => {
      vi.stubEnv('NEXUS_BILLING_MODE', mode);
      vi.stubEnv('NEXUS_ROUTE_GATEWAY_ARMS', 'true');
      const model = gatewayModel();
      const arms = await boot([model]);
      const router = new CompositeRouter(arms);
      expect(router.getStats().banditStats).toContainEqual(
        expect.objectContaining({ name: ARM, pullCount: 3, avgReward: 0.5 })
      );
      // Recorded evidence makes the endpoint preferable, without removing its CLI competitor.
      for (let i = 0; i < 30; i++) {
        router.recordOutcome(ARM, TASK, 1);
        router.recordOutcome('opencode', TASK, 0);
      }
      const decision = await router.route(TASK);
      expect(decision.ok && decision.value.cliName).toBe(ARM);
      if (!decision.ok) throw decision.error;
      const result = await router.executeDecision(decision.value, TASK);
      recordRoutedOrchestrateOutcome(TASK.content, result);
      expect(result.ok && result.value).toMatchObject({ text: 'gateway result', routedArm: ARM });
      expect(model.complete).toHaveBeenCalledOnce();
      const { getOutcomeStore } = await import('../orchestration/outcomes/outcome-store.js');
      expect(getOutcomeStore().query({ source: 'delegate' })).toContainEqual(
        expect.objectContaining({ cli: ARM, success: true })
      );
      expect(arms.has('opencode')).toBe(true);
    }
  );

  it('replaces the legacy API route to the same endpoint only after opted-in admission', async () => {
    vi.stubEnv('NEXUS_BILLING_MODE', 'api');
    expect((await boot()).has('api:custom-openai')).toBe(true);
    vi.stubEnv('NEXUS_ROUTE_GATEWAY_ARMS', 'true');
    const arms = createAllAdapters(logger, 'subprocess');
    expect([...arms.keys()]).toEqual(['opencode', ARM]);
  });

  it('keeps endpoint identity outside disabled-CLI and available-model slot gates', async () => {
    vi.stubEnv('NEXUS_ROUTE_GATEWAY_ARMS', 'true');
    vi.stubEnv('NEXUS_DISABLED_CLIS', 'claude,gemini,codex,opencode');
    const arms = await boot();
    expect([...arms.keys()]).toEqual([ARM]);
    const cache = new AvailableModelsCache({
      sources: [{ name: 'claude', listModels: () => Promise.resolve([{ id: 'claude-opus-4-6' }]) }],
    });
    const router = new CompositeRouter(arms, { availableModelsCache: cache });
    const result = await router.route(TASK);
    expect(result.ok && result.value.cliName).toBe(ARM);
  });

  it('opens its own shared breaker and health entry, independently of opencode', async () => {
    vi.stubEnv('NEXUS_ROUTE_GATEWAY_ARMS', 'true');
    const model = gatewayModel();
    vi.mocked(model.complete).mockResolvedValue(err(new ModelError('endpoint failed')));
    const arms = await boot([model]);
    const endpoint = arms.get(ARM);
    if (endpoint === undefined) throw new Error('missing endpoint arm');
    const health = new CliCircuitBreakerIntegration([...arms.values()]);
    const breakers = getDefaultCliCircuitBreakerRegistry();
    const threshold = breakers.getArmBreaker(ARM).getSnapshot().config.failureThreshold;
    for (let i = 0; i < threshold; i++) await endpoint.execute(TASK);
    expect(breakers.getArmBreaker(ARM).getSnapshot().state).toBe('open');
    expect(health.getHealthStatus().clis).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: ARM, circuitState: 'open', healthy: false }),
        expect.objectContaining({ name: 'opencode', circuitState: 'closed', healthy: true }),
      ])
    );
  });

  it('uses ranked default rather than discovery list order', async () => {
    vi.stubEnv('NEXUS_ROUTE_GATEWAY_ARMS', 'true');
    const first = gatewayModel('unknown-small');
    const selected = gatewayModel('unknown-large');
    vi.stubEnv('NEXUS_CUSTOM_MODEL', selected.modelId);
    const endpoint = (await boot([first, selected])).get(ARM);
    expect(endpoint?.getModelInfo().id).toBe(selected.modelId);
    await endpoint?.execute(TASK);
    expect(first.complete).not.toHaveBeenCalled();
    expect(selected.complete).toHaveBeenCalledOnce();
  });

  it('reserves an endpoint for an undecided family slot to avoid a second arm', async () => {
    vi.stubEnv('NEXUS_ROUTE_GATEWAY_ARMS', 'true');
    vi.stubEnv('NEXUS_DISABLED_CLIS', 'gemini,codex');
    binaryOnPath.mockReturnValue(true);
    const arms = await boot([gatewayModel('claude-opus-4-6')]);
    expect(arms.has('claude')).toBe(true);
    expect(arms.has(ARM)).toBe(false);
  });

  it('omits an endpoint already represented by a family slot on that gateway', async () => {
    vi.stubEnv('NEXUS_ROUTE_GATEWAY_ARMS', 'true');
    const arms = await boot([gatewayModel('claude-opus-4-6')]);
    expect(arms.has('claude')).toBe(true);
    expect(arms.has(ARM)).toBe(false);
  });
});
