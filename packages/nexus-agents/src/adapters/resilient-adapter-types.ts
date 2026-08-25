/**
 * Resilient Adapter Type Definitions
 *
 * Types for the transparent resilient proxy adapter that provides
 * lazy detection, automatic failover, and observable health.
 *
 * @module adapters/resilient-adapter-types
 * (Source: Issue #811 - Resilient model adapter architecture)
 */

import type { IModelAdapter } from '../core/index.js';
import type { CliName } from '../cli-adapters/types.js';

/**
 * Health states for the adapter.
 * - healthy: adapter detected and operational
 * - degraded: adapter operational but experienced recent failures
 * - unavailable: no adapter could be detected
 */
export type AdapterHealthState = 'healthy' | 'degraded' | 'unavailable';

/**
 * Health information for the current adapter.
 */
export interface AdapterHealthInfo {
  readonly source: CliName | 'api';
  readonly state: AdapterHealthState;
  readonly selectedAt: Date;
  readonly failoverCount: number;
  readonly lastError?: string;
}

/**
 * Configuration for the resilient adapter.
 */
export interface ResilientAdapterConfig {
  /** Logger instance */
  readonly logger?: import('../core/index.js').ILogger;
  /** Preferred CLI to use */
  readonly preferredCli?: CliName;
  /** Default timeout for CLI subprocess calls (ms). Overrides auto-detection. */
  readonly defaultCliTimeoutMs?: number;
  /**
   * Circuit-breaker registry to arm this adapter's failover with (#4659).
   *
   * Supplied at CONSTRUCTION rather than through a separate `attach` call
   * because the separate call is exactly what never happened: `attach` was on
   * the class but not on {@link IResilientAdapter}, so the two production
   * construction sites could not reach it without a cast, and the breaker sat
   * disarmed. Arming is now part of building the thing.
   */
  readonly circuitBreakerRegistry?: import('../cli-adapters/circuit-breaker.js').CircuitBreakerRegistry;
}

/**
 * Extension of IModelAdapter with health monitoring and failover.
 *
 * Consumers that only need IModelAdapter continue to work unchanged.
 * Dashboard/monitoring consumers can cast to IResilientAdapter for
 * health and failover APIs.
 */
export interface IResilientAdapter extends IModelAdapter {
  /** Current health info (undefined if not yet initialized) */
  getHealth(): AdapterHealthInfo | undefined;
  /** Force re-detection of adapters */
  refresh(): Promise<void>;
  /** Override preferred CLI */
  setPreferredCli(cli: CliName | undefined): void;
  /** Register failover callback */
  onFailover(cb: (info: AdapterHealthInfo) => void): () => void;
  /**
   * The registry arming this adapter's failover, or `undefined` if none (#4659).
   *
   * Read-only on purpose: exposing `attach` here would re-create the "someone
   * must remember to call it" shape that left the breaker disarmed. Supply it
   * via {@link ResilientAdapterConfig.circuitBreakerRegistry} instead. This
   * accessor exists so a caller can VERIFY the adapter is armed.
   */
  getCircuitBreakerRegistry?():
    import('../cli-adapters/circuit-breaker.js').CircuitBreakerRegistry | undefined;
  /** Cleanup listeners and timers */
  dispose(): void;
}
