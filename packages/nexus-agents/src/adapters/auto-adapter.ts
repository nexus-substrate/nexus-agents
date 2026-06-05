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
import { createModelToCliAdapter } from '../cli-adapters/model-to-cli-adapter.js';
import { createClaudeAdapter } from './claude-adapter.js';
import { SdkAdapter } from './sdk/index.js';
import type { CliName, ICliAdapter, ApiVendor, ApiArmId } from '../cli-adapters/types.js';
import { apiArmId } from '../cli-adapters/types.js';
import { buildCliCapabilityProfiles } from '../config/model-config-helpers.js';
import type { ICliDetectionCache } from '../cli-adapters/cli-detection-cache.js';
import { createCliDetectionCache } from '../cli-adapters/cli-detection-cache.js';
import { CUSTOM_API_DEFAULT_MODEL } from '../config/defaults.js';
import { getCliModelName, getDefaultModelForCli } from '../config/model-config-helpers.js';

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
  /** API key for OpenAI (optional, for fallback via AI SDK) */
  readonly openaiApiKey?: string;
  /** API key for Google AI (optional, for fallback via AI SDK) */
  readonly googleApiKey?: string;
  /** Logger instance */
  readonly logger?: ILogger;
  /** CLI detection cache (optional, creates new if not provided) */
  readonly cache?: ICliDetectionCache;
  /** Whether to create and use cache if not provided (default: true) */
  readonly enableCache?: boolean;
  /** Default timeout for CLI subprocess calls (ms). Overrides auto-detection. */
  readonly defaultCliTimeoutMs?: number;
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

  const bridgeConfig =
    config.defaultCliTimeoutMs !== undefined
      ? { defaultTimeoutMs: config.defaultCliTimeoutMs }
      : undefined;

  // If preferred CLI specified, try that first
  if (preferredCli !== undefined && (await isCliAvailable(preferredCli, cache))) {
    logger.info('Using preferred CLI', { cli: preferredCli });
    const cliAdapter = createCliAdapter({ cli: preferredCli, logger });
    await cliAdapter.initialize();
    return {
      adapter: createCliToModelAdapter(cliAdapter, bridgeConfig),
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
    adapter: createCliToModelAdapter(cliAdapter, bridgeConfig),
    source: 'cli',
    name: selectedCli,
    reason: `Using '${selectedCli}' CLI (model selection handled by CLI)`,
    cache,
  };
}

/**
 * Resolves an API key from config or environment variable.
 */
function resolveApiKeyFromEnv(configKey: string | undefined, envVar: string): string | undefined {
  const key = configKey ?? process.env[envVar];
  return key !== undefined && key.length > 0 ? key : undefined;
}

/**
 * Attempts to create an API-based model adapter.
 * Tries providers in order: Anthropic (native), OpenAI (SDK), Google (SDK).
 * This is a fallback when no CLIs are available.
 */
function tryApiAdapter(config: AutoAdapterConfig, logger: ILogger): AdapterSelection | null {
  // Derive default model IDs from canonical registry instead of hardcoding
  const claudeModelId = getCliModelName(getDefaultModelForCli('claude'));
  const codexModelId = getCliModelName(getDefaultModelForCli('codex'));
  const geminiModelId = getCliModelName(getDefaultModelForCli('gemini'));

  // 1. Anthropic — use native ClaudeAdapter (battle-tested)
  const anthropicKey = resolveApiKeyFromEnv(config.anthropicApiKey, 'ANTHROPIC_API_KEY');
  if (anthropicKey !== undefined) {
    logger.info('Using Anthropic API adapter', { model: claudeModelId });
    return {
      adapter: createClaudeAdapter({ modelId: claudeModelId, apiKey: anthropicKey }),
      source: 'api',
      name: 'anthropic',
      reason: `Using Anthropic API (native adapter, model: ${claudeModelId})`,
    };
  }

  // 2. OpenAI — use AI SDK adapter
  const openaiKey = resolveApiKeyFromEnv(config.openaiApiKey, 'OPENAI_API_KEY');
  if (openaiKey !== undefined) {
    logger.info('Using OpenAI API adapter (AI SDK)', { model: codexModelId });
    return {
      adapter: new SdkAdapter({ providerId: 'openai', modelId: codexModelId, apiKey: openaiKey }),
      source: 'api',
      name: 'openai',
      reason: `Using OpenAI API via AI SDK (model: ${codexModelId})`,
    };
  }

  // 3. Google — use AI SDK adapter
  const googleKey = resolveApiKeyFromEnv(config.googleApiKey, 'GOOGLE_AI_API_KEY');
  if (googleKey !== undefined) {
    logger.info('Using Google AI API adapter (AI SDK)', { model: geminiModelId });
    return {
      adapter: new SdkAdapter({
        providerId: 'google',
        modelId: geminiModelId,
        apiKey: googleKey,
      }),
      source: 'api',
      name: 'google',
      reason: `Using Google AI API via AI SDK (model: ${geminiModelId})`,
    };
  }

  // 4. Custom OpenAI-compatible gateway (multi-vendor proxies, self-hosted
  //    LLM servers, corporate gateways). Extracted for line limit.
  const custom = tryCustomOpenAiAdapter(logger);
  if (custom !== null) return custom;

  logger.info('No API keys available for any provider');
  return null;
}

/**
 * Tries the custom-openai SDK adapter if `NEXUS_CUSTOM_API_KEY` and
 * `NEXUS_CUSTOM_API_BASE_URL` are both set. The adapter constructor
 * runs the base URL through an SSRF guard (see
 * adapters/sdk/custom-api-validation.ts). Epic #2119.
 */
function tryCustomOpenAiAdapter(logger: ILogger): AdapterSelection | null {
  const customKey = resolveApiKeyFromEnv(undefined, 'NEXUS_CUSTOM_API_KEY');
  const customBaseUrl = process.env['NEXUS_CUSTOM_API_BASE_URL'];
  if (customKey === undefined || customBaseUrl === undefined || customBaseUrl === '') {
    return null;
  }
  const customModelId = process.env['NEXUS_CUSTOM_MODEL'] ?? CUSTOM_API_DEFAULT_MODEL;
  logger.info('Using custom-openai SDK adapter', {
    model: customModelId,
    baseUrl: customBaseUrl,
  });
  return {
    adapter: new SdkAdapter({
      providerId: 'custom-openai',
      modelId: customModelId,
      apiKey: customKey,
      baseUrl: customBaseUrl,
    }),
    source: 'api',
    name: 'custom-openai',
    reason: `Using custom OpenAI-compatible gateway at ${customBaseUrl} (model: ${customModelId})`,
  };
}

/**
 * Resolve an API-vendor name to its `{vendor, slot}` pair (#3422). `slot` is the
 * *attribution* CLI slot (`getModelInfo`, capability profile) — NOT the routing
 * arm id, which stays distinct (`api:<vendor>`) so CLI and API telemetry never
 * merge. Exhaustive switch (concrete literals, no index-access undefined).
 */
function resolveApiVendor(name: string): { vendor: ApiVendor; slot: CliName } | undefined {
  switch (name) {
    case 'anthropic':
      return { vendor: 'anthropic', slot: 'claude' };
    case 'openai':
      return { vendor: 'openai', slot: 'codex' };
    case 'google':
      return { vendor: 'google', slot: 'gemini' };
    case 'custom-openai':
      return { vendor: 'custom-openai', slot: 'opencode' };
    default:
      return undefined;
  }
}

/**
 * Wrap an `AdapterSelection{source:'api'}` for insertion into a CompositeRouter's
 * `Map<RoutingArmId, ICliAdapter>` (#3317 step 1 / #3422). Returns the distinct
 * routing arm id (`api:<vendor>`) and an `ICliAdapter` view of the IModelAdapter
 * (via {@link createModelToCliAdapter}). Returns null for CLI selections (the
 * router already gets those from `createAllAdapters` under their slot key) or an
 * unrecognized vendor.
 */
export function wrapApiSelectionForRouter(
  selection: AdapterSelection
): { armId: ApiArmId; adapter: ICliAdapter } | null {
  if (selection.source !== 'api') return null;
  const resolved = resolveApiVendor(selection.name);
  if (resolved === undefined) return null;
  const adapter = createModelToCliAdapter(selection.adapter, {
    name: resolved.slot,
    capabilities: buildCliCapabilityProfiles()[resolved.slot],
  });
  return { armId: apiArmId(resolved.vendor), adapter };
}

/**
 * Build an `AdapterSelection{source:'api'}` for a single vendor when its key(s)
 * are present, else null. Reuses the same adapter constructors as
 * {@link tryApiAdapter} but is key-presence-only and never calls out (#3422).
 */
function buildApiSelectionForVendor(vendor: ApiVendor, logger: ILogger): AdapterSelection | null {
  switch (vendor) {
    case 'anthropic': {
      const key = resolveApiKeyFromEnv(undefined, 'ANTHROPIC_API_KEY');
      if (key === undefined) return null;
      const modelId = getCliModelName(getDefaultModelForCli('claude'));
      return {
        adapter: createClaudeAdapter({ modelId, apiKey: key }),
        source: 'api',
        name: 'anthropic',
        reason: `Using Anthropic API (native adapter, model: ${modelId})`,
      };
    }
    case 'openai': {
      const key = resolveApiKeyFromEnv(undefined, 'OPENAI_API_KEY');
      if (key === undefined) return null;
      const modelId = getCliModelName(getDefaultModelForCli('codex'));
      return {
        adapter: new SdkAdapter({ providerId: 'openai', modelId, apiKey: key }),
        source: 'api',
        name: 'openai',
        reason: `Using OpenAI API via AI SDK (model: ${modelId})`,
      };
    }
    case 'google': {
      const key = resolveApiKeyFromEnv(undefined, 'GOOGLE_AI_API_KEY');
      if (key === undefined) return null;
      const modelId = getCliModelName(getDefaultModelForCli('gemini'));
      return {
        adapter: new SdkAdapter({ providerId: 'google', modelId, apiKey: key }),
        source: 'api',
        name: 'google',
        reason: `Using Google AI API via AI SDK (model: ${modelId})`,
      };
    }
    case 'custom-openai':
      return tryCustomOpenAiAdapter(logger);
    default: {
      const exhaustive: never = vendor;
      throw new Error(`Unknown API vendor: ${String(exhaustive)}`);
    }
  }
}

/** API vendors enumerated in routing-arm order (#3422). */
const API_ROUTING_VENDORS: readonly ApiVendor[] = [
  'anthropic',
  'openai',
  'google',
  'custom-openai',
];

/**
 * Enumerate the direct-API routing arms whose keys are present in the
 * environment, each wrapped as an `ICliAdapter` keyed by its distinct
 * `api:<vendor>` arm id (#3422). Key-presence-only and deterministic: a vendor
 * is included iff its required env var(s) are set; keys are never validated by
 * calling out. Used by `createAllAdapters` under `NEXUS_BILLING_MODE=api`.
 */
export function collectApiRoutingArms(
  logger: ILogger = defaultLogger
): Array<{ armId: ApiArmId; adapter: ICliAdapter }> {
  const arms: Array<{ armId: ApiArmId; adapter: ICliAdapter }> = [];
  for (const vendor of API_ROUTING_VENDORS) {
    const selection = buildApiSelectionForVendor(vendor, logger);
    if (selection === null) continue;
    const wrapped = wrapApiSelectionForRouter(selection);
    if (wrapped !== null) arms.push(wrapped);
  }
  return arms;
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
    'No adapters available. Install a CLI (claude/gemini/codex) or set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_AI_API_KEY.'
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
    'No adapters available. Set ANTHROPIC_API_KEY/OPENAI_API_KEY/GOOGLE_AI_API_KEY or install a CLI (claude/gemini/codex).'
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
  throw new Error(
    'No API key available. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_AI_API_KEY.'
  );
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
 * @returns Available CLIs and which API keys are set
 */
export async function getAvailableAdapters(cache?: ICliDetectionCache): Promise<{
  clis: CliName[];
  hasAnthropicKey: boolean;
  hasOpenaiKey: boolean;
  hasGoogleKey: boolean;
  cache?: ICliDetectionCache;
}> {
  const effectiveCache = cache ?? createCliDetectionCache();
  const clis = await getAvailableClis(effectiveCache);

  return {
    clis,
    hasAnthropicKey: resolveApiKeyFromEnv(undefined, 'ANTHROPIC_API_KEY') !== undefined,
    hasOpenaiKey: resolveApiKeyFromEnv(undefined, 'OPENAI_API_KEY') !== undefined,
    hasGoogleKey: resolveApiKeyFromEnv(undefined, 'GOOGLE_AI_API_KEY') !== undefined,
    cache: effectiveCache,
  };
}
