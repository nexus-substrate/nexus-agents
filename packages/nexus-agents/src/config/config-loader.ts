/**
 * nexus-agents/config - Config File Loader
 *
 * Loads and validates nexus-agents.yaml using AppConfigSchema.
 * This module provides the missing link between the config file and runtime.
 *
 * @module config/config-loader
 * (Source: Issue #472 - Wire AppConfigSchema to runtime)
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { resolveInsideRoot } from '../security/safe-path.js';
import { getNexusDataDir } from './nexus-data-dir.js';
import * as yaml from 'yaml';
import { AppConfigSchema, type AppConfig, defaultConfig } from './schemas.js';
import type { Result } from '../core/index.js';
import { ok, err, formatZodIssuesAsArray } from '../core/index.js';
import type { ILogger } from '../core/index.js';
import { createLogger } from '../core/logger.js';

/** Default config file name. */
const DEFAULT_CONFIG_FILE = 'nexus-agents.yaml';

/** Alternate config file name. */
const ALTERNATE_CONFIG_FILE = 'nexus-agents.yml';

/**
 * Preferred config-file locations, checked in order. Per epic #2872 the
 * dotdir-scoped variant wins over the root-level legacy locations so new
 * installs land their config under `.nexus-agents/` instead of cluttering
 * the repo root. Existing root-level files keep working without action
 * (backward compat); they're picked up by the fallback tier.
 */
const CONFIG_LOOKUP_PATHS: readonly string[] = [
  `.nexus-agents/${DEFAULT_CONFIG_FILE}`,
  `.nexus-agents/${ALTERNATE_CONFIG_FILE}`,
  DEFAULT_CONFIG_FILE,
  ALTERNATE_CONFIG_FILE,
];

/**
 * Result of loading configuration.
 */
export interface ConfigLoadResult {
  /** The validated configuration */
  config: AppConfig;
  /** Path to config file (if loaded from file) */
  configPath?: string;
  /** Whether defaults were used */
  usingDefaults: boolean;
  /** Validation warnings (partial config merged with defaults) */
  warnings: string[];
}

/**
 * Error when config loading fails.
 */
export class ConfigLoadError extends Error {
  public readonly code: ConfigLoadErrorCode;

  constructor(message: string, code: ConfigLoadErrorCode, cause?: Error) {
    super(message, { cause });
    this.name = 'ConfigLoadError';
    this.code = code;
  }
}

export type ConfigLoadErrorCode =
  | 'FILE_READ_ERROR'
  | 'YAML_PARSE_ERROR'
  | 'VALIDATION_ERROR'
  | 'PATH_TRAVERSAL';

/**
 * Options for loading configuration.
 */
export interface ConfigLoadOptions {
  /** Explicit path to config file */
  configPath?: string;
  /** Logger for diagnostics */
  logger?: ILogger;
  /** Working directory for relative paths (default: process.cwd()) */
  cwd?: string;
  /** Whether to merge with defaults (default: true) */
  mergeDefaults?: boolean;
}

/**
 * Validates that a path doesn't escape the allowed root.
 */
function validatePath(userPath: string, root: string): Result<string, ConfigLoadError> {
  const resolved = resolveInsideRoot(userPath, root);
  if (resolved === null) {
    return err(
      new ConfigLoadError(
        `Config path traversal detected: ${userPath} escapes ${root}`,
        'PATH_TRAVERSAL'
      )
    );
  }
  return ok(resolved);
}

/**
 * Finds the config file path.
 */
function findConfigPath(cwd: string): string | undefined {
  // Check environment variable first
  const envPath = process.env['NEXUS_CONFIG_PATH'];
  if (envPath !== undefined && envPath !== '') {
    const validation = validatePath(envPath, cwd);
    if (validation.ok && existsSync(validation.value)) {
      return validation.value;
    }
  }

  // Probe each lookup path in order — dotdir wins over root-level legacy.
  for (const rel of CONFIG_LOOKUP_PATHS) {
    const abs = resolve(cwd, rel);
    if (existsSync(abs)) {
      return abs;
    }
  }

  // Check global config directory (resolved data dir) as fallback (#1265 + #2316)
  const globalDir = getNexusDataDir();
  const globalYamlPath = join(globalDir, DEFAULT_CONFIG_FILE);
  if (existsSync(globalYamlPath)) {
    return globalYamlPath;
  }
  const globalYmlPath = join(globalDir, ALTERNATE_CONFIG_FILE);
  if (existsSync(globalYmlPath)) {
    return globalYmlPath;
  }

  return undefined;
}

/**
 * Parses YAML content safely.
 */
function parseYaml(content: string): Result<unknown, ConfigLoadError> {
  try {
    const parsed: unknown = yaml.parse(content);
    return ok(parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown YAML parse error';
    return err(
      new ConfigLoadError(`YAML parse error: ${message}`, 'YAML_PARSE_ERROR', error as Error)
    );
  }
}

/** Keys that must never be merged — they target the prototype chain (CWE-1321). */
const PROTOTYPE_POLLUTION_KEYS: ReadonlySet<string> = new Set([
  '__proto__',
  'constructor',
  'prototype',
]);

/** True when both values are mergeable plain objects (not arrays/null). */
function isMergeableObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Deep merges two objects, with source taking precedence.
 *
 * Exported for direct unit testing of the prototype-pollution guard.
 * @internal
 */
export function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...target };

  for (const key of Object.keys(source)) {
    if (PROTOTYPE_POLLUTION_KEYS.has(key)) continue;
    const sourceValue = source[key];
    if (sourceValue === undefined) continue;
    const targetValue = target[key];

    if (isMergeableObject(sourceValue) && isMergeableObject(targetValue)) {
      result[key] = deepMerge(targetValue, sourceValue);
    } else {
      result[key] = sourceValue;
    }
  }

  return result;
}

/** Returns default config when no file is found. */
function loadDefaultConfig(logger: ILogger): Result<ConfigLoadResult, ConfigLoadError> {
  logger.debug('No config file found, using defaults');
  const validated = AppConfigSchema.safeParse(defaultConfig);
  if (!validated.success) {
    return err(
      new ConfigLoadError(
        `Default config validation failed: ${validated.error.message}`,
        'VALIDATION_ERROR'
      )
    );
  }
  return ok({
    config: validated.data,
    usingDefaults: true,
    warnings: ['No config file found, using default configuration'],
  });
}

/** Reads and parses config file content. */
function readAndParseConfig(
  configPath: string,
  mergeDefaults: boolean,
  logger: ILogger
): Result<unknown, ConfigLoadError> {
  let content: string;
  try {
    content = readFileSync(configPath, 'utf-8');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return err(
      new ConfigLoadError(
        `Failed to read config file: ${message}`,
        'FILE_READ_ERROR',
        error as Error
      )
    );
  }

  const parseResult = parseYaml(content);
  if (!parseResult.ok) return err(parseResult.error);

  if (mergeDefaults && typeof parseResult.value === 'object' && parseResult.value !== null) {
    logger.debug('Merged config with defaults');
    return ok(
      deepMerge(
        defaultConfig as Record<string, unknown>,
        parseResult.value as Record<string, unknown>
      )
    );
  }
  return ok(parseResult.value);
}

/** Validates parsed config against schema. */
function validateConfig(
  configData: unknown,
  configPath: string,
  logger: ILogger
): Result<ConfigLoadResult, ConfigLoadError> {
  const validation = AppConfigSchema.safeParse(configData);
  if (!validation.success) {
    const issues = formatZodIssuesAsArray(validation.error);
    return err(
      new ConfigLoadError(`Config validation failed:\n${issues.join('\n')}`, 'VALIDATION_ERROR')
    );
  }
  logger.info('Configuration loaded successfully', { configPath });
  return ok({ config: validation.data, configPath, usingDefaults: false, warnings: [] });
}

/**
 * Loads and validates configuration from a file.
 */
export function loadConfig(
  options: ConfigLoadOptions = {}
): Result<ConfigLoadResult, ConfigLoadError> {
  const { configPath: explicitPath, cwd = process.cwd(), mergeDefaults = true } = options;
  const logger = options.logger ?? createLogger({ component: 'ConfigLoader' });

  // Resolve config file path
  let configPath: string | undefined;
  if (explicitPath !== undefined) {
    const validation = validatePath(explicitPath, cwd);
    if (!validation.ok) return err(validation.error);
    configPath = validation.value;
  } else {
    configPath = findConfigPath(cwd);
  }

  // Use defaults if no config file found
  if (configPath === undefined) return loadDefaultConfig(logger);

  // Read, parse, and validate
  const parseResult = readAndParseConfig(configPath, mergeDefaults, logger);
  if (!parseResult.ok) return err(parseResult.error);

  return validateConfig(parseResult.value, configPath, logger);
}

/**
 * Singleton instance of loaded configuration.
 * Lazily initialized on first access.
 */
let loadedConfig: ConfigLoadResult | undefined;

/**
 * Gets the currently loaded configuration.
 * Loads from file on first call, then returns cached result.
 *
 * @param options - Load options (only used on first call)
 * @returns The loaded configuration
 * @throws ConfigLoadError if loading fails
 */
export function getConfig(options?: ConfigLoadOptions): ConfigLoadResult {
  if (loadedConfig !== undefined) {
    return loadedConfig;
  }

  const result = loadConfig(options);
  if (!result.ok) {
    throw result.error;
  }
  loadedConfig = result.value;
  return loadedConfig;
}

/**
 * Clears the cached configuration.
 * Useful for testing or hot-reloading.
 */
export function clearConfigCache(): void {
  loadedConfig = undefined;
}

/**
 * Reloads configuration from file.
 * Replaces the cached configuration.
 *
 * @param options - Load options
 * @returns Result with new configuration or error
 */
export function reloadConfig(
  options?: ConfigLoadOptions
): Result<ConfigLoadResult, ConfigLoadError> {
  clearConfigCache();
  const result = loadConfig(options);
  if (result.ok) {
    loadedConfig = result.value;
  }
  return result;
}
