/**
 * Auto-Selecting Model Adapter Factory
 *
 * Automatically selects the best available adapter:
 * 1. CLI adapters (claude/gemini/codex) - OAuth, no API keys needed
 *    The CLIs handle model selection internally.
 * 2. API adapters (Anthropic/OpenAI) - requires API keys (fallback)
 *
 * Supports optional caching to avoid repeated CLI health checks.
 *
 * @module adapters/auto-adapter
 * (Source: Issue #165 - CLI detection cache)
 */

import type { IModelAdapter, ILogger } from '../core/index.js';
import { createLogger } from '../core/index.js';
import { createCliAdapter, isCliAvailable, getAvailableClis } from '../cli-adapters/factory.js';
import { createCliToModelAdapter } from '../cli-adapters/cli-to-model-adapter.js';
import { createClaudeAdapter } from './claude-adapter.js';
import type { CliName } from '../cli-adapters/types.js';
import type { ICliDetectionCache } from '../cli-adapters/cli-detection-cache.js';
import { createCliDetectionCache } from '../cli-adapters/cli-detection-cache.js';

/**
 * Adapter selection priority.
 */
export type AdapterPriority = 'cli-first' | 'api-first' | 'cli-only' | 'api-only';

/**
 * Configuration for auto-selecting adapters.
 */
export interface AutoAdapterConfig {
  /** Selection priority (default: 'cli-first') */
  readonly priority?: AdapterPriority;
  /** Preferred CLI if multiple available (optional) */
  readonly preferredCli?: CliName;
  /** API key for Anthropic (optional, for fallback) */
  readonly anthropicApiKey?: string;
  /** Logger instance */
  readonly logger?: ILogger;
  /** CLI detection cache (optional, creates new if not provided) */
  readonly cache?: ICliDetectionCache;
  /** Whether to create and use cache if not provided (default: true) */
  readonly enableCache?: boolean;
}

/**
 * Result of adapter selection.
 */
export interface AdapterSelection {
  /** The selected adapter */
  readonly adapter: IModelAdapter;
  /** Source of the adapter */
  readonly source: 'cli' | 'api';
  /** Which CLI or API was selected */
  readonly name: string;
  /** Why this adapter was selected */
  readonly reason: string;
  /** The cache used for CLI detection (for reuse) */
  readonly cache?: ICliDetectionCache | undefined;
}

const defaultLogger = createLogger({ component: 'auto-adapter' });

/**
 * Resolves the cache to use based on configuration.
 */
function resolveCache(config: AutoAdapterConfig, logger: ILogger): ICliDetectionCache | undefined {
  if (config.cache !== undefined) {
    return config.cache;
  }
  const enableCache = config.enableCache ?? true;
  return enableCache ? createCliDetectionCache({ logger }) : undefined;
}

/**
 * Attempts to create a CLI-based model adapter.
 * The CLI tools (claude, gemini, codex) handle their own model selection.
 * Uses cache to avoid repeated health checks.
 */
async function tryCliAdapter(
  config: AutoAdapterConfig,
  logger: ILogger,
  cache?: ICliDetectionCache
): Promise<AdapterSelection | null> {
  const preferredCli = config.preferredCli;

  // If preferred CLI specified, try that first
  if (preferredCli !== undefined && (await isCliAvailable(preferredCli, cache))) {
    logger.info('Using preferred CLI', { cli: preferredCli });
    const cliAdapter = createCliAdapter({ cli: preferredCli, logger });
    await cliAdapter.initialize();
    return {
      adapter: createCliToModelAdapter(cliAdapter),
      source: 'cli',
      name: preferredCli,
      reason: `Preferred CLI '${preferredCli}' is available (model selection handled by CLI)`,
      cache,
    };
  }

  // Otherwise, get all available CLIs and use the first one found
  const availableClis = await getAvailableClis(cache);

  if (availableClis.length === 0) {
    logger.info('No CLI adapters available');
    return null;
  }

  // Use first available CLI - each CLI handles its own model selection
  const selectedCli = availableClis[0];

  if (selectedCli === undefined) {
    return null;
  }

  logger.info('Auto-selected CLI', { cli: selectedCli, available: availableClis });
  const cliAdapter = createCliAdapter({ cli: selectedCli, logger });
  await cliAdapter.initialize();

  return {
    adapter: createCliToModelAdapter(cliAdapter),
    source: 'cli',
    name: selectedCli,
    reason: `Using '${selectedCli}' CLI (model selection handled by CLI)`,
    cache,
  };
}

/**
 * Attempts to create an API-based model adapter.
 * This is a fallback when no CLIs are available.
 */
function tryApiAdapter(config: AutoAdapterConfig, logger: ILogger): AdapterSelection | null {
  // Check for Anthropic API key
  const apiKey = config.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY;

  if (apiKey === undefined || apiKey.length === 0) {
    logger.info('No API key available for Anthropic');
    return null;
  }

  logger.info('Using Anthropic API adapter (fallback)');
  const adapter = createClaudeAdapter({
    modelId: 'claude-sonnet-4-20250514',
    apiKey,
  });

  return {
    adapter,
    source: 'api',
    name: 'anthropic',
    reason: 'Using Anthropic API as fallback (no CLIs available)',
  };
}

/** Try CLI first, then API as fallback. */
async function selectCliFirst(
  config: AutoAdapterConfig,
  logger: ILogger,
  cache?: ICliDetectionCache
): Promise<AdapterSelection> {
  const cliResult = await tryCliAdapter(config, logger, cache);
  if (cliResult !== null) return cliResult;
  const apiResult = tryApiAdapter(config, logger);
  if (apiResult !== null) return apiResult;
  throw new Error(
    'No adapters available. Install a CLI (claude/gemini/codex) or set ANTHROPIC_API_KEY.'
  );
}

/** Try API first, then CLI as fallback. */
async function selectApiFirst(
  config: AutoAdapterConfig,
  logger: ILogger,
  cache?: ICliDetectionCache
): Promise<AdapterSelection> {
  const apiResult = tryApiAdapter(config, logger);
  if (apiResult !== null) return apiResult;
  const cliResult = await tryCliAdapter(config, logger, cache);
  if (cliResult !== null) return cliResult;
  throw new Error(
    'No adapters available. Set ANTHROPIC_API_KEY or install a CLI (claude/gemini/codex).'
  );
}

/** CLI only - no API fallback. */
async function selectCliOnly(
  config: AutoAdapterConfig,
  logger: ILogger,
  cache?: ICliDetectionCache
): Promise<AdapterSelection> {
  const cliResult = await tryCliAdapter(config, logger, cache);
  if (cliResult !== null) return cliResult;
  throw new Error(
    'No CLI adapters available. Install and authenticate claude, gemini, or codex CLI.'
  );
}

/** API only - no CLI fallback. */
function selectApiOnly(config: AutoAdapterConfig, logger: ILogger): AdapterSelection {
  const apiResult = tryApiAdapter(config, logger);
  if (apiResult !== null) return apiResult;
  throw new Error('No API key available. Set ANTHROPIC_API_KEY environment variable.');
}

/**
 * Auto-selects the best available model adapter.
 * Uses caching to avoid repeated CLI health checks.
 *
 * @param config - Configuration options
 * @returns Selected adapter or throws if none available
 *
 * @example
 * ```typescript
 * // Use CLI if available, fall back to API
 * const { adapter, source, reason, cache } = await createAutoAdapter();
 * console.log(`Using ${source} adapter: ${reason}`);
 *
 * // Reuse cache for subsequent selections
 * const { adapter: adapter2 } = await createAutoAdapter({ cache });
 *
 * // Force CLI only
 * const { adapter } = await createAutoAdapter({ priority: 'cli-only' });
 * ```
 */
export async function createAutoAdapter(config: AutoAdapterConfig = {}): Promise<AdapterSelection> {
  const logger = config.logger ?? defaultLogger;
  const priority = config.priority ?? 'cli-first';
  const cache = resolveCache(config, logger);

  logger.info('Auto-selecting adapter', { priority, cacheEnabled: cache !== undefined });

  switch (priority) {
    case 'cli-first':
      return selectCliFirst(config, logger, cache);
    case 'api-first':
      return selectApiFirst(config, logger, cache);
    case 'cli-only':
      return selectCliOnly(config, logger, cache);
    case 'api-only':
      return selectApiOnly(config, logger);
    default: {
      const exhaustive: never = priority;
      throw new Error(`Unknown priority: ${String(exhaustive)}`);
    }
  }
}

/**
 * Checks which adapters are available without creating them.
 * Uses caching to avoid repeated CLI health checks.
 *
 * @param cache - Optional cache to use
 * @returns Available CLIs and whether Anthropic API key is set
 */
export async function getAvailableAdapters(cache?: ICliDetectionCache): Promise<{
  clis: CliName[];
  hasAnthropicKey: boolean;
  cache?: ICliDetectionCache;
}> {
  const effectiveCache = cache ?? createCliDetectionCache();
  const clis = await getAvailableClis(effectiveCache);
  const hasAnthropicKey =
    process.env.ANTHROPIC_API_KEY !== undefined && process.env.ANTHROPIC_API_KEY.length > 0;

  return { clis, hasAnthropicKey, cache: effectiveCache };
}
