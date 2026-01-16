/**
 * nexus-agents/testing - Mock Adapter Types
 *
 * Type definitions for MockCliAdapter.
 * Extracted to enable sharing between mock-adapter.ts and mock-adapter-helpers.ts.
 */

import type { CliName, CliTask, ExecutionOptions } from '../../cli-adapters/types.js';

/**
 * Configuration for mock adapter behavior.
 */
export interface MockAdapterConfig {
  /** CLI name to emulate */
  readonly name: CliName;
  /** Default response text when no specific response is configured */
  readonly defaultResponse: string;
  /** Default simulated latency in milliseconds */
  readonly defaultLatencyMs: number;
  /** Probability of failure (0-1), for circuit breaker testing */
  readonly failureRate: number;
  /** Specific responses keyed by task content or session ID */
  readonly responses: Map<string, string>;
}

/**
 * Recorded request for test assertions.
 */
export interface RecordedRequest {
  /** The task that was executed */
  readonly task: CliTask;
  /** Options passed to execute */
  readonly options?: ExecutionOptions | undefined;
  /** Timestamp of the request */
  readonly timestamp: Date;
}

/**
 * Pending response override.
 * Can be a string (success) or Error (failure).
 */
export type NextResponse = string | Error;
