/**
 * nexus-agents/indexer/research-index - Statistics & Configuration Types
 *
 * Types for research index statistics, parser/generator options, and errors.
 * Extracted from research-index-types.ts to maintain file size limits.
 *
 * (Source: Research Tracking System - docs/research/RESEARCH_INDEX.md)
 */

import type {
  ResearchTopic,
  ResearchPaper,
  ResearchTechnique,
  ResearchSource,
} from './research-index-types.js';

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
// Error Types
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
