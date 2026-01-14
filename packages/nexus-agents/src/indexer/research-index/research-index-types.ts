/**
 * nexus-agents/indexer/research-index - Type Definitions
 *
 * Types for parsing research registry YAML files and generating
 * statistics and markdown index documentation.
 *
 * (Source: Research Tracking System - docs/research/RESEARCH_INDEX.md)
 *
 * File length justification: Zod schemas for research registry validation
 * (papers, techniques, sources, stats). Schemas are interdependent and
 * splitting would create circular import issues.
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
export const ResearchTopicSchema = z.enum([
  'consensus',
  'routing',
  'memory',
  'code-generation',
  'cli-tools',
  'orchestration',
]);
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
export const PaperMetricsSchema = z.record(z.string());
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
  metrics: z.record(z.string()).optional().default({}),

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
// Registry Schemas (for parsing YAML files)
// ============================================================================

/**
 * Schema for papers.yaml file structure.
 */
export const PapersRegistrySchema = z.object({
  schema_version: z.string(),
  papers: z.record(ResearchPaperSchema),
});
export type PapersRegistry = z.infer<typeof PapersRegistrySchema>;

/**
 * Schema for techniques.yaml file structure.
 */
export const TechniquesRegistrySchema = z.object({
  schema_version: z.string(),
  techniques: z.record(ResearchTechniqueSchema),
});
export type TechniquesRegistry = z.infer<typeof TechniquesRegistrySchema>;

/**
 * Schema for sources.yaml file structure.
 */
export const SourcesRegistrySchema = z.object({
  schema_version: z.string(),
  sources: z.record(ResearchSourceSchema),
});
export type SourcesRegistry = z.infer<typeof SourcesRegistrySchema>;

// ============================================================================
// Statistics Types
// ============================================================================

/**
 * Statistics for a single topic.
 */
export interface TopicStats {
  /** Topic name */
  readonly topic: ResearchTopic;
  /** Number of papers in this topic */
  readonly paperCount: number;
  /** Number of techniques in this topic */
  readonly techniqueCount: number;
}

/**
 * Statistics by technique status.
 */
export interface TechniqueStatusStats {
  /** Number of implemented techniques */
  readonly implemented: number;
  /** Number of planned techniques */
  readonly planned: number;
  /** Number of in-progress techniques */
  readonly inProgress: number;
  /** Number of not-started techniques */
  readonly notStarted: number;
  /** Number of rejected techniques */
  readonly rejected: number;
}

/**
 * Statistics by technique priority.
 */
export interface TechniquePriorityStats {
  /** P1 techniques count */
  readonly P1: number;
  /** P2 techniques count */
  readonly P2: number;
  /** P3 techniques count */
  readonly P3: number;
  /** P4 techniques count */
  readonly P4: number;
  /** No priority assigned */
  readonly none: number;
}

/**
 * Complete research index statistics.
 */
export interface ResearchIndexStats {
  /** Total number of papers */
  readonly totalPapers: number;
  /** Total number of techniques */
  readonly totalTechniques: number;
  /** Total number of sources */
  readonly totalSources: number;
  /** Total number of topics */
  readonly totalTopics: number;

  /** Techniques grouped by status */
  readonly techniquesByStatus: TechniqueStatusStats;
  /** Techniques grouped by priority */
  readonly techniquesByPriority: TechniquePriorityStats;
  /** Statistics per topic */
  readonly topicStats: readonly TopicStats[];
}

// ============================================================================
// Research Index (Complete Data Structure)
// ============================================================================

/**
 * Paper with its ID included.
 */
export interface ResearchPaperWithId extends ResearchPaper {
  /** Paper ID (e.g., 'arxiv-2501.06322') */
  readonly id: string;
}

/**
 * Technique with its ID included.
 */
export interface ResearchTechniqueWithId extends ResearchTechnique {
  /** Technique ID (e.g., 'aegean-consensus') */
  readonly id: string;
}

/**
 * Source with its ID included.
 */
export interface ResearchSourceWithId extends ResearchSource {
  /** Source ID (e.g., 'claude-code-docs') */
  readonly id: string;
}

/**
 * Complete parsed research index.
 */
export interface ResearchIndex {
  /** Schema version */
  readonly schemaVersion: string;
  /** Generation timestamp (ISO 8601, ET timezone) */
  readonly generatedAt: string;
  /** Parsed papers */
  readonly papers: readonly ResearchPaperWithId[];
  /** Parsed techniques */
  readonly techniques: readonly ResearchTechniqueWithId[];
  /** Parsed sources */
  readonly sources: readonly ResearchSourceWithId[];
  /** Computed statistics */
  readonly stats: ResearchIndexStats;
}

// ============================================================================
// Parser Options
// ============================================================================

/**
 * Options for the research index parser.
 */
export interface ResearchIndexParserOptions {
  /** Path to the research registry directory */
  readonly registryPath: string;
  /** Whether to validate all entries strictly */
  readonly strictValidation: boolean;
}

/**
 * Default parser options.
 */
export const DEFAULT_RESEARCH_INDEX_PARSER_OPTIONS: ResearchIndexParserOptions = {
  registryPath: 'docs/research/registry',
  strictValidation: true,
};

// ============================================================================
// Generator Options
// ============================================================================

/**
 * Options for the research index generator.
 */
export interface ResearchIndexGeneratorOptions {
  /** Include P1 techniques table */
  readonly includeP1Table: boolean;
  /** Include P2 techniques table */
  readonly includeP2Table: boolean;
  /** Include recently reviewed papers section */
  readonly includeRecentPapers: boolean;
  /** Number of recent papers to show */
  readonly recentPapersLimit: number;
  /** Include papers by topic section */
  readonly includePapersByTopic: boolean;
  /** Include GitHub issues section */
  readonly includeGitHubIssues: boolean;
}

/**
 * Default generator options.
 */
export const DEFAULT_RESEARCH_INDEX_GENERATOR_OPTIONS: ResearchIndexGeneratorOptions = {
  includeP1Table: true,
  includeP2Table: true,
  includeRecentPapers: true,
  recentPapersLimit: 5,
  includePapersByTopic: true,
  includeGitHubIssues: true,
};

// ============================================================================
// Result Types
// ============================================================================

/**
 * Parser error types.
 */
export class ResearchIndexParseError extends Error {
  constructor(
    message: string,
    public readonly file: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'ResearchIndexParseError';
  }
}

/**
 * Generator error types.
 */
export class ResearchIndexGeneratorError extends Error {
  constructor(
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'ResearchIndexGeneratorError';
  }
}
