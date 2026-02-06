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
  /** Cleanup listeners and timers */
  dispose(): void;
}
