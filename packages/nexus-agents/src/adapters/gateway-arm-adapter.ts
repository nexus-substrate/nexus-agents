/**
 * Gateway endpoint arm adapter (#4392 increment 2, step 2).
 *
 * An OpenAI-compatible gateway lists N models and `buildOpenAICompatAdapters`
 * builds one `IModelAdapter` per model. This module fronts ALL of them with
 * ONE `api:<endpoint>` arm — the explosion guard: the adapter registry, the
 * circuit-breaker registry and the cost declaration each key on the arm, so
 * a 256-model catalogue is one registry entry, one breaker and one
 * `NEXUS_GATEWAY_COST` line, not 256 of each.
 *
 * It is an {@link IResilientAdapter} so `UnifiedAdapterRegistry.registerApiArm`
 * can hold it next to the CLI slots, but it is NOT a `ResilientAdapter`: there
 * is no lazy detection and no failover (the gateway is the endpoint), so the
 * proxy is a thin delegate over the ranked gateway default, plus the breaker
 * recording `ResilientAdapter.recordBreakerFailure` does — copied, not
 * subclassed, because subclassing would drag detection and failover in.
 *
 * Security (#3422 constraint, inherited): logged payloads carry only the arm,
 * the provider and the failure category — never `error.message`, the request,
 * or the ModelError, any of which could embed credentials.
 *
 * @module adapters/gateway-arm-adapter
 */

import type {
  CompletionRequest,
  CompletionResponse,
  IModelAdapter,
  ILogger,
  ModelMetadata,
  Result,
  StreamChunk,
} from '../core/index.js';
import { ConfigError, ModelError, ErrorCode, err, ok, getTimeProvider } from '../core/index.js';
import type { CircuitBreakerRegistry } from '../cli-adapters/circuit-breaker.js';
import { mapModelErrorToCategory } from '../cli-adapters/circuit-breaker.js';
import type { EndpointArmId } from '../cli-adapters/types-core.js';
import {
  isDurableCapacityError,
  isRateLimitLikeError,
  recordRateLimitEvent,
  toRateLimitError,
} from './rate-limit-detector.js';
import type { AdapterHealthInfo, IResilientAdapter } from './resilient-adapter-types.js';
import { releaseGatewayCatalog, retainGatewayCatalog } from './sdk/gateway-catalog.js';
import { resolveGatewayDefault } from './gateway-family-slots.js';
import { isCallerCancelled } from './abort-utils.js';

/** What the arm needs from its host: the SHARED breaker registry and a logger. */
export interface GatewayArmDeps {
  /**
   * The same registry that gates the CLI slots (#4330, #4659): a gateway that
   * has failed for one consumer must read as failed for every consumer.
   */
  readonly circuitBreakerRegistry: CircuitBreakerRegistry;
  readonly logger: ILogger;
}

/**
 * Build the one arm for a gateway's whole catalogue. `models` is the
 * discovered list in the gateway's order; `resolveGatewayDefault` chooses the
 * delegate after bootstrap registers the catalogue, and `listModels` returns
 * them all. There is no fallback to an arbitrary model when no chat default
 * resolves.
 * Throws on an empty list — the named empty case: an arm with no model
 * cannot complete, and registering one would fail on first use instead.
 */
export function createGatewayArmAdapter(
  armId: EndpointArmId,
  models: readonly IModelAdapter[],
  deps: GatewayArmDeps
): IResilientAdapter {
  if (models.length === 0) {
    throw new ConfigError(`Gateway arm ${armId} has no models; nothing to register`);
  }
  return new GatewayArmAdapter(armId, models, deps);
}

/** Whether this concrete endpoint wrapper admits calls on this exact shared breaker. */
export function ownsGatewayCircuitAdmission(
  adapter: IModelAdapter,
  armId: string,
  registry: CircuitBreakerRegistry
): boolean {
  return (
    adapter instanceof GatewayArmAdapter &&
    adapter.gatewayArm === armId &&
    adapter.getCircuitBreakerRegistry() === registry
  );
}

class GatewayArmAdapter implements IResilientAdapter {
  private readonly selectedAt = new Date();
  private resolvedDelegate: IModelAdapter | undefined;

  constructor(
    private readonly armId: EndpointArmId,
    private readonly models: readonly IModelAdapter[],
    private readonly deps: GatewayArmDeps
  ) {
    retainGatewayCatalog(armId, this);
  }

  /**
   * The gateway-arm marker (#4392 step 4, `isGatewayModelAdapter`): a
   * telemetry writer that is handed this wrapper prices its calls by the
   * arm's `NEXUS_GATEWAY_COST` declaration, never the delegate's list price.
   */
  get gatewayArm(): EndpointArmId {
    return this.armId;
  }

  // --- IModelAdapter (forwarded to the delegate) ---

  get providerId(): string {
    return this.requireDelegate().providerId;
  }

  get modelId(): string {
    return this.requireDelegate().modelId;
  }

  get capabilities(): IModelAdapter['capabilities'] {
    return this.requireDelegate().capabilities;
  }

  /**
   * Both halves of the breaker contract, as `base-adapter.ts` records them
   * for the CLI slots on the same shared registry. The success half matters
   * (#6403 review): in the closed state `recordSuccess` zeroes the failure
   * count, which is what makes the threshold mean CONSECUTIVE failures, and
   * in half-open it is what closes the circuit again. Without it a long-lived
   * process counted scattered blips for its whole lifetime and, once open,
   * sat half-open forever with any single error re-opening it.
   */
  async complete(request: CompletionRequest): Promise<Result<CompletionResponse, ModelError>> {
    const resolved = this.resolveDelegate();
    if (!resolved.ok) {
      return err(new ModelError(resolved.error.message, { code: ErrorCode.MODEL_UNAVAILABLE }));
    }
    const delegate = resolved.value;
    const breaker = this.deps.circuitBreakerRegistry.getArmBreaker(this.armId);
    const admission = breaker.canExecute();
    if (!admission.ok) {
      return err(
        new ModelError(admission.error.message, {
          code: ErrorCode.MODEL_UNAVAILABLE,
          cause: admission.error,
          retryable: false,
        })
      );
    }
    const result = await delegate.complete(request);
    if (result.ok) {
      breaker.recordSuccess();
    } else if (isCallerCancelled(result.error)) {
      // Cancellation is no evidence of endpoint health, and frees a half-open probe.
      breaker.releaseHalfOpenProbe();
    } else {
      this.recordFailure(result.error, delegate.providerId);
    }
    return result;
  }

  stream(request: CompletionRequest): AsyncIterable<StreamChunk> {
    return this.requireDelegate().stream(request);
  }

  countTokens(text: string): Promise<number> {
    return this.requireDelegate().countTokens(text);
  }

  validateConfig(): Result<void, ConfigError> {
    const resolved = this.resolveDelegate();
    return resolved.ok ? resolved.value.validateConfig() : resolved;
  }

  /** The whole catalogue, not the delegate alone — that is what the arm fronts. */
  listModels(): Promise<readonly ModelMetadata[]> {
    return Promise.resolve(this.models.map((m) => ({ id: m.modelId })));
  }

  // --- IResilientAdapter ---

  /**
   * `source: 'api'` always; `degraded` while the arm's breaker is open. There
   * is no `unavailable`: the arm exists only once discovery succeeded.
   */
  getHealth(): AdapterHealthInfo {
    return {
      source: 'api',
      state: this.deps.circuitBreakerRegistry.isArmOpen(this.armId) ? 'degraded' : 'healthy',
      selectedAt: this.selectedAt,
      failoverCount: 0,
    };
  }

  /** Nothing to re-detect: the catalogue is fixed at registration. */
  refresh(): Promise<void> {
    return Promise.resolve();
  }

  /** A gateway arm has no CLI to prefer; said at debug so a caller can see it was ignored. */
  setPreferredCli(cli: Parameters<IResilientAdapter['setPreferredCli']>[0]): void {
    this.deps.logger.debug('setPreferredCli ignored on a gateway arm', { arm: this.armId, cli });
  }

  /** The arm never fails over, so the callback is never invoked. */
  onFailover(): () => void {
    return () => undefined;
  }

  getCircuitBreakerRegistry(): CircuitBreakerRegistry {
    return this.deps.circuitBreakerRegistry;
  }

  /**
   * No listeners or timers are held; the breaker outlives the arm on purpose
   * (a re-registered gateway keeps its failure history). The shared catalogue
   * stays while any registry owns a live wrapper for this endpoint. Repeated
   * disposal is harmless, and a wrapper retained before replacement prevents
   * disposal of the earlier wrapper from clearing the endpoint's metadata.
   */
  dispose(): void {
    releaseGatewayCatalog(this.armId, this);
  }

  // --- Private ---

  /** Resolve lazily after bootstrap, and pin a successful default to this arm. */
  private resolveDelegate(): Result<IModelAdapter, ConfigError> {
    if (this.resolvedDelegate !== undefined) return ok(this.resolvedDelegate);
    const resolved = resolveGatewayDefault(process.env, this.deps.logger);
    if (resolved.kind !== 'resolved') {
      return err(new ConfigError(`Gateway arm ${this.armId} has no chat default`));
    }
    const delegate = this.models.find((model) => model === resolved.adapter);
    if (delegate === undefined) {
      return err(new ConfigError(`Gateway default does not belong to arm ${this.armId}`));
    }
    this.resolvedDelegate = delegate;
    return ok(delegate);
  }

  /** Metadata and streaming interfaces cannot carry a Result error. */
  private requireDelegate(): IModelAdapter {
    const resolved = this.resolveDelegate();
    if (!resolved.ok) throw resolved.error;
    return resolved.value;
  }

  /**
   * `ResilientAdapter.recordBreakerFailure`, keyed on the ARM (#3423, #5359):
   * a transient rate limit is recorded by the telemetry branch and exempt from
   * the breaker (it would double-count, and open a breaker on a condition that
   * clears within the minute); a DURABLE capacity cap is counted even though it
   * is rate-limit-shaped, because it never clears; everything else counts.
   * Every rate-limit-shaped failure, durable or not, is a telemetry event.
   */
  private recordFailure(error: ModelError, provider: string): void {
    const breaker = this.deps.circuitBreakerRegistry.getArmBreaker(this.armId);
    const category = mapModelErrorToCategory(error);
    // Telemetry first, for EVERY rate-limit-like error — durable caps included
    // — exactly as `ResilientAdapter.complete` does before its breaker branch;
    // otherwise `getRateLimitStats()` under-counts the gateway (#6403 review).
    const rateLimitLike = category === 'rate_limit' || isRateLimitLikeError(error);
    if (rateLimitLike) this.recordRateLimit(error, provider);
    if (isDurableCapacityError(error)) {
      breaker.recordFailure(category);
      this.deps.logger.warn('Durable capacity cap recorded to gateway arm breaker', {
        arm: this.armId,
        provider,
        category,
      });
      return;
    }
    if (rateLimitLike) {
      // An exempt throttle provides no breaker verdict; keep recovery probes available.
      breaker.releaseHalfOpenProbe();
      return;
    }
    breaker.recordFailure(category);
    this.deps.logger.warn('Gateway arm failure recorded to circuit breaker', {
      arm: this.armId,
      provider,
      category,
    });
  }

  /** The telemetry branch of `ResilientAdapter.complete`, for the exempted case. */
  private recordRateLimit(error: ModelError, provider: string): void {
    const rlError = toRateLimitError(error, provider);
    recordRateLimitEvent({
      provider,
      timestamp: getTimeProvider().now(),
      retryAfterMs: rlError.retryAfterMs,
    });
    this.deps.logger.warn('Rate limit detected on gateway arm', {
      arm: this.armId,
      provider,
      retryAfterMs: rlError.retryAfterMs,
    });
  }
}
