/**
 * Config Command Types
 *
 * Type definitions for the config management CLI commands.
 *
 * @module cli/config-command-types
 * (Source: Issue #360 - CLI Config Management)
 */

import { z } from 'zod';

// ============================================================================
// Enums and Constants
// ============================================================================

/** Valid config command actions. */
export const CONFIG_ACTIONS = ['get', 'set', 'list', 'reset', 'export', 'import'] as const;

/** Valid export formats. */
export const CONFIG_FORMATS = ['json', 'yaml'] as const;

// ============================================================================
// Schemas
// ============================================================================

/** Schema for config command options. */
export const ConfigCommandOptionsSchema = z.object({
  /** Command action */
  action: z.enum(CONFIG_ACTIONS),
  /** Configuration key (dot notation supported) */
  key: z.string().optional(),
  /** Value to set */
  value: z.string().optional(),
  /** File path for import/export */
  file: z.string().optional(),
  /** Export format */
  format: z.enum(CONFIG_FORMATS).default('json'),
  /** Force overwrite without backup */
  force: z.boolean().default(false),
  /** Show verbose output */
  verbose: z.boolean().default(false),
});

export type ConfigCommandOptions = z.infer<typeof ConfigCommandOptionsSchema>;

/** Schema for a parsed config key. */
export const ParsedConfigKeySchema = z.object({
  /** Full key string */
  fullKey: z.string(),
  /** Category portion */
  category: z.string(),
  /** Key within category */
  key: z.string(),
});

export type ParsedConfigKey = z.infer<typeof ParsedConfigKeySchema>;

// ============================================================================
// Result Types
// ============================================================================

/** Base result interface for config operations. */
export interface ConfigResultBase {
  readonly success: boolean;
  readonly action: (typeof CONFIG_ACTIONS)[number];
  readonly message: string;
}

/** Result for get operation. */
export interface ConfigGetResult extends ConfigResultBase {
  readonly action: 'get';
  readonly key: string;
  readonly value: unknown;
  readonly source: string;
  readonly defaultValue: unknown;
}

/** Result for set operation. */
export interface ConfigSetResult extends ConfigResultBase {
  readonly action: 'set';
  readonly key: string;
  readonly previousValue: unknown;
  readonly newValue: unknown;
}

/** Config entry for list operation. */
export interface ConfigListEntry {
  readonly category: string;
  readonly key: string;
  readonly value: unknown;
  readonly source: string;
  readonly envVar: string | undefined;
}

/** Result for list operation. */
export interface ConfigListResult extends ConfigResultBase {
  readonly action: 'list';
  readonly entries: readonly ConfigListEntry[];
  readonly total: number;
}

/** Result for reset operation. */
export interface ConfigResetResult extends ConfigResultBase {
  readonly action: 'reset';
  readonly keysReset: readonly string[];
  readonly backupPath?: string;
}

/** Result for export operation. */
export interface ConfigExportResult extends ConfigResultBase {
  readonly action: 'export';
  readonly path: string;
  readonly format: 'json' | 'yaml';
  readonly entriesExported: number;
}

/** Result for import operation. */
export interface ConfigImportResult extends ConfigResultBase {
  readonly action: 'import';
  readonly path: string;
  readonly entriesImported: number;
  readonly backupPath?: string;
}

/** Union type for all config results. */
export type ConfigResult =
  | ConfigGetResult
  | ConfigSetResult
  | ConfigListResult
  | ConfigResetResult
  | ConfigExportResult
  | ConfigImportResult;

// ============================================================================
// Error Types
// ============================================================================

/** Error codes for config operations. */
export type ConfigErrorCode =
  | 'KEY_NOT_FOUND'
  | 'INVALID_KEY_FORMAT'
  | 'INVALID_VALUE'
  | 'FILE_NOT_FOUND'
  | 'FILE_ALREADY_EXISTS'
  | 'PARSE_ERROR'
  | 'WRITE_ERROR'
  | 'VALIDATION_ERROR'
  | 'PATH_TRAVERSAL';

/** Config operation error. */
export class ConfigCommandError extends Error {
  readonly code: ConfigErrorCode;

  constructor(code: ConfigErrorCode, message: string) {
    super(message);
    this.name = 'ConfigCommandError';
    this.code = code;
  }
}

// ============================================================================
// Export Format Types
// ============================================================================

/** Shape of exported config data. */
export interface ExportedConfigData {
  readonly version: string;
  readonly exportedAt: string;
  readonly entries: readonly ConfigListEntry[];
}

/** Shape of imported config data. */
export interface ImportedConfigData {
  readonly version?: string;
  readonly entries: ReadonlyArray<{
    category: string;
    key: string;
    value: unknown;
  }>;
}

// ============================================================================
// Type Guards
// ============================================================================

/** Checks if a string is a valid config action. */
export function isValidConfigAction(value: string): value is (typeof CONFIG_ACTIONS)[number] {
  return CONFIG_ACTIONS.includes(value as (typeof CONFIG_ACTIONS)[number]);
}

/** Checks if a string is a valid config format. */
export function isValidConfigFormat(value: string): value is (typeof CONFIG_FORMATS)[number] {
  return CONFIG_FORMATS.includes(value as (typeof CONFIG_FORMATS)[number]);
}
