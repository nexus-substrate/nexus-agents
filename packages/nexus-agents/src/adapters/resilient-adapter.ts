/**
 * Resilient Model Adapter
 *
 * Transparent proxy implementing IModelAdapter with lazy detection,
 * automatic failover on circuit breaker events, and observable health.
 *
 * Key design: ResilientAdapter IS an IModelAdapter. Every existing consumer
 * works unchanged. The health/failover API lives on IResilientAdapter for
 * dashboard and monitoring consumers only.
 *
 * @module adapters/resilient-adapter
 * (Source: Issue #811 - Resilient model adapter architecture)
 */

import type {
  IModelAdapter,
  CompletionRequest,
  CompletionResponse,
  StreamChunk,
  ModelCapability,
} from '../core/types/model.js';
import type { Result } from '../core/result.js';
import { ok, err } from '../core/result.js';
import { ModelError, ConfigError } from '../core/errors.js';
import type { ILogger } from '../core/index.js';
import { getErrorMessage, createLogger } from '../core/index.js';

import { createAutoAdapter, type AdapterSelection } from './auto-adapter.js';
import {
  isRateLimitLikeError,
  toRateLimitError,
  recordRateLimitEvent,
} from './rate-limit-detector.js';
import type { CliName } from '../cli-adapters/types.js';
import type {
  IResilientAdapter,
  AdapterHealthInfo,
  ResilientAdapterConfig,
} from './resilient-adapter-types.js';
import type { CircuitStateChangeEvent } from '../cli-adapters/circuit-breaker-types.js';
import type { CircuitBreakerRegistry } from '../cli-adapters/circuit-breaker.js';
import { getGlobalEventBus } from '../agents/collaboration/event-bus.js';

// ============================================================================
// Factory
// ============================================================================

/**
 * Creates a resilient adapter with lazy detection and automatic failover.
 *
 * @example
 * ```typescript
 * const adapter = createResilientAdapter({ logger });
 * // No detection at creation time — detection happens on first use
 * const result = await adapter.complete(request); // triggers detection
 * ```
 */
export function createResilientAdapter(config?: ResilientAdapterConfig): IResilientAdapter {
  return new ResilientAdapter(config);
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Resilient adapter proxy. Implements IModelAdapter transparently.
 */
export class ResilientAdapter implements IResilientAdapter {
  private readonly logger: ILogger;
  private currentAdapter: IModelAdapter | undefined;
  private currentSelection: AdapterSelection | undefined;
  private hasEverDetected = false;
  private health: AdapterHealthInfo | undefined;
  private preferredCli: CliName | undefined;
  private readonly failoverCallbacks = new Set<(info: AdapterHealthInfo) => void>();
  private circuitBreakerRegistry: CircuitBreakerRegistry | undefined;
  private circuitListener: ((event: CircuitStateChangeEvent) => void) | undefined;
  private disposed = false;

  constructor(config?: ResilientAdapterConfig) {
    this.logger = config?.logger ?? createLogger({ component: 'resilient-adapter' });
    this.preferredCli = config?.preferredCli;
  }

  // --- IModelAdapter properties (forwarded) ---

  get providerId(): string {
    return this.currentAdapter?.providerId ?? 'resilient-proxy';
  }

  get modelId(): string {
    return this.currentAdapter?.modelId ?? 'pending-detection';
  }

  get capabilities(): readonly ModelCapability[] {
    return this.currentAdapter?.capabilities ?? [];
  }

  // --- IModelAdapter methods ---

  async complete(request: CompletionRequest): Promise<Result<CompletionResponse, ModelError>> {
    const adapter = await this.ensureAdapter();
    if (adapter === undefined) {
      return err(new ModelError('No model adapter available'));
    }
    const result = await adapter.complete(request);
    if (!result.ok && isRateLimitLikeError(result.error)) {
      const rlError = toRateLimitError(result.error, adapter.providerId);
      recordRateLimitEvent({
        provider: adapter.providerId,
        timestamp: Date.now(),
        retryAfterMs: rlError.retryAfterMs,
      });
      this.logger.warn('Rate limit detected', {
        provider: adapter.providerId,
        retryAfterMs: rlError.retryAfterMs,
      });
    }
    return result;
  }

  async *stream(request: CompletionRequest): AsyncIterable<StreamChunk> {
    const adapter = await this.ensureAdapter();
    if (adapter === undefined) {
      return;
    }
    yield* adapter.stream(request);
  }

  async countTokens(text: string): Promise<number> {
    const adapter = await this.ensureAdapter();
    if (adapter === undefined) {
      return 0;
    }
    return adapter.countTokens(text);
  }

  validateConfig(): Result<void, ConfigError> {
    if (this.currentAdapter !== undefined) {
      return this.currentAdapter.validateConfig();
    }
    // Before first use, config is trivially valid
    return ok(undefined);
  }

  // --- IResilientAdapter methods ---

  getHealth(): AdapterHealthInfo | undefined {
    return this.health;
  }

  async refresh(): Promise<void> {
    this.currentAdapter = undefined;
    this.currentSelection = undefined;
    await this.ensureAdapter();
  }

  setPreferredCli(cli: CliName | undefined): void {
    this.preferredCli = cli;
    this.currentAdapter = undefined;
    this.currentSelection = undefined;
  }

  onFailover(cb: (info: AdapterHealthInfo) => void): () => void {
    this.failoverCallbacks.add(cb);
    return () => {
      this.failoverCallbacks.delete(cb);
    };
  }

  /**
   * Attach a circuit breaker registry for automatic failover.
   * When the current adapter's circuit opens, the cached adapter
   * is cleared so the next call triggers re-detection.
   */
  attachCircuitBreakerRegistry(registry: CircuitBreakerRegistry): void {
    this.detachCircuitBreakerRegistry();
    this.circuitBreakerRegistry = registry;
    this.circuitListener = (event: CircuitStateChangeEvent) => {
      this.handleCircuitStateChange(event);
    };
    registry.addGlobalStateChangeListener(this.circuitListener);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.detachCircuitBreakerRegistry();
    this.failoverCallbacks.clear();
  }

  // --- Private methods ---

  private async ensureAdapter(): Promise<IModelAdapter | undefined> {
    if (this.currentAdapter !== undefined) {
      return this.currentAdapter;
    }
    return this.detectAdapter();
  }

  private async detectAdapter(): Promise<IModelAdapter | undefined> {
    try {
      this.logger.info('Detecting model adapter (lazy)');
      const config =
        this.preferredCli !== undefined
          ? { logger: this.logger, preferredCli: this.preferredCli }
          : { logger: this.logger };
      const selection = await createAutoAdapter(config);
      this.applySelection(selection);
      return this.currentAdapter;
    } catch (error) {
      const message = getErrorMessage(error);
      this.logger.warn('No model adapter available', { error: message });
      this.health = {
        source: 'api',
        state: 'unavailable',
        selectedAt: new Date(),
        failoverCount: this.health?.failoverCount ?? 0,
        lastError: message,
      };
      return undefined;
    }
  }

  private applySelection(selection: AdapterSelection): void {
    const isFailover = this.hasEverDetected;
    this.currentAdapter = selection.adapter;
    this.currentSelection = selection;
    this.hasEverDetected = true;

    const source = mapSelectionSource(selection);
    const failoverCount = (this.health?.failoverCount ?? 0) + (isFailover ? 1 : 0);

    this.health = {
      source,
      state: 'healthy',
      selectedAt: new Date(),
      failoverCount,
    };

    this.logger.info('Adapter selected', {
      source: selection.source,
      name: selection.name,
      model: selection.adapter.modelId,
      provider: selection.adapter.providerId,
      failover: isFailover,
    });

    if (isFailover) {
      this.emitFailover();
    }
  }

  private handleCircuitStateChange(event: CircuitStateChangeEvent): void {
    if (event.newState !== 'open') return;

    const currentSource = this.currentSelection?.name;
    if (currentSource === undefined || currentSource !== event.cliName) {
      return; // Not our current adapter
    }

    this.logger.warn('Current adapter circuit opened, clearing cache for re-detection', {
      cli: event.cliName,
      reason: event.reason,
    });

    this.currentAdapter = undefined;
    this.currentSelection = undefined;

    if (this.health !== undefined) {
      this.health = {
        ...this.health,
        state: 'degraded',
        lastError: event.reason,
      };
    }
  }

  private emitFailover(): void {
    const info = this.health;
    if (info === undefined) return;

    for (const cb of this.failoverCallbacks) {
      try {
        cb(info);
      } catch {
        // Ignore callback errors
      }
    }

    try {
      const eventBus = getGlobalEventBus();
      eventBus.emit({
        eventId: `failover-${Date.now().toString(36)}`,
        timestamp: new Date().toISOString(),
        topic: 'adapter.failover',
        payload: info,
      });
    } catch {
      // EventBus may not be initialized
    }
  }

  private detachCircuitBreakerRegistry(): void {
    if (this.circuitBreakerRegistry !== undefined && this.circuitListener !== undefined) {
      this.circuitBreakerRegistry.removeGlobalStateChangeListener(this.circuitListener);
    }
    this.circuitBreakerRegistry = undefined;
    this.circuitListener = undefined;
  }
}

// ============================================================================
// Helpers
// ============================================================================

function mapSelectionSource(selection: AdapterSelection): CliName | 'api' {
  if (selection.source === 'cli') {
    return selection.name as CliName;
  }
  return 'api';
}
