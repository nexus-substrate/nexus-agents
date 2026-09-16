/**
 * Tests for the gateway endpoint arm adapter (#4392 increment 2, step 2).
 *
 * One `api:<endpoint>` arm fronts EVERY model a gateway lists. The two facts
 * these tests pin: the arm count does not scale with the catalogue (the
 * explosion guard), and failures land on the ARM's breaker under the same
 * rate-limit exemption `ResilientAdapter.recordBreakerFailure` applies.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ErrorCode,
  ModelError,
  err,
  ok,
  type CompletionResponse,
  type ILogger,
  type IModelAdapter,
} from '../core/index.js';
import { CircuitBreakerRegistry } from '../cli-adapters/circuit-breaker.js';
import { createUnifiedRegistry } from './unified-registry.js';
import { createGatewayArmAdapter } from './gateway-arm-adapter.js';

const ARM = 'api:openai-compat' as const;

function makeLogger(): ILogger & {
  warn: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
} {
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    setLevel: vi.fn(),
    getLevel: vi.fn(),
    setFormat: vi.fn(),
    setDestination: vi.fn(),
    child: vi.fn(),
  };
  logger.child.mockReturnValue(logger);
  return logger;
}

const RESPONSE: CompletionResponse = {
  content: [{ type: 'text', text: 'ok' }],
  usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
  stopReason: 'end_turn',
  model: 'm-0',
};

type MockModel = IModelAdapter & { complete: ReturnType<typeof vi.fn> };

function makeModel(modelId: string): MockModel {
  const complete = vi.fn();
  complete.mockResolvedValue(ok(RESPONSE));
  return {
    providerId: 'openai',
    modelId,
    capabilities: ['streaming'],
    complete,
    stream: () => (async function* () {})(),
    countTokens: () => Promise.resolve(7),
    validateConfig: () => ok(undefined),
  };
}

function makeModels(count: number): MockModel[] {
  return Array.from({ length: count }, (_v, i) => makeModel(`m-${String(i)}`));
}

describe('createGatewayArmAdapter (#4392 inc 2 step 2)', () => {
  let breakers: CircuitBreakerRegistry;
  let logger: ReturnType<typeof makeLogger>;

  beforeEach(() => {
    breakers = new CircuitBreakerRegistry();
    logger = makeLogger();
  });

  describe('explosion guard — one arm for N models', () => {
    it('256 models register as exactly ONE api: arm in the adapter registry', () => {
      const registry = createUnifiedRegistry({ logger });
      const arm = createGatewayArmAdapter(ARM, makeModels(256), {
        circuitBreakerRegistry: breakers,
        logger,
      });

      registry.registerApiArm(ARM, arm);

      const apiArms = registry.getSnapshot().cachedArms.filter((a) => a.startsWith('api:'));
      expect(apiArms).toEqual([ARM]);
      expect(registry.getAdapterForArm(ARM)).toBe(arm);
      registry.dispose();
    });

    it('256 models share exactly ONE breaker entry after a failure', async () => {
      const models = makeModels(256);
      const arm = createGatewayArmAdapter(ARM, models, {
        circuitBreakerRegistry: breakers,
        logger,
      });
      models[0]?.complete.mockResolvedValue(
        err(new ModelError('gateway down', { code: ErrorCode.MODEL_UNAVAILABLE }))
      );

      await arm.complete({ messages: [] });

      expect([...breakers.getAllArmSnapshots().keys()]).toEqual([ARM]);
    });

    it('refuses an empty catalogue — an arm with no model cannot complete', () => {
      // Named empty case: never a silent arm that errors on first use.
      expect(() =>
        createGatewayArmAdapter(ARM, [], { circuitBreakerRegistry: breakers, logger })
      ).toThrow(/no models/);
    });
  });

  describe('delegation', () => {
    it('identifies as the first model and delegates complete() to it', async () => {
      const models = makeModels(3);
      const arm = createGatewayArmAdapter(ARM, models, {
        circuitBreakerRegistry: breakers,
        logger,
      });

      expect(arm.providerId).toBe('openai');
      expect(arm.modelId).toBe('m-0');
      expect(arm.capabilities).toEqual(['streaming']);
      const result = await arm.complete({ messages: [] });
      expect(result.ok).toBe(true);
      expect(models[0]?.complete).toHaveBeenCalledTimes(1);
      expect(models[1]?.complete).not.toHaveBeenCalled();
      expect(await arm.countTokens('x')).toBe(7);
      expect(arm.validateConfig().ok).toBe(true);
    });

    it('lists the whole catalogue, not just the delegate', async () => {
      const arm = createGatewayArmAdapter(ARM, makeModels(3), {
        circuitBreakerRegistry: breakers,
        logger,
      });
      const listed = await arm.listModels?.();
      expect(listed?.map((m) => m.id)).toEqual(['m-0', 'm-1', 'm-2']);
    });

    it('reports health with source api and exposes its breaker registry', () => {
      const arm = createGatewayArmAdapter(ARM, makeModels(1), {
        circuitBreakerRegistry: breakers,
        logger,
      });
      expect(arm.getHealth()).toMatchObject({ source: 'api', state: 'healthy', failoverCount: 0 });
      expect(arm.getCircuitBreakerRegistry?.()).toBe(breakers);
    });

    it('setPreferredCli is a no-op that says so at debug', async () => {
      const models = makeModels(1);
      const arm = createGatewayArmAdapter(ARM, models, {
        circuitBreakerRegistry: breakers,
        logger,
      });
      arm.setPreferredCli('claude');
      expect(logger.debug).toHaveBeenCalledTimes(1);
      const result = await arm.complete({ messages: [] });
      expect(result.ok).toBe(true);
      expect(models[0]?.complete).toHaveBeenCalledTimes(1);
    });
  });

  describe('breaker recording (the ResilientAdapter exemption, copied)', () => {
    it('records an execution failure to getArmBreaker(api:openai-compat) as a category, never the error', async () => {
      const models = makeModels(1);
      const arm = createGatewayArmAdapter(ARM, models, {
        circuitBreakerRegistry: breakers,
        logger,
      });
      const spy = vi.spyOn(breakers.getArmBreaker(ARM), 'recordFailure');
      models[0]?.complete.mockResolvedValue(
        err(new ModelError('failed for key sk-SECRET', { code: ErrorCode.MODEL_UNAVAILABLE }))
      );

      const result = await arm.complete({ messages: [] });

      expect(result.ok).toBe(false);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith('connection');
      expect(breakers.getArmBreaker(ARM).getSnapshot().failureCount).toBe(1);
      for (const call of [...logger.warn.mock.calls, ...logger.debug.mock.calls]) {
        expect(JSON.stringify(call)).not.toContain('sk-SECRET');
      }
    });

    it('does NOT record a transient rate limit (already counted by the telemetry branch)', async () => {
      const models = makeModels(1);
      const arm = createGatewayArmAdapter(ARM, models, {
        circuitBreakerRegistry: breakers,
        logger,
      });
      const spy = vi.spyOn(breakers.getArmBreaker(ARM), 'recordFailure');
      models[0]?.complete.mockResolvedValue(
        err(new ModelError('Rate limit exceeded', { code: ErrorCode.MODEL_RATE_LIMITED }))
      );

      await arm.complete({ messages: [] });

      expect(spy).not.toHaveBeenCalled();
      expect(breakers.getArmBreaker(ARM).getSnapshot().failureCount).toBe(0);
    });

    it('does NOT record a code-less rate-limit-like MODEL_ERROR either (pattern divergence)', async () => {
      const models = makeModels(1);
      const arm = createGatewayArmAdapter(ARM, models, {
        circuitBreakerRegistry: breakers,
        logger,
      });
      models[0]?.complete.mockResolvedValue(
        // "throttl" is transient to `isRateLimitLikeError` but maps to no
        // category in `mapModelErrorToCategory`; the category-only check
        // alone would count it (#3423).
        err(new ModelError('request throttled upstream', { code: ErrorCode.MODEL_ERROR }))
      );

      await arm.complete({ messages: [] });

      expect(breakers.getArmBreaker(ARM).getSnapshot().failureCount).toBe(0);
    });

    it('DOES record a durable capacity cap (#5359)', async () => {
      const models = makeModels(1);
      const arm = createGatewayArmAdapter(ARM, models, {
        circuitBreakerRegistry: breakers,
        logger,
      });
      models[0]?.complete.mockResolvedValue(
        err(
          new ModelError('Key limit exceeded (total limit)', {
            code: ErrorCode.MODEL_RATE_LIMITED,
          })
        )
      );

      await arm.complete({ messages: [] });

      expect(breakers.getArmBreaker(ARM).getSnapshot().failureCount).toBe(1);
    });

    it('reports degraded health once the arm breaker is open', () => {
      const models = makeModels(1);
      const arm = createGatewayArmAdapter(ARM, models, {
        circuitBreakerRegistry: breakers,
        logger,
      });
      const breaker = breakers.getArmBreaker(ARM, { failureThreshold: 1 });
      breaker.recordFailure('connection');
      expect(breaker.getSnapshot().state).toBe('open');
      expect(arm.getHealth()?.state).toBe('degraded');
    });
  });
});
