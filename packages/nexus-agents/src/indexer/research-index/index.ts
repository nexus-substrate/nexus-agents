/**
 * nexus-agents/indexer/research-index - Research Index Module
 *
 * Parses research registry YAML files and generates statistics
 * and markdown documentation.
 *
 * @example
 * ```typescript
 * import {
 *   parseRegistry,
 *   generateIndexMarkdown,
 *   computeStats,
 * } from 'nexus-agents/indexer/research-index';
 *
 * // Parse the registry
 * const result = parseRegistry({
 *   registryPath: 'docs/research/registry',
 * });
 *
 * if (result.ok) {
 *   // Generate markdown
 *   const mdResult = generateIndexMarkdown(result.value);
 *   if (mdResult.ok) {
 *     console.log(mdResult.value);
 *   }
 * }
 * ```
 */

// ============================================================================
// Types
// ============================================================================

export type {
  // Enums/Unions
  ResearchTopic,
  TechniqueStatus,
  PaperStatus,
  TechniquePriority,
  TechniqueComplexity,
  SourceType,
  // Data structures
  DecisionHistoryEntry,
  ResearchPaper,
  ResearchTechnique,
  ResearchSource,
  // Registry structures
  PapersRegistry,
  TechniquesRegistry,
  SourcesRegistry,
  // Statistics
  TopicStats,
  TechniqueStatusStats,
  TechniquePriorityStats,
  ResearchIndexStats,
  // Index types
  ResearchPaperWithId,
  ResearchTechniqueWithId,
  ResearchSourceWithId,
  ResearchIndex,
  // Options
  ResearchIndexParserOptions,
  ResearchIndexGeneratorOptions,
} from './research-index-types.js';

// ============================================================================
// Schemas (Zod)
// ============================================================================

export {
  // Schema version
  RESEARCH_INDEX_SCHEMA_VERSION,
  // Enum schemas
  ResearchTopicSchema,
  TechniqueStatusSchema,
  PaperStatusSchema,
  TechniquePrioritySchema,
  TechniqueComplexitySchema,
  SourceTypeSchema,
  // Data schemas
  DecisionHistoryEntrySchema,
  ResearchPaperSchema,
  ResearchTechniqueSchema,
  ResearchSourceSchema,
  // Registry schemas
  PapersRegistrySchema,
  TechniquesRegistrySchema,
  SourcesRegistrySchema,
  // Default options
  DEFAULT_RESEARCH_INDEX_PARSER_OPTIONS,
  DEFAULT_RESEARCH_INDEX_GENERATOR_OPTIONS,
  // Errors
  ResearchIndexParseError,
  ResearchIndexGeneratorError,
} from './research-index-types.js';

// ============================================================================
// Parser Functions
// ============================================================================

export {
  // Main parser
  parseRegistry,
  // Individual parsers
  parsePapersRegistry,
  parseTechniquesRegistry,
  parseSourcesRegistry,
  // Statistics
  computeStats,
  // Query helpers
  getTechniquesByStatus,
  getTechniquesByPriority,
  getTechniquesByTopic,
  getPapersByTopic,
  getRecentlyReviewedPapers,
  getTechniquesWithIssues,
} from './research-index-parser.js';

// ============================================================================
// Generator Functions
// ============================================================================

export {
  // Main generator
  generateIndexMarkdown,
  // Additional outputs
  generateStatsJson,
  generateSummaryReport,
} from './research-index-generator.js';
