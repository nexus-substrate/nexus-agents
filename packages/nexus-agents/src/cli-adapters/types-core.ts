/**
 * nexus-agents/cli-adapters - Core Type Definitions
 *
 * Core CLI types: CliName, CliTransport, CliResponse, CliError, etc.
 *
 * (Source: cli-project_plan.md v2.1.0)
 * (Source: docs/research/cli-integration-architecture.md)
 */

import type { CliNameLiteral } from '../config/model-capabilities-types.js';
import { z } from 'zod';

/**
 * Supported CLI names.
 * Derived from canonical source: config/model-capabilities-types.ts CliNameLiteral
 */
export type CliName = CliNameLiteral;

/**
 * API-vendor identifiers an `AdapterSelection{source:'api'}` reports (#3422).
 * Distinct from the four CLI slots: a direct vendor API and the same vendor's
 * CLI binary have different latency/failure profiles, so they must NOT share a
 * routing/bandit arm (would pollute the learned model).
 */
export type ApiVendor = 'anthropic' | 'openai' | 'google' | 'custom-openai';

/** Prefixed routing arm id for a direct-API adapter, e.g. `api:anthropic` (#3422). */
export type ApiArmId = `api:${ApiVendor}`;

/**
 * Zod schema for {@link ApiArmId}, so persisted records can validate an API arm
 * (#4400). Kept next to the type rather than in the outcome schema so the two
 * cannot drift as `ApiVendor` changes.
 */
export const ApiArmIdSchema = z.enum([
  'api:anthropic',
  'api:openai',
  'api:google',
  'api:custom-openai',
]);

/**
 * A LinUCB/routing arm id — either a canonical CLI slot or a distinct API arm
 * (#3317 step 1 / #3422). Confined to the router/bandit/outcome surface so the
 * exhaustive `Record<CliName, …>` maps elsewhere stay narrow and untouched.
 */
export type RoutingArmId = CliName | ApiArmId;

/** Build the routing arm id for an API vendor. */
export function apiArmId(vendor: ApiVendor): ApiArmId {
  return `api:${vendor}`;
}

/**
 * Map a routing arm id to its display CLI slot (#3422) — identity for CLI
 * slots, vendor→slot for API arms. Used where a feature is intrinsically
 * slot-level (e.g. ZeroRouter difficulty calibration) and must collapse the
 * distinct API arm to its attribution slot. The bandit keeps the distinct arm;
 * only slot-level surfaces collapse.
 */
export function routingArmDisplaySlot(armId: RoutingArmId): CliName {
  switch (armId) {
    case 'api:anthropic':
      return 'claude';
    case 'api:openai':
      return 'codex';
    case 'api:google':
      return 'gemini';
    case 'api:custom-openai':
      return 'opencode';
    default:
      return armId;
  }
}

/**
 * Transport type for CLI communication.
 * - 'mcp': Uses Model Context Protocol (most stable)
 * - 'subprocess': Spawns CLI process with JSON output
 */
export type CliTransport = 'mcp' | 'subprocess';

/**
 * Token usage information from CLI response.
 */
export interface TokenUsage {
  /** Input tokens consumed */
  readonly inputTokens: number;
  /** Output tokens generated */
  readonly outputTokens: number;
  /** Cached input tokens READ from an existing cache (if applicable). */
  readonly cachedInputTokens?: number;
  /**
   * Input tokens spent WRITING the cache, when the vendor reports them
   * separately (#4435). Kept distinct from {@link cachedInputTokens} because
   * they bill at opposite ends: cache writes are ~1.25x the uncached input
   * rate, cache reads ~0.1x. Collapsing them would make correct pricing
   * impossible.
   */
  readonly cacheCreationInputTokens?: number;
  /** Total tokens (input + output) */
  readonly totalTokens?: number;
}

/**
 * Unified CLI response format.
 * Normalized across all CLI output formats.
 */
export interface CliResponse {
  /** The response text */
  readonly text: string;
  /** Token usage statistics */
  readonly usage?: TokenUsage;
  /** Session ID for resumption */
  readonly sessionId?: string;
  /** Cost in USD (if available) */
  readonly costUsd?: number;
  /** Model used for generation */
  readonly model?: string;
  /** Duration in milliseconds */
  readonly durationMs?: number;
  /** Raw response (for debugging) */
  readonly raw?: unknown;
}

/**
 * Error codes for CLI operations.
 */
export type CliErrorCode =
  | 'NOT_FOUND' // CLI not installed
  | 'NOT_AUTHENTICATED' // OAuth/auth required
  | 'RATE_LIMITED' // Rate limit exceeded
  | 'TIMEOUT' // Execution timed out
  | 'PARSE_ERROR' // Response parsing failed
  | 'CONNECTION_ERROR' // MCP connection failed
  | 'EXECUTION_ERROR' // CLI returned error
  | 'UNSUPPORTED_VERSION' // CLI version not supported
  | 'BUDGET_EXCEEDED' // Budget limit exceeded
  | 'UNKNOWN'; // Unknown error

/**
 * CLI execution error.
 */
export interface CliError {
  /** Error code */
  readonly code: CliErrorCode;
  /** Human-readable message */
  readonly message: string;
  /** CLI that produced the error */
  readonly cli: CliName;
  /** Underlying error (if any) */
  readonly cause?: Error;
  /** Whether the error is retryable */
  readonly retryable: boolean;
  /**
   * How long the provider asked us to wait before retrying, in milliseconds
   * (#4373). Present only when the CLI's own message stated one — parsed by
   * `parseRetryAfterMs`. The retry loop prefers this over its computed
   * exponential backoff, since a provider that names its window knows better
   * than our guess.
   */
  readonly retryAfterMs?: number;
}

/**
 * Version compatibility status.
 */
export type VersionStatus = 'supported' | 'outdated' | 'breaking' | 'unsupported';

/**
 * Health check status for a CLI.
 */
export interface HealthStatus {
  /** Whether the CLI is healthy */
  readonly healthy: boolean;
  /** CLI version */
  readonly version: string;
  /** Version compatibility status */
  readonly versionStatus: VersionStatus;
  /** Optional message (e.g., upgrade recommendation) */
  readonly message?: string;
  /**
   * Whether the underlying CLI could be reached at all (#5060).
   *
   * `healthCheck` catches its own failures and returns rather than throwing, so
   * a `healthy: false` result covers two very different states: the binary ran
   * and reported an unsupported version, or the binary could not be run at all
   * (`spawn ENOENT`). Both arrive as `versionStatus: 'unsupported'`, and a
   * consumer reading only `healthy` told users to authenticate a CLI they had
   * not installed.
   *
   * Absent means the producer predates the distinction — unknown, not
   * unreachable. Consumers should treat `reachable !== false` as "present".
   */
  readonly reachable?: boolean;
  /**
   * When the evidence behind {@link reachable} was actually gathered (#5864).
   *
   * `BaseCliAdapter` caches the version string forever — no TTL, no reset, not
   * even on `dispose()` — so every `healthCheck` after the first for a given
   * instance returns without spawning anything. `reachable: true` then restates
   * a past observation as a present one, and `lastChecked` is stamped `now`,
   * which dates a replay as if it were a fresh probe.
   *
   * Compare the two: equal (to the probe) means this check ran the binary;
   * earlier means `reachable` rests on a cached reading and the binary may have
   * gone away since. Absent means the producer does not probe a binary at all
   * (an in-process adapter) or predates the distinction — unknown, not stale.
   */
  readonly versionProbedAt?: Date;
  /** Last successful health check */
  readonly lastChecked: Date;
}

/**
 * Capacity status for rate limiting.
 */
export interface CapacityStatus {
  /** Remaining tokens in current window */
  readonly remainingTokens: number;
  /** Remaining requests in current window */
  readonly remainingRequests: number;
  /** When the rate limit resets */
  readonly resetTime: Date;
  /** Current utilization percentage (0-100) */
  readonly utilizationPercent: number;
  /**
   * Whether this process's rolling rate window is used up (#4456).
   *
   * Local arithmetic only: this process's own spend over the last
   * {@link RATE_LIMIT_WINDOW_MS}, measured against a per-CLI constant the
   * source calls a conservative estimate. It self-clears within the window,
   * and an ordinary burst (a 7-voter panel, a subagent fan-out) sets it while
   * plenty of provider quota remains.
   *
   * This is a throttling hint, NOT evidence that the account is out of
   * capacity. Do not exclude a candidate on it — see {@link quotaExhausted}.
   */
  readonly rateLimited: boolean;
  /**
   * @deprecated Since #4456 — renamed to {@link rateLimited}, which says what
   * it actually measures. The name `exhausted` promised an account/plan
   * capacity signal while reporting a 60-second local rate heuristic, so every
   * reader inherited a claim the value could not support. Identical value;
   * scheduled for removal in the next major.
   */
  readonly exhausted: boolean;
  /**
   * Whether a PROVIDER asserted that durable quota is gone (#4456).
   *
   * Set only from provider-asserted evidence — a rate-limit error whose
   * `retry-after` exceeds the local window, which is the provider itself
   * saying the wait is longer than a per-minute throttle. Never inferred from
   * local counting.
   *
   * `false` means "no provider has asserted exhaustion to THIS process". It is
   * NOT a measurement that quota remains: a weekly quota burned by another
   * process is invisible here. Read it with {@link observed}; absence of
   * evidence must not be presented as capacity.
   */
  readonly quotaExhausted: boolean;
  /**
   * When the provider said the quota window clears, from `retry-after`.
   *
   * Present only alongside `quotaExhausted: true`. Absent means the provider
   * asserted exhaustion without a horizon, which is a weaker signal, not a
   * shorter one.
   */
  readonly quotaResetAt?: Date;
  /**
   * Whether this process has observed any usage of the adapter (#4374).
   *
   * When false, every other field is a *default*, not a measurement: a tracker
   * that has never recorded a request reports the full token limit remaining and
   * 0% utilization, which is indistinguishable from a genuinely idle adapter.
   * Consumers must not present an unobserved reading as health.
   *
   * Note the narrower guarantee even when true: the tracker sees only THIS
   * process's spend. It has no visibility into a provider-side weekly quota
   * consumed elsewhere, so `remainingTokens` is a local upper bound on what is
   * left, never an authoritative one.
   */
  readonly observed: boolean;
}
