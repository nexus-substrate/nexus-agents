/**
 * ConfigManager - Runtime Configuration Management (Issue #360 Phase 1)
 *
 * Precedence (highest to lowest):
 * 1. CLI overrides  2. Session overrides  3. Environment variables  4. Package defaults
 *
 * @module config/config-manager
 */

import { z } from 'zod';
import { getTimeProvider } from '../core/index.js';
import { DEFAULTS } from './defaults.js';

// ============================================================================
// Types
// ============================================================================

/** Configuration source indicating where a value originated. */
export type ConfigSource = 'package' | 'env' | 'user_file' | 'session' | 'cli';

/** Metadata about a configuration value. */
export interface ConfigValueMeta<T> {
  readonly value: T;
  readonly source: ConfigSource;
  readonly key: string;
  readonly isOverride: boolean;
  readonly defaultValue: T;
}

/** An active override entry. */
export interface ConfigOverride<T = unknown> {
  readonly value: T;
  readonly source: ConfigSource;
  readonly setAt: Date;
}

/** Configuration categories matching DEFAULTS structure. */
export type ConfigCategory = keyof typeof DEFAULTS;

/** Keys for a specific category. */
export type ConfigKey<C extends ConfigCategory> = keyof (typeof DEFAULTS)[C];

/** Widens literal types: 60000 -> number, true -> boolean, 'foo' -> string */
type Widen<T> = T extends number
  ? number
  : T extends boolean
    ? boolean
    : T extends string
      ? string
      : T;

/** Value type for category/key (widened for assignment). */
export type ConfigValue<C extends ConfigCategory, K extends ConfigKey<C>> = Widen<
  (typeof DEFAULTS)[C][K]
>;

// ============================================================================
// Validation
// ============================================================================

const NumericValueSchema = z.number();
const BooleanValueSchema = z.boolean();
const StringValueSchema = z.string();

function validateValue<T>(value: unknown, expectedType: T): value is T {
  if (typeof expectedType === 'number') return NumericValueSchema.safeParse(value).success;
  if (typeof expectedType === 'boolean') return BooleanValueSchema.safeParse(value).success;
  if (typeof expectedType === 'string') return StringValueSchema.safeParse(value).success;
  return false;
}

// ============================================================================
// Environment Variable Mapping
// ============================================================================

/** Maps category.key to NEXUS_* environment variable names. */
const ENV_VAR_MAP: Partial<Record<string, string>> = {
  'TIMEOUT_DEFAULTS.cliMs': 'NEXUS_TIMEOUT_CLI',
  'TIMEOUT_DEFAULTS.apiMs': 'NEXUS_TIMEOUT_API',
  'TIMEOUT_DEFAULTS.workflowMs': 'NEXUS_TIMEOUT_WORKFLOW',
  'TIMEOUT_DEFAULTS.mcpMs': 'NEXUS_TIMEOUT_MCP',
  'RATE_LIMIT_DEFAULTS.requestsPerMinute': 'NEXUS_RATE_LIMIT_RPM',
  'RATE_LIMIT_DEFAULTS.enabled': 'NEXUS_RATE_LIMIT_ENABLED',
  'RATE_LIMIT_DEFAULTS.maxConcurrent': 'NEXUS_RATE_LIMIT_MAX_CONCURRENT',
  'RATE_LIMIT_DEFAULTS.capacity': 'NEXUS_RATE_LIMIT_CAPACITY',
  'RATE_LIMIT_DEFAULTS.refillRate': 'NEXUS_RATE_LIMIT_REFILL_RATE',
  'RATE_LIMIT_DEFAULTS.refillIntervalMs': 'NEXUS_RATE_LIMIT_REFILL_INTERVAL',
  'RETRY_DEFAULTS.maxRetries': 'NEXUS_RETRY_MAX_RETRIES',
  'RETRY_DEFAULTS.baseDelayMs': 'NEXUS_RETRY_BASE_DELAY',
  'RETRY_DEFAULTS.maxDelayMs': 'NEXUS_RETRY_MAX_DELAY',
  'RETRY_DEFAULTS.jitterFactor': 'NEXUS_RETRY_JITTER',
  'WORKER_DEFAULTS.maxWorkers': 'NEXUS_WORKERS_MAX',
  'WORKER_DEFAULTS.poolSize': 'NEXUS_WORKERS_POOL_SIZE',
  'WORKER_DEFAULTS.idleTimeoutMs': 'NEXUS_WORKERS_IDLE_TIMEOUT',
  'WORKER_DEFAULTS.workflowMaxParallel': 'NEXUS_WORKFLOW_MAX_PARALLEL',
  'WORKER_DEFAULTS.testParallelism': 'NEXUS_TEST_PARALLELISM',
  'WORKER_DEFAULTS.evaluationMaxWorkers': 'NEXUS_EVALUATION_MAX_WORKERS',
  'WORKER_DEFAULTS.eventBusMaxHistory': 'NEXUS_EVENTBUS_MAX_HISTORY',
  'WORKER_DEFAULTS.swarmObserverMaxEvents': 'NEXUS_SWARM_OBSERVER_MAX_EVENTS',
  'CIRCUIT_BREAKER_DEFAULTS.failureThreshold': 'NEXUS_CIRCUIT_BREAKER_THRESHOLD',
  'CIRCUIT_BREAKER_DEFAULTS.resetTimeoutMs': 'NEXUS_CIRCUIT_BREAKER_RESET_TIMEOUT',
};

function parseEnvValue<T>(envValue: string, defaultValue: T): T | undefined {
  if (typeof defaultValue === 'number') {
    const parsed = Number(envValue);
    return !isNaN(parsed) && isFinite(parsed) ? (parsed as T) : undefined;
  }
  if (typeof defaultValue === 'boolean') {
    const lower = envValue.toLowerCase();
    if (lower === 'true' || lower === '1') return true as T;
    if (lower === 'false' || lower === '0') return false as T;
    return undefined; // Unknown value — use default
  }
  if (typeof defaultValue === 'string') return envValue as T;
  return undefined;
}

// ============================================================================
// ConfigManager Class
// ============================================================================

/**
 * Singleton ConfigManager for runtime configuration management.
 *
 * @example
 * const config = ConfigManager.getInstance();
 * const timeout = config.get('TIMEOUT_DEFAULTS', 'cliMs');
 * config.setOverride('TIMEOUT_DEFAULTS', 'cliMs', 90000, 'session');
 */
export class ConfigManager {
  private static instance: ConfigManager | null = null;
  private readonly overrides: Map<string, ConfigOverride> = new Map();

  private constructor() {}

  /** Gets the singleton instance. */
  static getInstance(): ConfigManager {
    ConfigManager.instance ??= new ConfigManager();
    return ConfigManager.instance;
  }

  /** Resets the singleton instance (for testing). */
  static resetInstance(): void {
    ConfigManager.instance = null;
  }

  /** Gets the effective value for a configuration key. */
  get<C extends ConfigCategory, K extends ConfigKey<C>>(category: C, key: K): ConfigValue<C, K> {
    return this.getWithMeta(category, key).value;
  }

  /** Gets the effective value with source metadata. */
  getWithMeta<C extends ConfigCategory, K extends ConfigKey<C>>(
    category: C,
    key: K
  ): ConfigValueMeta<ConfigValue<C, K>> {
    const fullKey = `${category}.${String(key)}`;
    const defaultValue = DEFAULTS[category][key] as ConfigValue<C, K>;

    // Check overrides (CLI > session)
    const override = this.overrides.get(fullKey);
    if (override) {
      return {
        value: override.value as ConfigValue<C, K>,
        source: override.source,
        key: fullKey,
        isOverride: true,
        defaultValue,
      };
    }

    // Check environment variable
    const envVar = ENV_VAR_MAP[fullKey];
    if (envVar !== undefined && envVar.length > 0) {
      const envValue = process.env[envVar];
      if (envValue !== undefined) {
        const parsed = parseEnvValue(envValue, defaultValue);
        if (parsed !== undefined) {
          return { value: parsed, source: 'env', key: fullKey, isOverride: true, defaultValue };
        }
      }
    }

    return {
      value: defaultValue,
      source: 'package',
      key: fullKey,
      isOverride: false,
      defaultValue,
    };
  }

  /**
   * Sets an override for a configuration key.
   * @throws {Error} If value fails type validation
   */
  setOverride<C extends ConfigCategory, K extends ConfigKey<C>>(
    category: C,
    key: K,
    value: ConfigValue<C, K>,
    source: ConfigSource
  ): void {
    const fullKey = `${category}.${String(key)}`;
    const defaultValue = DEFAULTS[category][key];

    if (!validateValue(value, defaultValue)) {
      throw new Error(
        `Invalid value type for ${fullKey}: expected ${typeof defaultValue}, got ${typeof value}`
      );
    }

    this.overrides.set(fullKey, { value, source, setAt: new Date(getTimeProvider().now()) });
  }

  /** Clears an override. Returns true if it existed. */
  clearOverride<C extends ConfigCategory>(category: C, key: ConfigKey<C>): boolean {
    return this.overrides.delete(`${category}.${String(key)}`);
  }

  /** Clears all overrides. */
  clearAllOverrides(): void {
    this.overrides.clear();
  }

  /** Lists all active overrides. */
  listOverrides(): ReadonlyArray<{
    key: string;
    value: unknown;
    source: ConfigSource;
    setAt: Date;
  }> {
    return Array.from(this.overrides.entries()).map(([key, override]) => ({
      key,
      value: override.value,
      source: override.source,
      setAt: override.setAt,
    }));
  }

  /** Lists all configuration keys with their effective values. */
  listAll(categoryFilter?: ConfigCategory): ReadonlyArray<{
    category: string;
    key: string;
    value: unknown;
    source: ConfigSource;
    envVar: string | undefined;
  }> {
    const categories = categoryFilter
      ? [categoryFilter]
      : (Object.keys(DEFAULTS) as ConfigCategory[]);
    const result: Array<{
      category: string;
      key: string;
      value: unknown;
      source: ConfigSource;
      envVar: string | undefined;
    }> = [];

    for (const category of categories) {
      for (const key of Object.keys(DEFAULTS[category])) {
        const fullKey = `${category}.${key}`;
        const meta = this.getWithMeta(category, key as ConfigKey<typeof category>);
        result.push({
          category,
          key,
          value: meta.value,
          source: meta.source,
          envVar: ENV_VAR_MAP[fullKey],
        });
      }
    }
    return result;
  }

  /** Gets the environment variable name for a config key. */
  getEnvVarName<C extends ConfigCategory>(category: C, key: ConfigKey<C>): string | undefined {
    return ENV_VAR_MAP[`${category}.${String(key)}`];
  }

  /** Checks if a key has an active override. */
  hasOverride<C extends ConfigCategory>(category: C, key: ConfigKey<C>): boolean {
    return this.overrides.has(`${category}.${String(key)}`);
  }
}

/** Gets the ConfigManager singleton instance. */
export function getConfigManager(): ConfigManager {
  return ConfigManager.getInstance();
}
