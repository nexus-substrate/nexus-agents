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
import { DEFAULTS } from '../config/defaults.js';
import type { ConfigCategory } from '../config/config-manager.js';
import type {
  ParsedConfigKey,
  ConfigListEntry,
  ExportedConfigData,
  ImportedConfigData,
} from './config-command-types.js';
import { ConfigCommandError } from './config-command-types.js';
import { VERSION } from '../version.js';

// ============================================================================
// ANSI Colors
// ============================================================================

/** ANSI color codes for terminal output. */
export const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  magenta: '\x1b[35m',
} as const;

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

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
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

// ============================================================================
// Export/Import Serialization
// ============================================================================

/**
 * Serializes config entries to the specified format.
 *
 * @param entries - Config entries to serialize
 * @param format - Output format
 * @returns Serialized string
 */
export function serializeConfig(
  entries: readonly ConfigListEntry[],
  format: 'json' | 'yaml'
): string {
  const data: ExportedConfigData = {
    version: VERSION,
    exportedAt: new Date().toISOString(),
    entries,
  };

  if (format === 'json') {
    return JSON.stringify(data, null, 2);
  }

  // YAML serialization (simple implementation without external dep)
  return serializeToYaml(data);
}

/**
 * Simple YAML serializer for config data.
 * Handles the specific structure of ExportedConfigData.
 */
function serializeToYaml(data: ExportedConfigData): string {
  const lines: string[] = [
    '# Nexus Agents Configuration Export',
    `# Exported at: ${data.exportedAt}`,
    `version: "${data.version}"`,
    `exportedAt: "${data.exportedAt}"`,
    'entries:',
  ];

  for (const entry of data.entries) {
    lines.push(`  - category: "${entry.category}"`);
    lines.push(`    key: "${entry.key}"`);
    lines.push(`    value: ${formatYamlValue(entry.value)}`);
    lines.push(`    source: "${entry.source}"`);
    if (entry.envVar !== undefined) {
      lines.push(`    envVar: "${entry.envVar}"`);
    }
  }

  return lines.join('\n') + '\n';
}

/**
 * Formats a value for YAML output.
 */
function formatYamlValue(value: unknown): string {
  if (typeof value === 'string') {
    return `"${value}"`;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value === null) {
    return 'null';
  }
  return JSON.stringify(value);
}

/**
 * Parses config data from a file.
 *
 * @param content - File content
 * @param format - File format
 * @returns Parsed config data
 */
export function parseConfigFile(content: string, format: 'json' | 'yaml'): ImportedConfigData {
  if (format === 'json') {
    try {
      const parsed = JSON.parse(content) as unknown;
      return validateImportedData(parsed);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new ConfigCommandError('PARSE_ERROR', `Failed to parse JSON: ${message}`);
    }
  }

  // YAML parsing (simple implementation)
  return parseYamlConfig(content);
}

/** Parsed entry type for YAML parsing */
type PartialEntry = { category?: string; key?: string; value?: unknown };
type CompleteEntry = { category: string; key: string; value: unknown };

/**
 * Checks if a line should be skipped (comment or empty).
 */
function isSkippableLine(trimmed: string): boolean {
  return trimmed.startsWith('#') || trimmed === '';
}

/**
 * Extracts version from a YAML line if present.
 */
function extractVersion(trimmed: string): string | undefined {
  const versionMatch = /^version:\s*"?([^"]*)"?$/.exec(trimmed);
  return versionMatch?.[1];
}

/**
 * Parses entry fields from a YAML line.
 */
function parseEntryField(trimmed: string, entry: PartialEntry): void {
  if (trimmed.startsWith('key:')) {
    entry.key = extractYamlValue(trimmed.slice(4));
  } else if (trimmed.startsWith('value:')) {
    entry.value = parseYamlValue(trimmed.slice(6));
  }
}

/** State for YAML parsing */
interface YamlParseState {
  entries: CompleteEntry[];
  version: string | undefined;
  currentEntry: PartialEntry | null;
}

/**
 * Adds the current entry to entries if complete.
 */
function finalizeCurrentEntry(state: YamlParseState): void {
  if (state.currentEntry !== null && isCompleteEntry(state.currentEntry)) {
    state.entries.push(state.currentEntry);
  }
}

/**
 * Processes a single YAML line and updates the state.
 */
function processYamlLine(trimmed: string, state: YamlParseState): void {
  const lineVersion = extractVersion(trimmed);
  if (lineVersion !== undefined) {
    state.version = lineVersion;
    return;
  }

  if (trimmed.startsWith('- category:')) {
    finalizeCurrentEntry(state);
    state.currentEntry = { category: extractYamlValue(trimmed.slice(11)) };
    return;
  }

  if (state.currentEntry !== null) {
    parseEntryField(trimmed, state.currentEntry);
  }
}

/**
 * Simple YAML parser for config data.
 * Handles the specific structure we export.
 */
function parseYamlConfig(content: string): ImportedConfigData {
  const state: YamlParseState = { entries: [], version: undefined, currentEntry: null };

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!isSkippableLine(trimmed)) {
      processYamlLine(trimmed, state);
    }
  }

  // Finalize the last entry
  finalizeCurrentEntry(state);

  return state.version !== undefined
    ? { version: state.version, entries: state.entries }
    : { entries: state.entries };
}

function isCompleteEntry(entry: {
  category?: string;
  key?: string;
  value?: unknown;
}): entry is { category: string; key: string; value: unknown } {
  return entry.category !== undefined && entry.key !== undefined && entry.value !== undefined;
}

function extractYamlValue(value: string): string {
  const trimmed = value.trim();
  // Remove surrounding quotes
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/**
 * Checks if a string is quoted (single or double quotes).
 */
function isQuotedString(str: string): boolean {
  return (str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"));
}

/**
 * Removes surrounding quotes from a string.
 */
function unquote(str: string): string {
  return str.slice(1, -1);
}

/**
 * Parses a YAML literal value (boolean, null, number, or string).
 */
function parseYamlValue(value: string): unknown {
  const trimmed = value.trim();

  if (isQuotedString(trimmed)) return unquote(trimmed);
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null' || trimmed === '~') return null;

  const num = Number(trimmed);
  if (!isNaN(num) && isFinite(num)) return num;

  return trimmed;
}

/**
 * Validates imported config data structure.
 */
function validateImportedData(data: unknown): ImportedConfigData {
  if (typeof data !== 'object' || data === null) {
    throw new ConfigCommandError('VALIDATION_ERROR', 'Invalid config data: expected an object');
  }

  const obj = data as Record<string, unknown>;

  if (!Array.isArray(obj['entries'])) {
    throw new ConfigCommandError('VALIDATION_ERROR', 'Invalid config data: missing entries array');
  }

  const entries: Array<{ category: string; key: string; value: unknown }> = [];

  for (const entry of obj['entries']) {
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }
    const e = entry as Record<string, unknown>;
    if (typeof e['category'] === 'string' && typeof e['key'] === 'string') {
      entries.push({
        category: e['category'],
        key: e['key'],
        value: e['value'],
      });
    }
  }

  // Conditionally include version for exactOptionalPropertyTypes compatibility
  const version = obj['version'];
  return typeof version === 'string' ? { version, entries } : { entries };
}

// ============================================================================
// Output Formatting
// ============================================================================

/**
 * Formats a source label with color.
 */
export function formatSource(source: string): string {
  switch (source) {
    case 'package':
      return `${colors.dim}(default)${colors.reset}`;
    case 'env':
      return `${colors.cyan}(env)${colors.reset}`;
    case 'session':
      return `${colors.yellow}(session)${colors.reset}`;
    case 'cli':
      return `${colors.magenta}(cli)${colors.reset}`;
    case 'user_file':
      return `${colors.green}(file)${colors.reset}`;
    default:
      return `(${source})`;
  }
}

/**
 * Formats a config value for display.
 */
export function formatValue(value: unknown): string {
  if (typeof value === 'string') {
    return `"${value}"`;
  }
  if (typeof value === 'number') {
    // Format large numbers with underscores for readability
    if (value >= 1000) {
      return value.toLocaleString('en-US');
    }
    return String(value);
  }
  if (typeof value === 'boolean') {
    return value ? `${colors.green}true${colors.reset}` : `${colors.red}false${colors.reset}`;
  }
  return JSON.stringify(value);
}

/**
 * Writes a line to stdout.
 */
export function writeLine(text: string): void {
  process.stdout.write(text + '\n');
}

/**
 * Writes an empty line.
 */
export function writeEmptyLine(): void {
  process.stdout.write('\n');
}

/**
 * Formats a header with styling.
 */
export function formatHeader(text: string): string {
  return `${colors.bold}${text}${colors.reset}`;
}
