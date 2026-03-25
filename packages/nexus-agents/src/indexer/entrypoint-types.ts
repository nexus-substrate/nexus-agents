/**
 * nexus-agents/indexer - Entrypoint Type Definitions
 *
 * Types for extracting and documenting CLI commands, MCP tools,
 * and REST endpoints from source code AST.
 *
 * (Source: Epic #261 - Automated Documentation System)
 */

import { z } from 'zod';

// ============================================================================
// Schema Version
// ============================================================================

export const ENTRYPOINT_SCHEMA_VERSION = '1.0' as const;

// ============================================================================
// Option/Parameter Types
// ============================================================================

/**
 * CLI command option specification.
 */
export interface OptionSpec {
  /** Option name (e.g., 'verbose', 'output') */
  readonly name: string;
  /** Type of the option (boolean, string, number) */
  readonly type: string;
  /** Description of the option */
  readonly description?: string;
  /** Whether the option is required */
  readonly required?: boolean;
  /** Default value if any */
  readonly default?: string;
  /** Short alias (e.g., 'v' for verbose) */
  readonly short?: string;
}

/**
 * MCP tool or REST endpoint parameter specification.
 */
export interface ParameterSpec {
  /** Parameter name */
  readonly name: string;
  /** Parameter type (string, number, boolean, object, array) */
  readonly type: string;
  /** Description of the parameter */
  readonly description?: string;
  /** Whether the parameter is required */
  readonly required?: boolean;
  /** Default value if any */
  readonly default?: string;
}

// ============================================================================
// Entrypoint Specifications
// ============================================================================

/**
 * CLI command specification extracted from source.
 */
export interface CliCommandSpec {
  /** Command name (e.g., 'doctor', 'orchestrate') */
  readonly name: string;
  /** Description of what the command does */
  readonly description: string;
  /** Subcommands if any (e.g., ['list', 'run'] for workflow) */
  readonly subcommands?: readonly string[];
  /** Command options */
  readonly options?: readonly OptionSpec[];
  /** Source file where the command is defined */
  readonly source_file: string;
  /** Line number in source file */
  readonly source_line: number;
}

/**
 * MCP tool specification extracted from source.
 */
export interface McpToolSpec {
  /** Tool name (e.g., 'orchestrate', 'create_expert') */
  readonly name: string;
  /** Description of what the tool does */
  readonly description: string;
  /** Tool parameters */
  readonly parameters: readonly ParameterSpec[];
  /** Source file where the tool is registered */
  readonly source_file: string;
  /** Line number in source file */
  readonly source_line: number;
}

// ============================================================================
// Manifest Type
// ============================================================================

/**
 * Complete entrypoint manifest containing all extracted entrypoints.
 */
export interface EntrypointManifest {
  /** Schema version for migrations */
  readonly schema_version: typeof ENTRYPOINT_SCHEMA_VERSION;
  /** Generation timestamp (ISO 8601, ET timezone) */
  readonly generated_at: string;
  /** Extracted CLI commands */
  readonly cli_commands: readonly CliCommandSpec[];
  /** Extracted MCP tools */
  readonly mcp_tools: readonly McpToolSpec[];
}

// ============================================================================
// Zod Schemas (for validation)
// ============================================================================

export const OptionSpecSchema = z.object({
  name: z.string(),
  type: z.string(),
  description: z.string().optional(),
  required: z.boolean().optional(),
  default: z.string().optional(),
  short: z.string().optional(),
});

export const ParameterSpecSchema = z.object({
  name: z.string(),
  type: z.string(),
  description: z.string().optional(),
  required: z.boolean().optional(),
  default: z.string().optional(),
});

export const CliCommandSpecSchema = z.object({
  name: z.string(),
  description: z.string(),
  subcommands: z.array(z.string()).readonly().optional(),
  options: z.array(OptionSpecSchema).readonly().optional(),
  source_file: z.string(),
  source_line: z.number().int().positive(),
});

export const McpToolSpecSchema = z.object({
  name: z.string(),
  description: z.string(),
  parameters: z.array(ParameterSpecSchema).readonly(),
  source_file: z.string(),
  source_line: z.number().int().positive(),
});

export const EntrypointManifestSchema = z.object({
  schema_version: z.literal(ENTRYPOINT_SCHEMA_VERSION),
  generated_at: z.string(),
  cli_commands: z.array(CliCommandSpecSchema).readonly(),
  mcp_tools: z.array(McpToolSpecSchema).readonly(),
});

// ============================================================================
// Extractor Options
// ============================================================================

/**
 * Options for the entrypoint extractor.
 */
export interface EntrypointExtractorOptions {
  /** Root directory of the package */
  readonly packageRoot: string;
  /** Path to CLI commands file (relative to packageRoot) */
  readonly cliCommandsPath: string;
  /** Path to MCP tools directory (relative to packageRoot) */
  readonly mcpToolsPath: string;
  /** Whether to sanitize extracted values */
  readonly sanitize: boolean;
}

/**
 * Default extractor options.
 */
export const DEFAULT_ENTRYPOINT_EXTRACTOR_OPTIONS: EntrypointExtractorOptions = {
  packageRoot: 'packages/nexus-agents',
  cliCommandsPath: 'src/cli-commands.ts',
  mcpToolsPath: 'src/mcp/tools',
  sanitize: true,
};

// ============================================================================
// Extraction Result
// ============================================================================

/**
 * Result of entrypoint extraction.
 */
export interface EntrypointExtractionResult {
  /** Whether extraction succeeded */
  readonly success: boolean;
  /** The extracted manifest (if successful) */
  readonly manifest?: EntrypointManifest;
  /** Errors encountered during extraction */
  readonly errors: readonly string[];
  /** Warnings (non-fatal issues) */
  readonly warnings: readonly string[];
}
