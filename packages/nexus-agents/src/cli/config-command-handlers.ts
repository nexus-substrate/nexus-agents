/**
 * Config Command Handlers
 *
 * Implements handler functions for config management CLI commands.
 * Split from config-command.ts to reduce file size and complexity.
 *
 * @module cli/config-command-handlers
 * (Source: Issue #360 - CLI Config Management)
 */

import * as fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { getConfigManager } from '../config/config-manager.js';
import type { ConfigCategory } from '../config/config-manager.js';
import { DEFAULTS } from '../config/defaults.js';
import { getErrorMessage } from '../core/index.js';
import type {
  ConfigGetResult,
  ConfigSetResult,
  ConfigListResult,
  ConfigResetResult,
  ConfigExportResult,
  ConfigImportResult,
  ConfigListEntry,
} from './config-command-types.js';
import { ConfigCommandError } from './config-command-types.js';
import {
  parseConfigKey,
  parseValueFromString,
  resolveFilePath,
  getDefaultExportPath,
  serializeConfig,
  parseConfigFile,
} from './config-command-helpers.js';

// ============================================================================
// Get Handler
// ============================================================================

/**
 * Handles the 'get' subcommand.
 * Retrieves a configuration value by key.
 */
export async function handleGet(key: string): Promise<ConfigGetResult> {
  const parsed = parseConfigKey(key);
  const config = getConfigManager();

  const meta = config.getWithMeta(
    parsed.category as ConfigCategory,
    parsed.key as keyof (typeof DEFAULTS)[ConfigCategory]
  );

  return Promise.resolve({
    success: true,
    action: 'get',
    message: `Retrieved value for ${key}`,
    key: parsed.fullKey,
    value: meta.value,
    source: meta.source,
    defaultValue: meta.defaultValue,
  });
}

// ============================================================================
// Set Handler
// ============================================================================

/**
 * Handles the 'set' subcommand.
 * Sets an in-process override for this invocation without persisting it.
 */
export async function handleSet(key: string, valueStr: string): Promise<ConfigSetResult> {
  const parsed = parseConfigKey(key);
  const config = getConfigManager();

  // Get current value and default for type inference
  const meta = config.getWithMeta(
    parsed.category as ConfigCategory,
    parsed.key as keyof (typeof DEFAULTS)[ConfigCategory]
  );

  const previousValue = meta.value;
  const newValue = parseValueFromString(valueStr, meta.defaultValue);

  // Set the override
  config.setOverride(
    parsed.category as ConfigCategory,
    parsed.key as keyof (typeof DEFAULTS)[ConfigCategory],
    newValue as never,
    'session'
  );

  const envVar = config.getEnvVarName(
    parsed.category as ConfigCategory,
    parsed.key as keyof (typeof DEFAULTS)[ConfigCategory]
  );
  const persistenceGuidance =
    envVar === undefined ? '' : ` Set ${envVar} to persist this value across invocations.`;

  return Promise.resolve({
    success: true,
    action: 'set',
    scope: 'process',
    message: `Set ${key} = ${String(newValue)} for this invocation only.${persistenceGuidance}`,
    key: parsed.fullKey,
    previousValue,
    newValue,
  });
}

// ============================================================================
// List Handler
// ============================================================================

/**
 * Handles the 'list' subcommand.
 * Lists all configuration values.
 */
export async function handleList(): Promise<ConfigListResult> {
  const config = getConfigManager();
  const all = config.listAll();

  const entries: ConfigListEntry[] = all.map((item) => ({
    category: item.category,
    key: item.key,
    value: item.value,
    source: item.source,
    envVar: item.envVar,
  }));

  return Promise.resolve({
    success: true,
    action: 'list',
    message: `Listed ${String(entries.length)} configuration entries`,
    entries,
    total: entries.length,
  });
}

// ============================================================================
// Reset Handler
// ============================================================================

/**
 * Handles the 'reset' subcommand.
 * Resets configuration to defaults.
 */
export async function handleReset(key?: string): Promise<ConfigResetResult> {
  const config = getConfigManager();
  const keysReset: string[] = [];

  if (key !== undefined) {
    // Reset specific key
    const parsed = parseConfigKey(key);
    const fullKey = `${parsed.category}.${parsed.key}`;
    const cleared = config.clearOverride(
      parsed.category as ConfigCategory,
      parsed.key as keyof (typeof DEFAULTS)[ConfigCategory]
    );
    if (cleared) {
      keysReset.push(fullKey);
    }
  } else {
    // Reset all keys
    const overrides = config.listOverrides();
    for (const override of overrides) {
      keysReset.push(override.key);
    }
    config.clearAllOverrides();
  }

  const message =
    keysReset.length > 0
      ? `Reset ${String(keysReset.length)} configuration value(s) to defaults`
      : 'No overrides to reset';

  return Promise.resolve({
    success: true,
    action: 'reset',
    message,
    keysReset,
  });
}

// ============================================================================
// Export Handler
// ============================================================================

/**
 * Builds config entries from the config manager.
 */
function buildConfigEntries(): ConfigListEntry[] {
  const config = getConfigManager();
  const all = config.listAll();

  return all.map((item) => ({
    category: item.category,
    key: item.key,
    value: item.value,
    source: item.source,
    envVar: item.envVar,
  }));
}

/**
 * Writes config content to a file.
 */
async function writeConfigFile(filePath: string, content: string): Promise<void> {
  try {
    await fs.writeFile(filePath, content, 'utf-8');
  } catch (error) {
    const message = getErrorMessage(error);
    throw new ConfigCommandError('WRITE_ERROR', `Failed to write file: ${message}`);
  }
}

/**
 * Handles the 'export' subcommand.
 * Exports configuration to a file.
 */
export async function handleExport(
  file?: string,
  format: 'json' | 'yaml' = 'json'
): Promise<ConfigExportResult> {
  const filePath = file !== undefined ? resolveFilePath(file) : getDefaultExportPath(format);
  const entries = buildConfigEntries();
  const content = serializeConfig(entries, format);

  await writeConfigFile(filePath, content);

  return {
    success: true,
    action: 'export',
    message: `Exported ${String(entries.length)} entries to ${filePath}`,
    path: filePath,
    format,
    entriesExported: entries.length,
  };
}

// ============================================================================
// Import Handler - Helper Functions
// ============================================================================

/**
 * Validates and reads import file content.
 */
async function readImportFile(
  filePath: string
): Promise<{ content: string; format: 'json' | 'yaml' }> {
  if (!existsSync(filePath)) {
    throw new ConfigCommandError('FILE_NOT_FOUND', `File not found: ${filePath}`);
  }

  const format = filePath.endsWith('.yaml') || filePath.endsWith('.yml') ? 'yaml' : 'json';

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return { content, format };
  } catch (error) {
    const message = getErrorMessage(error);
    throw new ConfigCommandError('PARSE_ERROR', `Failed to read file: ${message}`);
  }
}

/**
 * Creates a backup of current overrides if needed.
 */
async function createBackupIfNeeded(force: boolean): Promise<string | undefined> {
  const config = getConfigManager();

  if (force || config.listOverrides().length === 0) {
    return undefined;
  }

  const tempExport = await handleExport(undefined, 'json');
  return tempExport.path;
}

/**
 * Checks if a string is a valid config category.
 */
function isValidCategory(category: string): category is ConfigCategory {
  return category in DEFAULTS;
}

/**
 * Applies a single config entry import.
 * Returns true if the entry was successfully imported.
 */
function applyConfigEntry(entry: { category: string; key: string; value: unknown }): boolean {
  const config = getConfigManager();

  // Validate the category exists using type guard
  if (!isValidCategory(entry.category)) {
    return false;
  }

  const categoryDefaults = DEFAULTS[entry.category];

  // Validate the key exists in the category
  if (!(entry.key in categoryDefaults)) {
    return false;
  }

  try {
    const defaultValue = categoryDefaults[entry.key as keyof typeof categoryDefaults];
    const parsedValue = parseValueFromString(String(entry.value), defaultValue);

    config.setOverride(
      entry.category,
      entry.key as keyof (typeof DEFAULTS)[ConfigCategory],
      parsedValue as never,
      'user_file'
    );

    return true;
  } catch {
    return false;
  }
}

/**
 * Handles the 'import' subcommand.
 * Imports configuration as in-process overrides for this invocation without persisting them.
 */
export async function handleImport(
  file: string,
  options: { force?: boolean } = {}
): Promise<ConfigImportResult> {
  const filePath = resolveFilePath(file);

  // Read and parse the file
  const { content, format } = await readImportFile(filePath);
  const imported = parseConfigFile(content, format);

  // Create backup if needed
  const backupPath = await createBackupIfNeeded(options.force === true);

  // Apply imported values
  let entriesImported = 0;
  const config = getConfigManager();
  const persistentEnvVars = new Set<string>();
  for (const entry of imported.entries) {
    if (applyConfigEntry(entry)) {
      entriesImported++;
      const envVar = config.getEnvVarName(
        entry.category as ConfigCategory,
        entry.key as keyof (typeof DEFAULTS)[ConfigCategory]
      );
      if (envVar !== undefined) {
        persistentEnvVars.add(envVar);
      }
    }
  }

  const persistenceGuidance =
    persistentEnvVars.size === 0
      ? ''
      : ` Set ${Array.from(persistentEnvVars).join(', ')} to persist mapped values across invocations.`;

  // Build result with conditional backupPath for exactOptionalPropertyTypes compatibility
  const baseResult = {
    success: true as const,
    action: 'import' as const,
    scope: 'process' as const,
    message: `Imported ${String(entriesImported)} entries from ${filePath} for this invocation only.${persistenceGuidance}`,
    path: filePath,
    entriesImported,
  };
  return backupPath !== undefined ? { ...baseResult, backupPath } : baseResult;
}
