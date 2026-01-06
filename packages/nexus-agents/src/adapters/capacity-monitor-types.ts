/**
 * nexus-agents/adapters - Capacity Monitor Types
 *
 * Type definitions and interfaces for capacity monitoring.
 */

/**
 * Provider identifiers for capacity monitoring.
 */
export type CapacityProvider = string;

/**
 * Capacity information for a provider.
 */
export interface CapacityInfo {
  /** Remaining tokens available for requests */
  readonly remainingTokens: number;
  /** Remaining API requests available */
  readonly remainingRequests: number;
  /** Time when rate limits reset (null if unknown) */
  readonly resetTime: Date | null;
  /** Current utilization as a percentage (0-100) */
  readonly utilizationPercent: number;
  /** Timestamp when this info was last updated */
  readonly lastUpdated: Date;
  /** Provider-specific metadata */
  readonly metadata?: Record<string, unknown>;
}

/**
 * Callback for low capacity events.
 */
export type LowCapacityCallback = (provider: string, remaining: number, info: CapacityInfo) => void;

/**
 * Header-like object interface for flexibility.
 */
export interface HeadersLike {
  get(name: string): string | null;
}

/**
 * Interface for capacity monitoring.
 */
export interface ICapacityMonitor {
  /**
   * Updates capacity information from response headers.
   * @param provider - The provider identifier
   * @param headers - Response headers containing rate limit information
   */
  updateFromHeaders(provider: string, headers: Headers | HeadersLike): void;

  /**
   * Gets current capacity information for a provider.
   * @param provider - The provider identifier
   * @returns Current capacity info or null if not tracked
   */
  getCapacity(provider: string): CapacityInfo | null;

  /**
   * Registers a callback for low capacity events.
   * @param callback - Function called when capacity drops below threshold
   * @returns Unsubscribe function
   */
  onLowCapacity(callback: LowCapacityCallback): () => void;

  /**
   * Sets the threshold for low capacity warnings.
   * @param threshold - Utilization percentage (0-100) triggering warnings
   */
  setLowCapacityThreshold(threshold: number): void;

  /**
   * Gets the time until rate limits reset for a provider.
   * @param provider - The provider identifier
   * @returns Milliseconds until reset, or null if unknown
   */
  getTimeUntilReset(provider: string): number | null;

  /**
   * Manually updates capacity for a provider.
   * @param provider - The provider identifier
   * @param info - Partial capacity information to update
   */
  updateCapacity(provider: string, info: Partial<CapacityInfo>): void;

  /**
   * Clears capacity information for a provider.
   * @param provider - The provider identifier
   */
  clearCapacity(provider: string): void;

  /**
   * Gets all tracked providers.
   * @returns Array of provider identifiers
   */
  getTrackedProviders(): string[];
}

/**
 * Internal storage for provider capacity.
 */
export interface ProviderCapacityState {
  remainingTokens: number;
  remainingRequests: number;
  totalTokens: number;
  totalRequests: number;
  resetTime: Date | null;
  lastUpdated: Date;
  metadata: Record<string, unknown>;
}

/**
 * Configuration for the capacity monitor.
 */
export interface CapacityMonitorConfig {
  /** Utilization threshold for low capacity warnings (0-100). Default: 80 */
  lowCapacityThreshold?: number;
  /** Default total tokens if not provided by headers. Default: 100000 */
  readonly defaultTotalTokens?: number;
  /** Default total requests if not provided by headers. Default: 1000 */
  readonly defaultTotalRequests?: number;
}

/**
 * Header mapping configuration for a provider.
 */
export interface ProviderHeaderMapping {
  tokensRemaining: string;
  tokensReset: string;
  tokensLimit?: string;
  requestsRemaining?: string;
  requestsReset?: string;
  requestsLimit?: string;
}

/**
 * Header mappings for known providers.
 */
export const HEADER_MAPPINGS: Record<string, ProviderHeaderMapping> = {
  anthropic: {
    tokensRemaining: 'anthropic-ratelimit-tokens-remaining',
    tokensReset: 'anthropic-ratelimit-tokens-reset',
    tokensLimit: 'anthropic-ratelimit-tokens-limit',
    requestsRemaining: 'anthropic-ratelimit-requests-remaining',
    requestsReset: 'anthropic-ratelimit-requests-reset',
    requestsLimit: 'anthropic-ratelimit-requests-limit',
  },
  openai: {
    tokensRemaining: 'x-ratelimit-remaining-tokens',
    tokensReset: 'x-ratelimit-reset-tokens',
    tokensLimit: 'x-ratelimit-limit-tokens',
    requestsRemaining: 'x-ratelimit-remaining-requests',
    requestsReset: 'x-ratelimit-reset-requests',
    requestsLimit: 'x-ratelimit-limit-requests',
  },
};

/**
 * Default configuration values.
 */
export const DEFAULT_CAPACITY_CONFIG: Required<CapacityMonitorConfig> = {
  lowCapacityThreshold: 80,
  defaultTotalTokens: 100000,
  defaultTotalRequests: 1000,
};
