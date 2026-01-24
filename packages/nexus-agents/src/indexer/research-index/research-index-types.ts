/**
 * nexus-agents/indexer/research-index - Type Definitions
 *
 * Types for parsing research registry YAML files and generating
 * statistics and markdown index documentation.
 *
 * This file re-exports all types from base-types and stats-types
 * for backward compatibility.
 *
 * (Source: Research Tracking System - docs/research/RESEARCH_INDEX.md)
 */

// Re-export all types and schemas from base types for backward compatibility
export {
  RESEARCH_INDEX_SCHEMA_VERSION,
  ResearchTopicSchema,
  TechniqueStatusSchema,
  PaperStatusSchema,
  TechniquePrioritySchema,
  TechniqueComplexitySchema,
  SourceTypeSchema,
  DecisionHistoryEntrySchema,
  PaperMetricsSchema,
  ResearchPaperSchema,
  ResearchTechniqueSchema,
  ResearchSourceSchema,
  PapersRegistrySchema,
  TechniquesRegistrySchema,
  SourcesRegistrySchema,
} from './research-index-base-types.js';

export type {
  ResearchTopic,
  TechniqueStatus,
  PaperStatus,
  TechniquePriority,
  TechniqueComplexity,
  SourceType,
  DecisionHistoryEntry,
  PaperMetrics,
  ResearchPaper,
  ResearchTechnique,
  ResearchSource,
  PapersRegistry,
  TechniquesRegistry,
  SourcesRegistry,
} from './research-index-base-types.js';

// Re-export statistics, options, and error types for backward compatibility
export type {
  TopicStats,
  TechniqueStatusStats,
  TechniquePriorityStats,
  ResearchIndexStats,
  ResearchPaperWithId,
  ResearchTechniqueWithId,
  ResearchSourceWithId,
  ResearchIndex,
  ResearchIndexParserOptions,
  ResearchIndexGeneratorOptions,
} from './research-index-stats-types.js';

export {
  DEFAULT_RESEARCH_INDEX_PARSER_OPTIONS,
  DEFAULT_RESEARCH_INDEX_GENERATOR_OPTIONS,
  ResearchIndexParseError,
  ResearchIndexGeneratorError,
} from './research-index-stats-types.js';
