/**
 * nexus-agents/mcp - Adapter Availability Middleware
 *
 * Centralized authentication and adapter availability checking for MCP tools.
 * Checks CLI authentication first (OAuth), falls back to API keys.
 *
 * This module eliminates code duplication across tools that require model adapters
 * (e.g., create_expert, execute_expert, orchestrate).
 *
 * @module mcp/middleware/adapter-availability
 * (Source: Issue #749 - Centralized adapter availability)
 * (Follows: CLAUDE.md "ONE canonical implementation path" principle)
 */

import { getAvailableClis } from '../../cli-adapters/factory.js';
import type { ICliDetectionCache } from '../../cli-adapters/cli-detection-cache.js';
import { CliDetectionCache } from '../../cli-adapters/cli-detection-cache.js';
import type { ILogger } from '../../core/index.js';
import { createLogger } from '../../core/index.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for adapter availability checking.
 */
export interface AdapterAvailabilityConfig {
  /** Optional CLI detection cache for performance */
  readonly cliCache?: ICliDetectionCache;
  /** Optional logger for debugging */
  readonly logger?: ILogger;
  /** Whether to check CLIs (default: true) */
  readonly checkClis?: boolean;
  /** Whether to check API keys (default: true) */
  readonly checkApiKeys?: boolean;
}

/**
 * Result of adapter availability check.
 */
export interface AdapterAvailabilityResult {
  /** Whether any adapter is available */
  readonly available: boolean;
  /** Available CLIs (if any) */
  readonly availableClis: readonly string[];
  /** Available API key providers (if any) */
  readonly availableApiKeys: readonly string[];
  /** Error message if not available */
  readonly error?: string;
}

/**
 * API key configuration.
 */
interface ApiKeyConfig {
  readonly name: string;
  readonly provider: string;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Supported API keys and their providers.
 */
const API_KEYS: readonly ApiKeyConfig[] = [
  { name: 'ANTHROPIC_API_KEY', provider: 'Anthropic (Claude)' },
  { name: 'OPENAI_API_KEY', provider: 'OpenAI' },
  { name: 'GOOGLE_AI_API_KEY', provider: 'Google AI (Gemini)' },
] as const;

/**
 * CLI authentication instructions.
 */
const CLI_AUTH_INSTRUCTIONS = `1. An authenticated CLI (run one of these to authenticate):
  - claude (run: claude login)
  - gemini (run: gemini auth)
  - codex (run: codex auth)`;

// ============================================================================
// Shared Instance (Singleton)
// ============================================================================

let sharedCache: ICliDetectionCache | null = null;

/**
 * Get or create a shared CLI detection cache.
 * Uses singleton pattern for efficient caching across tools.
 */
export function getSharedCliCache(): ICliDetectionCache {
  sharedCache ??= new CliDetectionCache();
  return sharedCache;
}

/**
 * Reset the shared cache (for testing).
 */
export function resetSharedCliCache(): void {
  sharedCache = null;
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Check which API keys are available in environment.
 */
function getAvailableApiKeys(): readonly string[] {
  return API_KEYS.filter(
    (k) => process.env[k.name] !== undefined && process.env[k.name] !== ''
  ).map((k) => k.provider);
}

/**
 * Build error message for when no adapters are available.
 */
function buildErrorMessage(): string {
  const keyList = API_KEYS.map((k) => `  - ${k.name} (${k.provider})`).join('\n');
  return (
    'No model adapter available. This operation requires either:\n\n' +
    CLI_AUTH_INSTRUCTIONS +
    '\n\n2. An API key environment variable:\n' +
    keyList +
    '\n\nSee: https://github.com/williamzujkowski/nexus-agents#prerequisites--environment'
  );
}

/**
 * Detect available CLIs with error handling.
 * Returns empty array on failure (graceful degradation).
 */
async function detectAvailableClis(
  cache: ICliDetectionCache,
  log: ILogger
): Promise<readonly string[]> {
  try {
    const clis = await getAvailableClis(cache);
    if (clis.length > 0) {
      log.debug('CLI adapters available', { clis });
    }
    return clis;
  } catch (err) {
    log.debug('CLI detection failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/**
 * Build the availability result object.
 */
function buildResult(
  availableClis: readonly string[],
  availableApiKeys: readonly string[]
): AdapterAvailabilityResult {
  const available = availableClis.length > 0 || availableApiKeys.length > 0;
  if (available) {
    return { available, availableClis, availableApiKeys };
  }
  return { available, availableClis, availableApiKeys, error: buildErrorMessage() };
}

/** Parsed configuration with defaults applied. */
interface ParsedConfig {
  checkClis: boolean;
  checkApiKeysFlag: boolean;
  cache: ICliDetectionCache;
  log: ILogger;
}

/** Parse config with defaults. */
function parseConfig(config?: AdapterAvailabilityConfig): ParsedConfig {
  return {
    checkClis: config?.checkClis ?? true,
    checkApiKeysFlag: config?.checkApiKeys ?? true,
    cache: config?.cliCache ?? getSharedCliCache(),
    log: config?.logger ?? createLogger({ component: 'AdapterAvailability' }),
  };
}

/**
 * Check if any model adapter is available.
 *
 * Checks in order:
 * 1. CLI authentication (preferred - OAuth-based)
 * 2. API key environment variables (fallback)
 *
 * @param config - Optional configuration
 * @returns Result with availability status and details
 *
 * @example
 * ```typescript
 * const result = await checkAdapterAvailability();
 * if (!result.available) {
 *   return { ok: false, error: result.error };
 * }
 * // Proceed with adapter usage
 * ```
 */
export async function checkAdapterAvailability(
  config?: AdapterAvailabilityConfig
): Promise<AdapterAvailabilityResult> {
  const { checkClis, checkApiKeysFlag, cache, log } = parseConfig(config);

  // Check CLIs (preferred - OAuth-authenticated)
  const availableClis = checkClis ? await detectAvailableClis(cache, log) : [];

  // Check API keys as fallback
  const availableApiKeys = checkApiKeysFlag ? getAvailableApiKeys() : [];
  if (availableApiKeys.length > 0) {
    log.debug('API key adapters available', { providers: availableApiKeys });
  }

  return buildResult(availableClis, availableApiKeys);
}

/**
 * Simple check that returns error message or undefined.
 * Drop-in replacement for the old checkAdapterAvailability function.
 *
 * @param cache - Optional CLI detection cache
 * @returns Error message if no adapters available, undefined otherwise
 *
 * @example
 * ```typescript
 * const error = await requireAdapterAvailable(deps.cliCache);
 * if (error !== undefined) {
 *   return { ok: false, error };
 * }
 * ```
 */
export async function requireAdapterAvailable(
  cache?: ICliDetectionCache
): Promise<string | undefined> {
  const config: AdapterAvailabilityConfig = {};
  if (cache !== undefined) {
    (config as { cliCache?: ICliDetectionCache }).cliCache = cache;
  }
  const result = await checkAdapterAvailability(config);
  return result.error;
}

/**
 * Synchronous check for API keys only (no CLI detection).
 * Useful for fast checks when CLI detection is not needed.
 *
 * @returns True if any API key is available
 */
export function hasApiKey(): boolean {
  return getAvailableApiKeys().length > 0;
}

/**
 * Get all configured API key providers.
 *
 * @returns List of provider names with configured API keys
 */
export function getAvailableApiKeyProviders(): readonly string[] {
  return getAvailableApiKeys();
}
