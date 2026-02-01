/**
 * Config Command Serialization
 *
 * Serialization and deserialization functions for config export/import.
 *
 * @module cli/config-command-serialization
 * (Source: Issue #360 - CLI Config Management)
 */

import { getTimeProvider, getErrorMessage } from '../core/index.js';
import type {
  ConfigListEntry,
  ExportedConfigData,
  ImportedConfigData,
} from './config-command-types.js';
import { ConfigCommandError } from './config-command-types.js';
import { VERSION } from '../version.js';

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
    exportedAt: getTimeProvider().nowIso(),
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
      const message = getErrorMessage(error);
      throw new ConfigCommandError('PARSE_ERROR', `Failed to parse JSON: ${message}`);
    }
  }

  // YAML parsing (simple implementation)
  return parseYamlConfig(content);
}

// ============================================================================
// YAML Parsing Helpers
// ============================================================================

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

// ============================================================================
// Validation
// ============================================================================

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
