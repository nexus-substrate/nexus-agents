/**
 * nexus-agents/research - Research Index Module
 *
 * Provides deterministic generation and validation of RESEARCH_INDEX.md
 * from YAML registry files.
 *
 * @see Issue #367 - Deterministic RESEARCH_INDEX.md generation
 * @see docs/research/RESEARCH_INDEX.md
 *
 * @example
 * ```typescript
 * import {
 *   generateIndexMarkdown,
 *   validateRegistry,
 *   checkIndexFreshness,
 * } from 'nexus-agents/research';
 *
 * // Generate the index
 * const result = generateIndexMarkdown();
 * if (result.ok) {
 *   console.log(result.value);
 * }
 *
 * // Check if index is fresh
 * const freshness = checkIndexFreshness('docs/research/RESEARCH_INDEX.md');
 * if (freshness.ok && !freshness.value.fresh) {
 *   console.log('Index needs regeneration:', freshness.value.reason);
 * }
 * ```
 */

// ============================================================================
// Schemas
// ============================================================================

export {
  // Version
  RESEARCH_SCHEMA_VERSION,
  // Topic enum and constants
  ResearchTopicSchema,
  RESEARCH_TOPICS,
  TOPIC_DESCRIPTIONS,
  // Status enums
  TechniqueStatusSchema,
  PaperStatusSchema,
  TechniquePrioritySchema,
  TechniqueComplexitySchema,
  RelevanceSchema,
  PaperSourceSchema,
  // Decision history
  DecisionHistoryEntrySchema,
  // Main schemas
  ResearchPaperSchema,
  ResearchTechniqueSchema,
  IntegrationFileSchema,
  PapersRegistrySchema,
  TechniquesRegistrySchema,
  // Helper functions
  getPrimaryTopic,
  getIntegrationFilePath,
  isIntegrationFileRequired,
} from './research-schemas.js';

export type {
  ResearchTopic,
  TechniqueStatus,
  PaperStatus,
  TechniquePriority,
  TechniqueComplexity,
  Relevance,
  PaperSource,
  DecisionHistoryEntry,
  ResearchPaper,
  ResearchTechnique,
  IntegrationFile,
  PapersRegistry,
  TechniquesRegistry,
  ValidationSeverity,
  ValidationIssue,
  ValidationResult,
} from './research-schemas.js';

// ============================================================================
// Generator
// ============================================================================

export {
  generateIndexMarkdown,
  checkIndexFreshness,
  DEFAULT_GENERATOR_OPTIONS,
} from './research-index-generator.js';

export type {
  GeneratorOptions,
  PaperWithId,
  TechniqueWithId,
  ParsedData,
  RegistryStats,
  TopicStat,
} from './research-index-generator.js';

// ============================================================================
// Validator
// ============================================================================

export {
  validateRegistry,
  formatValidationResult,
  formatValidationResultJson,
  DEFAULT_VALIDATOR_OPTIONS,
} from './research-validator.js';

export type { ValidatorOptions, ParsedRegistry } from './research-validator.js';

// ============================================================================
// Quality Scoring
// ============================================================================

export {
  classifyVenue,
  recencyBoost,
  citationScore,
  computeQualityScore,
  computeEvidenceTier,
  isPreprintOnly,
} from './research-quality.js';

export {
  starScore,
  reviewRecencyScore,
  computeSourceQualityScore,
  computeSourceEvidenceTier,
} from './source-quality.js';

// ============================================================================
// Topic Taxonomy
// ============================================================================

export { TOPIC_ALIASES, normalizeTopicToCanonical } from './topic-aliases.js';

// ============================================================================
// ArxivCrossref Adapter (Fallback Paper Source)
// ============================================================================

export {
  ArxivCrossrefAdapter,
  createArxivCrossrefAdapter,
  DEFAULT_ADAPTER_CONFIG,
} from './arxiv-crossref-adapter.js';

export type {
  ArxivCrossrefAdapterConfig,
  PaperSourceError,
  PaperSourceErrorCode,
  FetchedPaper,
  PaperQuery,
  PaperSourcePort,
} from './arxiv-crossref-adapter.js';

// ============================================================================
// Research Decomposition (LLM-assisted)
// ============================================================================

export { decomposeResearch } from './decompose-research.js';
export type {
  ResearchSubtask,
  ResearchSubtaskType,
  SubtaskPriority,
  DecomposeResearchConfig,
} from './decompose-research.js';
