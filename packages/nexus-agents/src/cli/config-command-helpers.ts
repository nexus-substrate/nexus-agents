/**
 * Config Command Helpers
 *
 * Helper functions for config management CLI commands.
 *
 * @module cli/config-command-helpers
 * (Source: Issue #360 - CLI Config Management)
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { existsSync } from 'node:fs';
import { getTimeProvider } from '../core/index.js';
import { DEFAULTS } from '../config/defaults.js';
import type { ConfigCategory } from '../config/config-manager.js';
import type { ParsedConfigKey } from './config-command-types.js';
import { ConfigCommandError } from './config-command-types.js';

// ============================================================================
// Re-exports for backward compatibility
// ============================================================================

// Re-export formatting functions
export {
  colors,
  formatSource,
  formatValue,
  formatHeader,
  writeLine,
  writeEmptyLine,
} from './config-command-formatting.js';

// Re-export serialization functions
export { serializeConfig, parseConfigFile } from './config-command-serialization.js';

// ============================================================================
// Key Parsing
// ============================================================================

/**
 * Parses a dot-notation config key into category and key parts.
 *
 * @param fullKey - Key in format "CATEGORY.key" or "CATEGORY.nested.key"
 * @returns Parsed key parts
 * @throws ConfigCommandError if key format is invalid
 *
 * @example
 * parseConfigKey('TIMEOUT_DEFAULTS.cliMs')
 * // Returns: { fullKey: 'TIMEOUT_DEFAULTS.cliMs', category: 'TIMEOUT_DEFAULTS', key: 'cliMs' }
 */
export function parseConfigKey(fullKey: string): ParsedConfigKey {
  const trimmed = fullKey.trim();
  const dotIndex = trimmed.indexOf('.');

  if (dotIndex === -1) {
    throw new ConfigCommandError(
      'INVALID_KEY_FORMAT',
      `Invalid key format: "${fullKey}". Expected format: CATEGORY.key (e.g., TIMEOUT_DEFAULTS.cliMs)`
    );
  }

  const category = trimmed.slice(0, dotIndex);
  const key = trimmed.slice(dotIndex + 1);

  if (category === '' || key === '') {
    throw new ConfigCommandError(
      'INVALID_KEY_FORMAT',
      `Invalid key format: "${fullKey}". Both category and key must be non-empty.`
    );
  }

  // Validate category exists
  if (!(category in DEFAULTS)) {
    const validCategories = Object.keys(DEFAULTS).join(', ');
    throw new ConfigCommandError(
      'KEY_NOT_FOUND',
      `Unknown category: "${category}". Valid categories: ${validCategories}`
    );
  }

  // Validate key exists in category
  const categoryDefaults = DEFAULTS[category as ConfigCategory];
  if (!(key in categoryDefaults)) {
    const validKeys = Object.keys(categoryDefaults).join(', ');
    throw new ConfigCommandError(
      'KEY_NOT_FOUND',
      `Unknown key "${key}" in category "${category}". Valid keys: ${validKeys}`
    );
  }

  return { fullKey: trimmed, category, key };
}

/**
 * Gets the list of valid config categories.
 */
export function getValidCategories(): readonly string[] {
  return Object.keys(DEFAULTS) as ConfigCategory[];
}

/**
 * Gets the list of valid keys for a category.
 */
export function getValidKeys(category: string): readonly string[] {
  if (!(category in DEFAULTS)) {
    return [];
  }
  return Object.keys(DEFAULTS[category as ConfigCategory]);
}

// ============================================================================
// Value Parsing
// ============================================================================

/** Truthy string values for boolean parsing */
const TRUTHY_VALUES = new Set(['true', '1', 'yes']);

/** Falsy string values for boolean parsing */
const FALSY_VALUES = new Set(['false', '0', 'no']);

/**
 * Parses a string as a number, validating the result.
 */
function parseAsNumber(stringValue: string): number {
  // Empty string should not be valid - Number('') returns 0
  if (stringValue.trim() === '') {
    throw new ConfigCommandError(
      'INVALID_VALUE',
      `Invalid numeric value: "${stringValue}". Expected a valid number.`
    );
  }
  const parsed = Number(stringValue);
  if (isNaN(parsed) || !isFinite(parsed)) {
    throw new ConfigCommandError(
      'INVALID_VALUE',
      `Invalid numeric value: "${stringValue}". Expected a valid number.`
    );
  }
  return parsed;
}

/**
 * Parses a string as a boolean.
 */
function parseAsBoolean(stringValue: string): boolean {
  const lower = stringValue.toLowerCase();
  if (TRUTHY_VALUES.has(lower)) {
    return true;
  }
  if (FALSY_VALUES.has(lower)) {
    return false;
  }
  throw new ConfigCommandError(
    'INVALID_VALUE',
    `Invalid boolean value: "${stringValue}". Expected: true/false, 1/0, yes/no.`
  );
}

/**
 * Parses a string value to the appropriate type based on the default value.
 *
 * @param stringValue - String value from CLI
 * @param defaultValue - Default value to determine type
 * @returns Parsed value of the appropriate type
 * @throws ConfigCommandError if parsing fails
 */
export function parseValueFromString(
  stringValue: string,
  defaultValue: unknown
): number | boolean | string {
  if (typeof defaultValue === 'number') {
    return parseAsNumber(stringValue);
  }

  if (typeof defaultValue === 'boolean') {
    return parseAsBoolean(stringValue);
  }

  // Default to string
  return stringValue;
}

// ============================================================================
// File Operations
// ============================================================================

/**
 * Creates a backup of a file.
 *
 * @param filePath - Path to the file to backup
 * @returns Path to the backup file, or undefined if file doesn't exist
 */
export async function createBackup(filePath: string): Promise<string | undefined> {
  if (!existsSync(filePath)) {
    return undefined;
  }

  const timestamp = new Date(getTimeProvider().now()).toISOString().replace(/[:.]/g, '-');
  const backupPath = `${filePath}.backup-${timestamp}`;

  await fs.copyFile(filePath, backupPath);
  return backupPath;
}

/**
 * Resolves a file path relative to CWD with path traversal protection.
 *
 * @param filePath - User-provided file path
 * @param allowedBase - Base directory to restrict access to (defaults to CWD)
 * @returns Resolved absolute path
 * @throws ConfigCommandError if path traversal is detected
 */
export function resolveFilePath(filePath: string, allowedBase?: string): string {
  const base = allowedBase ?? process.cwd();
  const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(base, filePath);

  // Normalize both paths to handle .. and . components
  const normalizedResolved = path.normalize(resolved);
  const normalizedBase = path.normalize(base);

  // Ensure resolved path is within the allowed base directory
  // Check both that it starts with base + separator (subdirectory) or equals base exactly
  const isWithinBase =
    normalizedResolved === normalizedBase ||
    normalizedResolved.startsWith(normalizedBase + path.sep);

  if (!isWithinBase) {
    throw new ConfigCommandError(
      'PATH_TRAVERSAL',
      `Path traversal detected: "${filePath}" resolves outside allowed directory`
    );
  }

  return normalizedResolved;
}

/**
 * Gets the default export file path.
 */
export function getDefaultExportPath(format: 'json' | 'yaml'): string {
  const extension = format === 'json' ? 'json' : 'yaml';
  return path.resolve(process.cwd(), `nexus-config.${extension}`);
}
