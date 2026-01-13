/**
 * nexus-agents/indexer - Type Definitions
 *
 * Types for the codebase index feature that tracks all source files,
 * exports, dependencies, and generates documentation artifacts.
 *
 * (Source: Issue #240)
 */

import { z } from 'zod';

// ============================================================================
// Schema Version
// ============================================================================

export const SCHEMA_VERSION = '1.0' as const;

// ============================================================================
// File Entry Types
// ============================================================================

/**
 * Category of a source file based on its purpose.
 */
export type FileCategory =
  | 'types' // Type definitions, interfaces
  | 'implementation' // Core implementation
  | 'test' // Test files
  | 'config' // Configuration files
  | 'cli' // CLI commands
  | 'util' // Utility/helper functions
  | 'index'; // Barrel exports

/**
 * A single exported symbol from a file.
 */
export interface ExportEntry {
  /** Name of the exported symbol */
  readonly name: string;
  /** Type of export: type, interface, class, function, const, enum */
  readonly kind: 'type' | 'interface' | 'class' | 'function' | 'const' | 'enum' | 'unknown';
  /** Whether this is a re-export from another module */
  readonly isReExport: boolean;
  /** Source module for re-exports */
  readonly sourceModule?: string;
}

/**
 * A dependency import in a file.
 */
export interface DependencyEntry {
  /** Import specifier (e.g., './types.js', 'zod') */
  readonly specifier: string;
  /** Whether this is an external package */
  readonly isExternal: boolean;
  /** Imported symbols (empty for namespace imports) */
  readonly imports: readonly string[];
}

/**
 * Metadata for a single source file.
 */
export interface FileEntry {
  /** Relative path from package root */
  readonly path: string;
  /** Number of lines in the file */
  readonly lines: number;
  /** Detected category */
  readonly category: FileCategory;
  /** Exported symbols */
  readonly exports: readonly ExportEntry[];
  /** Dependencies (imports) */
  readonly dependencies: readonly DependencyEntry[];
  /** Brief description extracted from JSDoc or first comment */
  readonly description?: string;
}

// ============================================================================
// Module Types
// ============================================================================

/**
 * Aggregated statistics for a module.
 */
export interface ModuleStats {
  /** Total number of files */
  readonly fileCount: number;
  /** Total lines of code */
  readonly totalLines: number;
  /** Number of exported symbols */
  readonly exportCount: number;
  /** Number of internal dependencies */
  readonly internalDeps: number;
  /** Number of external dependencies */
  readonly externalDeps: number;
}

/**
 * A module (directory) in the codebase.
 */
export interface ModuleEntry {
  /** Module name (directory name) */
  readonly name: string;
  /** Relative path from package root */
  readonly path: string;
  /** Brief purpose description */
  readonly purpose: string;
  /** Files in this module */
  readonly files: readonly FileEntry[];
  /** Aggregated statistics */
  readonly stats: ModuleStats;
  /** Modules this module depends on */
  readonly dependsOn: readonly string[];
}

// ============================================================================
// Index Types
// ============================================================================

/**
 * Global statistics for the entire codebase.
 */
export interface IndexStats {
  /** Total number of files indexed */
  readonly totalFiles: number;
  /** Total lines of code */
  readonly totalLines: number;
  /** Total exported symbols */
  readonly totalExports: number;
  /** Number of modules */
  readonly moduleCount: number;
  /** External package dependencies */
  readonly externalPackages: readonly string[];
}

/**
 * The complete codebase index.
 */
export interface CodebaseIndex {
  /** Schema version for migrations */
  readonly schemaVersion: typeof SCHEMA_VERSION;
  /** Generation timestamp (ISO 8601, ET timezone) */
  readonly generatedAt: string;
  /** Global statistics */
  readonly stats: IndexStats;
  /** Indexed modules */
  readonly modules: Record<string, ModuleEntry>;
}

// ============================================================================
// Zod Schemas (for validation)
// ============================================================================

export const ExportEntrySchema = z.object({
  name: z.string(),
  kind: z.enum(['type', 'interface', 'class', 'function', 'const', 'enum', 'unknown']),
  isReExport: z.boolean(),
  sourceModule: z.string().optional(),
});

export const DependencyEntrySchema = z.object({
  specifier: z.string(),
  isExternal: z.boolean(),
  imports: z.array(z.string()).readonly(),
});

export const FileEntrySchema = z.object({
  path: z.string(),
  lines: z.number().int().nonnegative(),
  category: z.enum(['types', 'implementation', 'test', 'config', 'cli', 'util', 'index']),
  exports: z.array(ExportEntrySchema).readonly(),
  dependencies: z.array(DependencyEntrySchema).readonly(),
  description: z.string().optional(),
});

export const ModuleStatsSchema = z.object({
  fileCount: z.number().int().nonnegative(),
  totalLines: z.number().int().nonnegative(),
  exportCount: z.number().int().nonnegative(),
  internalDeps: z.number().int().nonnegative(),
  externalDeps: z.number().int().nonnegative(),
});

export const ModuleEntrySchema = z.object({
  name: z.string(),
  path: z.string(),
  purpose: z.string(),
  files: z.array(FileEntrySchema).readonly(),
  stats: ModuleStatsSchema,
  dependsOn: z.array(z.string()).readonly(),
});

export const IndexStatsSchema = z.object({
  totalFiles: z.number().int().nonnegative(),
  totalLines: z.number().int().nonnegative(),
  totalExports: z.number().int().nonnegative(),
  moduleCount: z.number().int().nonnegative(),
  externalPackages: z.array(z.string()).readonly(),
});

export const CodebaseIndexSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  generatedAt: z.string(),
  stats: IndexStatsSchema,
  modules: z.record(z.string(), ModuleEntrySchema),
});

// ============================================================================
// Extractor Options
// ============================================================================

/**
 * Options for the file extractor.
 */
export interface ExtractorOptions {
  /** Root directory to scan */
  readonly rootDir: string;
  /** Glob patterns to include */
  readonly include: readonly string[];
  /** Glob patterns to exclude */
  readonly exclude: readonly string[];
  /** Whether to extract JSDoc descriptions */
  readonly extractDescriptions: boolean;
}

/**
 * Default extractor options.
 */
export const DEFAULT_EXTRACTOR_OPTIONS: ExtractorOptions = {
  rootDir: 'src',
  include: ['**/*.ts'],
  exclude: ['**/*.test.ts', '**/*.d.ts', '**/node_modules/**'],
  extractDescriptions: true,
};

// ============================================================================
// Generator Options
// ============================================================================

/**
 * Output format for the index.
 */
export type OutputFormat = 'yaml' | 'json';

/**
 * Options for the index generator.
 */
export interface GeneratorOptions {
  /** Output format */
  readonly format: OutputFormat;
  /** Output file path */
  readonly outputPath: string;
  /** Whether to generate Mermaid diagram */
  readonly generateDiagram: boolean;
  /** Diagram output path (if generating) */
  readonly diagramPath?: string;
}

/**
 * Default generator options.
 */
export const DEFAULT_GENERATOR_OPTIONS: GeneratorOptions = {
  format: 'yaml',
  outputPath: 'docs/codebase-index.yaml',
  generateDiagram: true,
  diagramPath: 'docs/dependency-graph.md',
};
