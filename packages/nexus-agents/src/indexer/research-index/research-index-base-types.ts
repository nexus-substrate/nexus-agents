/**
 * nexus-agents/indexer/research-index - Base Type Definitions
 *
 * Fundamental types for research registry entries.
 * Extracted to break circular dependency between research-index-types
 * and research-index-stats-types.
 *
 * @module indexer/research-index/research-index-base-types
 * (Source: Issue #392 - Circular dependency resolution)
 */

import { z } from 'zod';

// ============================================================================
// Schema Version
// ============================================================================

export const RESEARCH_INDEX_SCHEMA_VERSION = '1.0' as const;

// ============================================================================
// Topic & Status Enums
// ============================================================================

/**
 * Research topics tracked in the registry.
 */
// Topics are free-form strings — the registry has 56+ unique topics.
export const ResearchTopicSchema = z.string().min(1);
export type ResearchTopic = z.infer<typeof ResearchTopicSchema>;

/**
 * Technique implementation status.
 */
export const TechniqueStatusSchema = z.enum([
  'implemented',
  'planned',
  'in-progress',
  'not-started',
  'rejected',
]);
export type TechniqueStatus = z.infer<typeof TechniqueStatusSchema>;

/**
 * Paper implementation status.
 */
export const PaperStatusSchema = z.enum([
  'implemented',
  'planned',
  'partial',
  'in-progress',
  'not-started',
  'rejected',
]);
export type PaperStatus = z.infer<typeof PaperStatusSchema>;

/**
 * Technique priority levels.
 */
export const TechniquePrioritySchema = z.enum(['P1', 'P2', 'P3', 'P4']).nullable();
export type TechniquePriority = z.infer<typeof TechniquePrioritySchema>;

/**
 * Technique complexity levels.
 */
export const TechniqueComplexitySchema = z.enum(['low', 'medium', 'high']);
export type TechniqueComplexity = z.infer<typeof TechniqueComplexitySchema>;

/**
 * Source types for non-paper sources.
 */
export const SourceTypeSchema = z.enum([
  'product_docs',
  'specification',
  'research_blog',
  'code_analysis',
]);
export type SourceType = z.infer<typeof SourceTypeSchema>;

// ============================================================================
// Decision History
// ============================================================================

/**
 * A single decision entry in technique history.
 */
export const DecisionHistoryEntrySchema = z.object({
  date: z.string(),
  decision: z.string(),
  rationale: z.string(),
});
export type DecisionHistoryEntry = z.infer<typeof DecisionHistoryEntrySchema>;

// ============================================================================
// Research Paper
// ============================================================================

/**
 * Metrics associated with a paper (key-value pairs).
 */
export const PaperMetricsSchema = z.record(z.string(), z.string());
export type PaperMetrics = z.infer<typeof PaperMetricsSchema>;

/**
 * A research paper entry from papers.yaml.
 */
export const ResearchPaperSchema = z.object({
  /** Paper title */
  title: z.string(),
  /** Paper authors */
  authors: z.array(z.string()).optional().default([]),
  /** Source type (arxiv, conference, journal, preprint) */
  source: z.string().optional(),
  /** arXiv ID (e.g., '2501.06322') */
  arxiv_id: z.string().optional(),
  /** URL to the paper */
  url: z.string().optional(),
  /** Publication date (YYYY-MM format) */
  publication_date: z.string().optional(),
  /** Publication venue */
  venue: z.string().nullable().optional(),

  /** Research topics */
  topics: z.array(ResearchTopicSchema).optional().default([]),
  /** Tags for searching */
  tags: z.array(z.string()).optional().default([]),

  /** Date when the paper was reviewed */
  reviewed_date: z.string().optional(),
  /** File where the paper is reviewed */
  reviewed_in: z.string().optional(),
  /** Summary of the paper */
  summary: z.string().optional(),

  /** Key findings from the paper */
  key_findings: z.array(z.string()).optional().default([]),

  /** Relevance to the project */
  relevance: z.enum(['high', 'medium', 'low']).optional(),
  /** Techniques extracted from this paper */
  techniques_extracted: z.array(z.string()).optional().default([]),

  /** Related GitHub issues */
  related_issues: z.array(z.number()).optional().default([]),
  /** Implementation status */
  implementation_status: PaperStatusSchema.optional().default('not-started'),
});
export type ResearchPaper = z.infer<typeof ResearchPaperSchema>;

// ============================================================================
// Research Technique
// ============================================================================

/**
 * A technique entry from techniques.yaml.
 */
export const ResearchTechniqueSchema = z.object({
  /** Technique name */
  name: z.string(),
  /** Description of the technique */
  description: z.string(),

  /** Source papers (arXiv IDs) */
  source_papers: z.array(z.string()).optional().default([]),

  /** Primary topic */
  topic: ResearchTopicSchema,
  /** Tags for searching */
  tags: z.array(z.string()).optional().default([]),

  /** Metrics associated with this technique */
  metrics: z.record(z.string(), z.string()).optional().default({}),

  /** Implementation status */
  status: TechniqueStatusSchema,
  /** Priority level */
  priority: TechniquePrioritySchema.optional().default(null),
  /** Complexity level */
  complexity: TechniqueComplexitySchema.optional(),

  /** Files where this technique is implemented */
  integration_files: z.array(z.string()).optional().default([]),

  /** GitHub issue number for implementation */
  implementation_issue: z.number().nullable().optional().default(null),
  /** Related PR numbers */
  related_prs: z.array(z.number()).optional().default([]),

  /** Implementation notes */
  notes: z.string().optional(),

  /** Dependent techniques */
  dependencies: z.array(z.string()).optional().default([]),

  /** Decision history */
  decision_history: z.array(DecisionHistoryEntrySchema).optional().default([]),
});
export type ResearchTechnique = z.infer<typeof ResearchTechniqueSchema>;

// ============================================================================
// Research Source (Non-Paper)
// ============================================================================

/**
 * A non-paper source entry from sources.yaml.
 */
export const ResearchSourceSchema = z.object({
  /** Source name */
  name: z.string(),
  /** Source type */
  type: SourceTypeSchema,
  /** URL */
  url: z.string(),
  /** Vendor/organization */
  vendor: z.string().optional(),

  /** Topics covered */
  topics: z.array(ResearchTopicSchema).optional().default([]),
  /** Tags for searching */
  tags: z.array(z.string()).optional().default([]),

  /** Date when reviewed */
  reviewed_date: z.string().optional(),
  /** File where reviewed */
  reviewed_in: z.string().nullable().optional(),

  /** Key information extracted */
  key_info: z.array(z.string()).optional().default([]),
  /** Best practices documented */
  best_practices: z.array(z.string()).optional().default([]),

  /** Version checked */
  version_checked: z.string().optional(),
});
export type ResearchSource = z.infer<typeof ResearchSourceSchema>;

// ============================================================================
// Registry Collections
// ============================================================================

/**
 * Schema for papers.yaml file structure.
 */
export const PapersRegistrySchema = z.object({
  schema_version: z.string(),
  papers: z.record(z.string(), ResearchPaperSchema),
});
export type PapersRegistry = z.infer<typeof PapersRegistrySchema>;

/**
 * Schema for techniques.yaml file structure.
 */
export const TechniquesRegistrySchema = z.object({
  schema_version: z.string(),
  techniques: z.record(z.string(), ResearchTechniqueSchema),
});
export type TechniquesRegistry = z.infer<typeof TechniquesRegistrySchema>;

/**
 * Schema for sources.yaml file structure.
 */
export const SourcesRegistrySchema = z.object({
  schema_version: z.string(),
  sources: z.record(z.string(), ResearchSourceSchema),
});
export type SourcesRegistry = z.infer<typeof SourcesRegistrySchema>;
