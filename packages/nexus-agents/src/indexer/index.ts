/**
 * nexus-agents/indexer - Codebase Index Module
 *
 * Automated codebase indexing to track source files, generate dependency
 * diagrams, and validate documentation accuracy.
 *
 * (Source: Issue #240)
 */

// Types
export type {
  FileCategory,
  ExportEntry,
  DependencyEntry,
  FileEntry,
  ModuleStats,
  ModuleEntry,
  IndexStats,
  CodebaseIndex,
  ExtractorOptions,
  OutputFormat,
  GeneratorOptions,
} from './types.js';

export {
  SCHEMA_VERSION,
  DEFAULT_EXTRACTOR_OPTIONS,
  DEFAULT_GENERATOR_OPTIONS,
  // Zod schemas
  ExportEntrySchema,
  DependencyEntrySchema,
  FileEntrySchema,
  ModuleStatsSchema,
  ModuleEntrySchema,
  IndexStatsSchema,
  CodebaseIndexSchema,
} from './types.js';

// Extractor
export type { ExtractionResult } from './extractor.js';
export {
  detectFileCategory,
  extractExports,
  extractDependencies,
  extractDescription,
  extractFileEntry,
  extractProject,
} from './extractor.js';

// Analyzer
export {
  detectModulePurpose,
  groupFilesByModule,
  extractExternalPackages,
  computeModuleStats,
  detectModuleDependencies,
  analyzeModules,
  computeIndexStats,
  buildIndex,
} from './analyzer.js';

// Generator
export type { ValidationResult } from './generator.js';
export {
  indexToYaml,
  indexToJson,
  generateMermaidDiagram,
  generateDiagramMarkdown,
  writeIndex,
  validateIndex,
} from './generator.js';

// Entrypoint Types (Epic #261)
export type {
  OptionSpec,
  ParameterSpec,
  CliCommandSpec,
  McpToolSpec,
  RestEndpointSpec,
  EntrypointManifest,
  EntrypointExtractorOptions,
  EntrypointExtractionResult,
} from './entrypoint-types.js';

export {
  ENTRYPOINT_SCHEMA_VERSION,
  DEFAULT_ENTRYPOINT_EXTRACTOR_OPTIONS,
  // Zod schemas
  OptionSpecSchema,
  ParameterSpecSchema,
  CliCommandSpecSchema,
  McpToolSpecSchema,
  RestEndpointSpecSchema,
  EntrypointManifestSchema,
} from './entrypoint-types.js';

// Entrypoint Extractor (Epic #261)
export {
  sanitizeValue,
  extractEntrypoints,
  extractCliCommands,
  extractMcpTools,
  extractRestEndpoints,
  manifestToYaml,
  manifestToJson,
} from './entrypoint-extractor.js';

// Freshness Analyzer (Epic #261, Issue #269)
export type {
  FreshnessStatus,
  DocumentFreshness,
  FreshnessAnalysisResult,
  TrackedDocument,
} from './freshness-analyzer.js';
export {
  DEFAULT_TRACKED_DOCUMENTS,
  analyzeFreshness,
  formatFreshnessTable,
  formatFreshnessJson,
} from './freshness-analyzer.js';

// Research Index Module
export * from './research-index/index.js';
