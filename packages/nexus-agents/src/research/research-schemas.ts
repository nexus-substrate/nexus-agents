/**
 * nexus-agents/research - Enhanced Zod Schemas for Research Registry
 *
 * Schema definitions for papers.yaml and techniques.yaml validation.
 * Implements primary_topic pattern for accurate paper counting.
 *
 * @see Issue #367 - Deterministic RESEARCH_INDEX.md generation
 * @see docs/research/RESEARCH_INDEX.md
 */

import { z } from 'zod';

// ============================================================================
// Schema Version
// ============================================================================

export const RESEARCH_SCHEMA_VERSION = '1.1' as const;

// ============================================================================
// Topic & Status Enums
// ============================================================================

/**
 * Research topics tracked in the registry.
 * Extended to include 'security' topic per issue #367.
 */
// Topics are free-form strings — the registry has 56+ unique topics.
// Using z.string() instead of z.enum() to avoid validation failures
// when new topics are added to papers.yaml.
export const ResearchTopicSchema = z.string().min(1);
export type ResearchTopic = z.infer<typeof ResearchTopicSchema>;

/** All valid research topics. */
export const RESEARCH_TOPICS: readonly ResearchTopic[] = [
  'consensus',
  'routing',
  'memory',
  'code-generation',
  'cli-tools',
  'orchestration',
  'security',
] as const;

/**
 * Topic descriptions for documentation.
 */
export const TOPIC_DESCRIPTIONS: Readonly<Record<ResearchTopic, string>> = {
  consensus: 'Multi-agent decision protocols',
  routing: 'Cost-efficient model routing',
  memory: 'Context and long-term memory',
  'code-generation': 'Self-improvement and skill learning',
  'cli-tools': 'External CLI integration',
  orchestration: 'Multi-agent coordination',
  security: 'Safety analysis and evaluation',
};

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
 * Paper relevance levels.
 */
export const RelevanceSchema = z.enum(['high', 'medium', 'low']);
export type Relevance = z.infer<typeof RelevanceSchema>;

/**
 * Paper source type.
 */
export const PaperSourceSchema = z.enum(['arxiv', 'conference', 'journal', 'preprint']);
export type PaperSource = z.infer<typeof PaperSourceSchema>;

// ============================================================================
// Decision History
// ============================================================================

/**
 * A single decision entry in technique history.
 */
export const DecisionHistoryEntrySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format'),
  decision: z.string().min(1),
  rationale: z.string().min(1),
});
export type DecisionHistoryEntry = z.infer<typeof DecisionHistoryEntrySchema>;

// ============================================================================
// Research Paper Schema
// ============================================================================

/**
 * A research paper entry from papers.yaml.
 *
 * Design note: Papers use `topics` (array) for multi-topic classification.
 * The first topic in the array is considered the "primary topic" for counting.
 */
export const ResearchPaperSchema = z.object({
  /** Paper title (required) */
  title: z.string().min(1),
  /** Paper authors */
  authors: z.array(z.string()).optional().default([]),
  /** Source type */
  source: PaperSourceSchema.optional(),
  /** arXiv ID (e.g., '2501.06322') */
  arxiv_id: z.string().optional(),
  /** URL to the paper */
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- z.url() fails at runtime despite being recommended
  url: z.string().url().optional(),
  /** Publication date (YYYY-MM format) */
  publication_date: z.string().optional(),
  /** Publication venue */
  venue: z.string().nullable().optional(),

  /**
   * Research topics (array).
   * First topic is considered primary for counting purposes.
   */
  topics: z.array(z.string()).optional().default([]),
  /** Tags for searching */
  tags: z.array(z.string()).optional().default([]),

  /** Date when the paper was reviewed (YYYY-MM-DD) */
  reviewed_date: z.string().optional(),
  /** File where the paper is reviewed */
  reviewed_in: z.string().optional(),
  /** Summary of the paper */
  summary: z.string().optional(),

  /** Key findings from the paper */
  key_findings: z.array(z.string()).optional().default([]),

  /** Relevance to the project */
  relevance: RelevanceSchema.optional(),
  /** Techniques extracted from this paper */
  techniques_extracted: z.array(z.string()).optional().default([]),

  /** Related GitHub issues */
  related_issues: z.array(z.number().int().positive()).optional().default([]),
  /** Implementation status */
  implementation_status: PaperStatusSchema.optional().default('not-started'),
});
export type ResearchPaper = z.infer<typeof ResearchPaperSchema>;

// ============================================================================
// Research Technique Schema
// ============================================================================

/**
 * Integration file entry with type information.
 */
export const IntegrationFileObjectSchema = z.object({
  path: z.string(),
  type: z.enum(['primary', 'test', 'types', 'helpers']).optional(),
  required: z.boolean().default(true),
});

export const IntegrationFileSchema = z.union([z.string(), IntegrationFileObjectSchema]);
export type IntegrationFile = z.infer<typeof IntegrationFileSchema>;
export type IntegrationFileObject = z.infer<typeof IntegrationFileObjectSchema>;

/**
 * A technique entry from techniques.yaml.
 */
export const ResearchTechniqueSchema = z.object({
  /** Technique name (required) */
  name: z.string().min(1),
  /** Description of the technique (required) */
  description: z.string().min(1),

  /** Source papers (arXiv IDs or paper IDs) */
  source_papers: z.array(z.string()).optional().default([]),

  /** Primary topic (required) */
  topic: ResearchTopicSchema,
  /** Tags for searching */
  tags: z.array(z.string()).optional().default([]),

  /** Metrics associated with this technique */
  metrics: z.record(z.string(), z.string()).optional().default({}),

  /** Implementation status (required) */
  status: TechniqueStatusSchema,
  /** Priority level */
  priority: TechniquePrioritySchema.optional().default(null),
  /** Complexity level */
  complexity: TechniqueComplexitySchema.optional(),

  /** Files where this technique is implemented */
  integration_files: z.array(IntegrationFileSchema).optional().default([]),

  /** GitHub issue number for implementation */
  implementation_issue: z.number().int().positive().nullable().optional().default(null),
  /** Related PR numbers */
  related_prs: z.array(z.number().int().positive()).optional().default([]),

  /** Implementation notes */
  notes: z.string().optional(),

  /** Dependent techniques */
  dependencies: z.array(z.string()).optional().default([]),

  /** Decision history */
  decision_history: z.array(DecisionHistoryEntrySchema).optional().default([]),
});
export type ResearchTechnique = z.infer<typeof ResearchTechniqueSchema>;

// ============================================================================
// Registry Schemas
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

// ============================================================================
// Validation Result Types
// ============================================================================

/**
 * Validation issue severity.
 */
export type ValidationSeverity = 'error' | 'warning' | 'info';

/**
 * A single validation issue.
 */
export interface ValidationIssue {
  readonly severity: ValidationSeverity;
  readonly code: string;
  readonly message: string;
  readonly file: string;
  readonly path?: string;
  readonly suggestion?: string;
}

/**
 * Complete validation result.
 */
export interface ValidationResult {
  readonly valid: boolean;
  readonly issues: readonly ValidationIssue[];
  readonly stats: {
    readonly errors: number;
    readonly warnings: number;
    readonly infos: number;
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the primary topic for a paper (first topic in array).
 */
export function getPrimaryTopic(paper: ResearchPaper): ResearchTopic | undefined {
  return paper.topics[0];
}

/**
 * Normalize integration file to string path.
 */
export function getIntegrationFilePath(file: IntegrationFile): string {
  if (typeof file === 'string') {
    return file;
  }
  return file.path;
}

/**
 * Check if integration file is required.
 */
export function isIntegrationFileRequired(file: IntegrationFile): boolean {
  if (typeof file === 'string') {
    return true;
  }
  // file.required is always defined after Zod parsing (defaults to true)
  // but may be undefined in raw input before parsing
  return file.required;
}
