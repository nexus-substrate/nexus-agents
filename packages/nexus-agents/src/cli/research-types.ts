/**
 * Research Registry CLI Types
 *
 * Type definitions for the research registry CLI commands.
 * Used for interacting with docs/research/registry/ YAML files.
 *
 * @see docs/research/RESEARCH_INDEX.md
 * @see docs/research/CONTRIBUTING.md
 */

import { z } from 'zod';
import type { CommandResult } from '../core/index.js';

// =============================================================================
// PAPER TYPES
// =============================================================================

/**
 * Paper source type
 */
export type PaperSource = 'arxiv' | 'conference' | 'journal' | 'preprint';

/**
 * Paper relevance level
 */
export type Relevance = 'high' | 'medium' | 'low';

/**
 * Paper implementation status
 */
export type PaperImplementationStatus = 'not-started' | 'planned' | 'in-progress' | 'implemented';

/**
 * Research paper entry in papers.yaml
 */
export interface PaperEntry {
  readonly title: string;
  readonly authors: readonly string[];
  readonly source: PaperSource;
  readonly arxiv_id: string;
  readonly url: string;
  readonly publication_date: string;
  readonly venue: string | null;

  readonly topics: readonly string[];
  readonly tags: readonly string[];

  readonly reviewed_date: string;
  readonly reviewed_in: string;
  readonly summary: string;

  readonly key_findings: readonly string[];

  readonly relevance: Relevance;
  readonly techniques_extracted: readonly string[];

  readonly related_issues: readonly number[];
  readonly implementation_status: PaperImplementationStatus;

  // Quality assessment (Issue #1571)
  readonly venue_tier?: number;
  readonly quality_score?: number;
  readonly evidence_tier?: 'high' | 'medium' | 'low';
}

/**
 * Papers registry structure
 */
export interface PapersRegistry {
  readonly schema_version: string;
  readonly papers: Record<string, PaperEntry>;
}

// =============================================================================
// TECHNIQUE TYPES
// =============================================================================

/**
 * Technique implementation status
 */
export type TechniqueStatus =
  | 'not-started'
  | 'planned'
  | 'in-progress'
  | 'implemented'
  | 'rejected';

/**
 * Technique priority level
 */
export type Priority = 'P1' | 'P2' | 'P3' | 'P4' | null;

/**
 * Technique complexity level
 */
export type Complexity = 'low' | 'medium' | 'high';

/**
 * Decision history entry
 */
export interface DecisionHistoryEntry {
  readonly date: string;
  readonly decision: string;
  readonly rationale: string;
}

/**
 * Technique entry in techniques.yaml
 */
export interface TechniqueEntry {
  readonly name: string;
  readonly description: string;

  readonly source_papers: readonly string[];

  readonly topic: string;
  readonly tags: readonly string[];

  readonly metrics: Record<string, string>;

  readonly status: TechniqueStatus;
  readonly priority: Priority;
  readonly complexity: Complexity;

  readonly integration_files: readonly string[];

  readonly implementation_issue: number | null;
  readonly related_prs: readonly number[];

  readonly notes: string;

  readonly dependencies: readonly string[];

  readonly decision_history: readonly DecisionHistoryEntry[];
}

/**
 * Techniques registry structure
 */
export interface TechniquesRegistry {
  readonly schema_version: string;
  readonly techniques: Record<string, TechniqueEntry>;
}

// =============================================================================
// COMMAND OPTIONS
// =============================================================================

/**
 * Options for 'research add' command
 */
export const ResearchAddOptionsSchema = z.object({
  arxivId: z.string().regex(/^\d{4}\.\d{4,5}$/, 'Invalid arXiv ID format (expected XXXX.XXXXX)'),
  topic: z.string().optional(),
  priority: z.enum(['P1', 'P2', 'P3', 'P4']).optional(),
  dryRun: z.boolean().default(false),
});

export type ResearchAddOptions = z.infer<typeof ResearchAddOptionsSchema>;

/**
 * Options for 'research status' command
 */
export const ResearchStatusOptionsSchema = z.object({
  techniqueId: z.string().optional(),
  status: z.enum(['implemented', 'planned', 'not-started', 'rejected', 'all']).default('all'),
  format: z.enum(['table', 'json', 'compact']).default('table'),
});

export type ResearchStatusOptions = z.infer<typeof ResearchStatusOptionsSchema>;

/**
 * Options for 'research overlap' command
 */
export const ResearchOverlapOptionsSchema = z.object({
  techniqueId: z.string(),
  threshold: z.number().min(0).max(1).default(0.3),
  format: z.enum(['table', 'json']).default('table'),
});

export type ResearchOverlapOptions = z.infer<typeof ResearchOverlapOptionsSchema>;

// =============================================================================
// COMMAND RESULTS
// =============================================================================

/**
 * Result of 'research add' command.
 * Extends CommandResult base pattern (Issue #584).
 */
export interface ResearchAddResult extends CommandResult {
  /** Always present - human-readable message */
  readonly message: string;
  /** Paper ID that was added */
  readonly paperId: string;
  /** Paper title */
  readonly title: string;
  /** Whether this was a dry run */
  readonly dryRun: boolean;
}

/**
 * Technique status summary
 */
export interface TechniqueStatusSummary {
  readonly id: string;
  readonly name: string;
  readonly status: TechniqueStatus;
  readonly priority: Priority;
  readonly topic: string;
  readonly implementationIssue: number | null;
}

/**
 * Result of 'research status' command.
 * Extends CommandResult base pattern (Issue #584).
 */
export interface ResearchStatusResult extends CommandResult {
  /** Techniques matching the query */
  readonly techniques: readonly TechniqueStatusSummary[];
  /** Counts by status */
  readonly counts: {
    readonly implemented: number;
    readonly planned: number;
    readonly notStarted: number;
    readonly rejected: number;
    readonly total: number;
  };
}

/**
 * Overlap match between techniques
 */
export interface OverlapMatch {
  readonly techniqueId: string;
  readonly name: string;
  readonly overlapScore: number;
  readonly sharedTags: readonly string[];
  readonly sharedTopic: boolean;
  readonly relationship:
    | 'complementary'
    | 'overlapping'
    | 'conflicting'
    | 'enhances'
    | 'supersedes';
}

/**
 * Result of 'research overlap' command.
 * Extends CommandResult base pattern (Issue #584).
 */
export interface ResearchOverlapResult extends CommandResult {
  /** Source technique ID */
  readonly sourceId: string;
  /** Matching techniques with overlap scores */
  readonly matches: readonly OverlapMatch[];
  /** Suggested alignment entries */
  readonly suggestedAlignments: readonly string[];
}

// =============================================================================
// ARXIV API TYPES
// =============================================================================

/**
 * Metadata fetched from arXiv API
 */
export interface ArxivMetadata {
  readonly id: string;
  readonly title: string;
  readonly authors: readonly string[];
  readonly summary: string;
  readonly published: string;
  readonly updated: string;
  readonly categories: readonly string[];
  readonly pdfUrl: string;
}
