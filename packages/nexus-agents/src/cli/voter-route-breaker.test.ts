/** Route-aware availability after a voter pin has resolved (#7070). */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger, type IModelAdapter } from '../core/index.js';
import { CliToModelAdapter } from '../cli-adapters/cli-to-model-adapter.js';
import { OpenCodeCliAdapter } from '../cli-adapters/adapters/opencode-adapter.js';
import { ModelBoundAdapter } from '../adapters/model-bound-adapter.js';
import type { IResilientAdapter } from '../adapters/resilient-adapter-types.js';
import { unavailableSeat } from './voter-route-breaker.js';
import { breakerKeys } from '../cli-adapters/breaker-key.js';
import { getDefaultCliCircuitBreakerRegistry } from '../cli-adapters/cli-circuit-breaker.js';
import { UNRESOLVED_MODEL_ID } from '../config/model-equivalence.js';
import { executeAgentVote, resolveGatewayRoleAdapters } from './voter-agents.js';

const logger = createLogger({ component: 'voter-route-breaker-test' });
const breakers = getDefaultCliCircuitBreakerRegistry();

function seat(modelId: string): IModelAdapter {
  const adapter = new CliToModelAdapter(new OpenCodeCliAdapter({ model: modelId }));
  vi.spyOn(adapter, 'complete');
  return adapter;
}

function open(model: string): void {
  const breaker = breakers.getArmBreaker(breakerKeys.forArm({ name: 'opencode', model }));
  for (let i = 0; i < breaker.getSnapshot().config.failureThreshold; i++) {
    breaker.recordFailure('unknown');
  }
}

afterEach(() => {
  breakers.resetAll();
  vi.unstubAllEnvs();
});

describe('resolved voter route breaker (#7070)', () => {
  it.each([
    ['opencode-custom-sonnet', 'opencode-default'],
    ['opencode-default', 'opencode-custom-sonnet'],
  ])('marks pinned %s unavailable while %s remains usable', async (failedModel, healthyModel) => {
    const failed = seat(failedModel);
    const healthy = seat(healthyModel);
    vi.stubEnv('NEXUS_VOTER_MODEL_ARCHITECT', failedModel);
    vi.stubEnv('NEXUS_VOTER_MODEL_SECURITY', healthyModel);
    const assigned = resolveGatewayRoleAdapters(
      ['architect', 'security'],
      [failed, healthy],
      healthy,
      logger
    );
    open(failedModel);
    const rejected = await executeAgentVote(
      'architect',
      'Review artifact',
      assigned.get('architect') ?? failed,
      logger,
      { maxRetries: 0 }
    );
    expect(rejected.source).toBe('error');
    expect(rejected.error).toContain('circuit breaker open');
    expect(failed.complete).not.toHaveBeenCalled();
    expect(
      breakers.isArmOpen(breakerKeys.forArm({ name: 'opencode', model: healthy.modelId }))
    ).toBe(false);
    // A healthy seat reaches the execution boundary. Its stub rejection proves
    // the route gate admitted it without needing a live voter response.
    vi.mocked(healthy.complete).mockRejectedValueOnce(new Error('healthy seat dispatched'));
    const admitted = await executeAgentVote(
      'security',
      'Review artifact',
      assigned.get('security') ?? healthy,
      logger,
      { maxRetries: 0 }
    );
    expect(healthy.complete).toHaveBeenCalledOnce();
    expect(admitted.error).not.toContain('circuit breaker open');
  });
});

describe('gateway-served voter seat breaker (#7070)', () => {
  it.each(['slot', 'cli'] as const)(
    'honors the %s failure domain for a gateway-served seat',
    async (domain) => {
      const gateway = {
        providerId: 'cli-claude',
        modelId: 'claude-sonnet-4-6',
        gatewayArm: 'api:gateway-voter',
        complete: vi.fn(),
      } as unknown as IModelAdapter;
      const slot = breakerKeys.forArm({ name: 'claude', gatewayArm: 'api:gateway-voter' });
      const breaker = breakers.getArmBreaker(domain === 'slot' ? slot : 'claude');
      for (let i = 0; i < breaker.getSnapshot().config.failureThreshold; i++)
        breaker.recordFailure('unknown');
      vi.mocked(gateway.complete).mockRejectedValueOnce(new Error('gateway seat dispatched'));
      const result = await executeAgentVote('architect', 'Review artifact', gateway, logger, {
        maxRetries: 0,
      });
      if (domain === 'slot') {
        expect(result.error).toContain('circuit breaker open');
        expect(gateway.complete).not.toHaveBeenCalled();
        expect(breakers.isOpen('claude')).toBe(false);
      } else {
        expect(gateway.complete).toHaveBeenCalledOnce();
        expect(result.error).not.toContain('circuit breaker open');
      }
    }
  );

  it('leaves an unresolved proxy to detect its transport before checking the route', () => {
    const unresolved = seat(UNRESOLVED_MODEL_ID);
    open('opencode-default');
    expect(unavailableSeat(unresolved, 'architect')).toBeUndefined();
    expect(unresolved.complete).not.toHaveBeenCalled();
  });
});

it.each([
  ['opencode-custom-sonnet', true],
  ['opencode-default', false],
])('checks the ModelBoundAdapter requested route when %s is open', (failedModel, unavailable) => {
  const slot = seat('opencode-default') as IResilientAdapter;
  const bound = new ModelBoundAdapter(slot, 'opencode-custom-sonnet');
  open(failedModel);
  const result = unavailableSeat(bound, 'architect');
  if (unavailable) expect(result?.error).toContain('circuit breaker open');
  else expect(result).toBeUndefined();
});
