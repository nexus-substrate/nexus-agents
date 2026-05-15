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
 * Paper implementation status. Canonical source for this enum (#2717).
 * Other files MUST import this; do not re-declare a parallel z.enum.
 *
 * `deferred` is its own state — distinct from `rejected` (won't-do-ever),
 * `not-started` (haven't-gotten-to-it), and `in-progress` (working-on-it).
 * Used by papers that the team consciously deferred with a documented
 * `deferral_rationale` + explicit `Re-open triggers:` block. Pre-#2717 the
 * 2 papers using it failed strict validation against this schema.
 */
export const PaperStatusSchema = z.enum([
  'implemented',
  'planned',
  'partial',
  'in-progress',
  'not-started',
  'rejected',
  'deferred',
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
  'open_source_repo',
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

  // ── Quality Assessment (Issue #1571) ──────────────────────────
  /** Citation count from Semantic Scholar */
  citation_count: z.number().nonnegative().optional(),
  /** Venue quality tier: 3=top, 2=good, 1=workshop, 0=preprint */
  venue_tier: z.number().min(0).max(3).optional(),
  /** Whether the paper links to a code repository */
  has_code: z.boolean().optional(),
  /** Code repository URL */
  code_url: z.string().optional(),
  /** Rigor assessment tags */
  rigor_tags: z
    .array(
      z.enum(['has-code', 'has-dataset', 'has-baselines', 'peer-reviewed', 'single-model-eval'])
    )
    .optional()
    .default([]),
  /** Composite quality score (0-10) */
  quality_score: z.number().min(0).max(10).optional(),
  /** Evidence confidence tier */
  evidence_tier: z.enum(['high', 'medium', 'low']).optional(),
  /** Quality notes for low-scoring papers */
  quality_notes: z.string().optional(),
  /** When quality was last assessed (ISO date) */
  last_quality_check: z.string().optional(),
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

  // ── Evaluation Plan (Issue #1576 Wave 6) ──────────────────────
  /** Structured evaluation plan for keeping or removing the technique */
  evaluation_plan: z
    .object({
      success_criteria: z.string().optional(),
      evaluation_method: z.string().optional(),
      evaluation_deadline: z.string().optional(),
      removal_criteria: z.string().optional(),
    })
    .optional(),
  /** Evaluation status: pending (not yet evaluated), passed, failed, deferred */
  evaluation_status: z.enum(['pending', 'passed', 'failed', 'deferred']).optional(),
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

  // ── Repo/Tool Quality Signals (for open_source_repo type) ──────
  /** Quality signals for repositories and tools */
  quality_signals: z
    .object({
      stars_at_review: z.number().nonnegative().optional(),
      language: z.string().optional(),
      has_tests: z.boolean().optional(),
      has_docs: z.boolean().optional(),
      has_paper: z.boolean().optional(),
      arxiv_id: z.string().optional(),
    })
    .optional(),
  /** Techniques extracted from this source */
  techniques_extracted: z.array(z.string()).optional().default([]),
  /** Adoption verdict: adopted, partially_adopted, rejected, monitoring, planned */
  verdict: z.enum(['adopted', 'partially_adopted', 'rejected', 'monitoring', 'planned']).optional(),
  /** Notes explaining the verdict */
  verdict_notes: z.string().optional(),
  /** Composite quality score (0-10) */
  quality_score: z.number().min(0).max(10).optional(),
  /** Evidence confidence tier */
  evidence_tier: z.enum(['high', 'medium', 'low']).optional(),
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
