/**
 * Config Management CLI Command
 *
 * Provides CLI commands for managing nexus-agents configuration:
 * - get: Retrieve configuration values
 * - set: Set configuration values
 * - list: List all configuration
 * - reset: Reset configuration to defaults
 * - export: Export configuration to file
 * - import: Import configuration from file
 *
 * @module cli/config-command
 * (Source: Issue #360 - CLI Config Management)
 */

import type {
  ConfigCommandOptions,
  ConfigResult,
  ConfigGetResult,
  ConfigSetResult,
  ConfigListResult,
  ConfigResetResult,
  ConfigExportResult,
  ConfigImportResult,
  ConfigListEntry,
} from './config-command-types.js';
import { ConfigCommandOptionsSchema, ConfigCommandError } from './config-command-types.js';
import {
  formatSource,
  formatValue,
  formatHeader,
  writeLine,
  writeEmptyLine,
  colors,
} from './config-command-helpers.js';
import {
  handleGet,
  handleSet,
  handleList,
  handleReset,
  handleExport,
  handleImport,
} from './config-command-handlers.js';

// Re-export handlers for external use and testing
export { handleGet, handleSet, handleList, handleReset, handleExport, handleImport };

// ============================================================================
// Output Formatting
// ============================================================================

/**
 * Prints the result of a get operation.
 */
function printGetResult(result: ConfigGetResult, verbose: boolean): void {
  writeEmptyLine();
  writeLine(`${colors.cyan}${result.key}${colors.reset} = ${formatValue(result.value)}`);
  writeLine(`  Source: ${formatSource(result.source)}`);
  if (verbose) {
    writeLine(`  Default: ${formatValue(result.defaultValue)}`);
  }
  writeEmptyLine();
}

/**
 * Prints the result of a set operation.
 */
function printSetResult(result: ConfigSetResult, verbose: boolean): void {
  writeEmptyLine();
  writeLine(`${colors.green}Set${colors.reset} ${colors.cyan}${result.key}${colors.reset}`);
  if (verbose) {
    writeLine(`  Previous: ${formatValue(result.previousValue)}`);
  }
  writeLine(`  New: ${formatValue(result.newValue)}`);
  writeEmptyLine();
}

/**
 * Prints the result of a list operation.
 */
function printListResult(result: ConfigListResult, verbose: boolean): void {
  writeEmptyLine();
  writeLine(formatHeader('Configuration'));
  writeLine('='.repeat(60));
  writeEmptyLine();

  // Group by category
  const byCategory = new Map<string, ConfigListEntry[]>();
  for (const entry of result.entries) {
    const existing = byCategory.get(entry.category) ?? [];
    existing.push(entry);
    byCategory.set(entry.category, existing);
  }

  for (const [category, entries] of byCategory) {
    writeLine(`${colors.bold}${category}${colors.reset}`);
    writeLine('-'.repeat(40));

    for (const entry of entries) {
      const valueStr = formatValue(entry.value);
      const sourceStr = formatSource(entry.source);
      writeLine(`  ${entry.key}: ${valueStr} ${sourceStr}`);
      if (verbose && entry.envVar !== undefined) {
        writeLine(`    ${colors.dim}env: ${entry.envVar}${colors.reset}`);
      }
    }
    writeEmptyLine();
  }

  writeLine(`${colors.dim}Total: ${String(result.total)} entries${colors.reset}`);
  writeEmptyLine();
}

/**
 * Prints the result of a reset operation.
 */
function printResetResult(result: ConfigResetResult, verbose: boolean): void {
  writeEmptyLine();
  if (result.keysReset.length === 0) {
    writeLine(`${colors.yellow}No overrides to reset${colors.reset}`);
  } else {
    writeLine(
      `${colors.green}Reset ${String(result.keysReset.length)} value(s) to defaults${colors.reset}`
    );
    if (verbose) {
      for (const key of result.keysReset) {
        writeLine(`  ${colors.dim}- ${key}${colors.reset}`);
      }
    }
  }
  if (result.backupPath !== undefined) {
    writeLine(`  Backup: ${result.backupPath}`);
  }
  writeEmptyLine();
}

/**
 * Prints the result of an export operation.
 */
function printExportResult(result: ConfigExportResult): void {
  writeEmptyLine();
  writeLine(`${colors.green}Exported configuration${colors.reset}`);
  writeLine(`  Path: ${result.path}`);
  writeLine(`  Format: ${result.format}`);
  writeLine(`  Entries: ${String(result.entriesExported)}`);
  writeEmptyLine();
}

/**
 * Prints the result of an import operation.
 */
function printImportResult(result: ConfigImportResult): void {
  writeEmptyLine();
  writeLine(`${colors.green}Imported configuration${colors.reset}`);
  writeLine(`  Path: ${result.path}`);
  writeLine(`  Entries: ${String(result.entriesImported)}`);
  if (result.backupPath !== undefined) {
    writeLine(`  Backup: ${result.backupPath}`);
  }
  writeEmptyLine();
}

/**
 * Prints a config command error.
 */
function printError(error: ConfigCommandError): void {
  writeEmptyLine();
  writeLine(`${colors.red}${colors.bold}Error:${colors.reset} ${error.message}`);
  writeLine(`${colors.dim}Code: ${error.code}${colors.reset}`);
  writeEmptyLine();
}

/**
 * Prints the result of a config command.
 */
export function printConfigResult(result: ConfigResult, verbose: boolean): void {
  switch (result.action) {
    case 'get':
      printGetResult(result, verbose);
      break;
    case 'set':
      printSetResult(result, verbose);
      break;
    case 'list':
      printListResult(result, verbose);
      break;
    case 'reset':
      printResetResult(result, verbose);
      break;
    case 'export':
      printExportResult(result);
      break;
    case 'import':
      printImportResult(result);
      break;
  }
}

// ============================================================================
// Command Routing Helpers
// ============================================================================

/**
 * Handles the 'get' action routing.
 */
async function routeGetAction(key: string | undefined): Promise<ConfigGetResult> {
  if (key === undefined) {
    throw new ConfigCommandError('INVALID_KEY_FORMAT', 'Key is required for get command');
  }
  return handleGet(key);
}

/**
 * Handles the 'set' action routing.
 */
async function routeSetAction(
  key: string | undefined,
  value: string | undefined
): Promise<ConfigSetResult> {
  if (key === undefined) {
    throw new ConfigCommandError('INVALID_KEY_FORMAT', 'Key is required for set command');
  }
  if (value === undefined) {
    throw new ConfigCommandError('INVALID_VALUE', 'Value is required for set command');
  }
  return handleSet(key, value);
}

/**
 * Handles the 'import' action routing.
 */
async function routeImportAction(
  file: string | undefined,
  force: boolean | undefined
): Promise<ConfigImportResult> {
  if (file === undefined) {
    throw new ConfigCommandError('FILE_NOT_FOUND', 'File is required for import command');
  }
  // Conditionally include force for exactOptionalPropertyTypes compatibility
  const options = force !== undefined ? { force } : {};
  return handleImport(file, options);
}

// ============================================================================
// Main Command Entry Point
// ============================================================================

/**
 * Runs a config command.
 *
 * @param options - Command options
 * @returns Result of the operation
 */
export async function runConfigCommand(
  options: Partial<ConfigCommandOptions>
): Promise<ConfigResult> {
  const parsed = ConfigCommandOptionsSchema.parse(options);

  switch (parsed.action) {
    case 'get':
      return routeGetAction(parsed.key);

    case 'set':
      return routeSetAction(parsed.key, parsed.value);

    case 'list':
      return handleList();

    case 'reset':
      return handleReset(parsed.key);

    case 'export':
      return handleExport(parsed.file, parsed.format);

    case 'import':
      return routeImportAction(parsed.file, parsed.force);

    default: {
      const unknownAction = (parsed as { action: string }).action;
      throw new ConfigCommandError(
        'VALIDATION_ERROR',
        `Unknown action: ${unknownAction}\n` + `Valid actions: init, show, get, set, import`
      );
    }
  }
}

/**
 * Config command entry point.
 * Parses options, runs the command, and prints results.
 *
 * @param options - Command options
 * @returns Exit code (0 = success, 1 = error)
 */
export async function configCommand(options: Partial<ConfigCommandOptions>): Promise<number> {
  try {
    const result = await runConfigCommand(options);
    printConfigResult(result, options.verbose ?? false);
    return result.success ? 0 : 1;
  } catch (error) {
    if (error instanceof ConfigCommandError) {
      printError(error);
      return 1;
    }

    // Unknown error
    writeEmptyLine();
    writeLine(`${colors.red}${colors.bold}Error:${colors.reset} ${String(error)}`);
    writeEmptyLine();
    return 1;
  }
}

// ============================================================================
// Help Text
// ============================================================================

/**
 * Returns the help text for the config command.
 */
export function getConfigCommandHelp(): string {
  return `
${formatHeader('nexus-agents config')} - Configuration management

${formatHeader('USAGE')}
  nexus-agents config <action> [options]

${formatHeader('ACTIONS')}
  get <key>               Get a configuration value
  set <key> <value>       Set a configuration value
  list                    List all configuration values
  reset [key]             Reset configuration to defaults
  export [file]           Export configuration to file
  import <file>           Import configuration from file

${formatHeader('OPTIONS')}
  --format <json|yaml>    Export format (default: json)
  --force                 Force overwrite without backup
  --verbose               Show detailed output

${formatHeader('KEY FORMAT')}
  Keys use dot notation: CATEGORY.key
  Example: TIMEOUT_DEFAULTS.cliMs

${formatHeader('EXAMPLES')}
  nexus-agents config get TIMEOUT_DEFAULTS.cliMs
  nexus-agents config set TIMEOUT_DEFAULTS.cliMs 90000
  nexus-agents config list
  nexus-agents config reset TIMEOUT_DEFAULTS.cliMs
  nexus-agents config export ./my-config.json
  nexus-agents config import ./my-config.yaml

${formatHeader('CATEGORIES')}
  TIMEOUT_DEFAULTS        Timeout settings
  RATE_LIMIT_DEFAULTS     Rate limiting
  RETRY_DEFAULTS          Retry configuration
  WORKER_DEFAULTS         Worker pool settings
  CIRCUIT_BREAKER_DEFAULTS Circuit breaker settings
  CONTEXT_DEFAULTS        Context/memory settings
  PROVIDER_DEFAULTS       Provider/model settings
  SECURITY_DEFAULTS       Security settings
`.trim();
}

// ============================================================================
// Exports
// ============================================================================

export { ConfigCommandError };
export type { ConfigCommandOptions, ConfigResult };
