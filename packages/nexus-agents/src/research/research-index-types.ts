/**
 * nexus-agents/research - Research Index Generator Types
 *
 * Type definitions for the research index generator.
 *
 * @see research-index-generator.ts - Main generator
 * @see Issue #367 - Deterministic RESEARCH_INDEX.md generation
 */

import type {
  ResearchTopic,
  TechniqueStatus,
  ResearchPaper,
  ResearchTechnique,
} from './research-schemas.js';

// ============================================================================
// Generator Options
// ============================================================================

/**
 * Options for the index generator.
 */
export interface GeneratorOptions {
  /** Path to papers.yaml */
  readonly papersPath: string;
  /** Path to techniques.yaml */
  readonly techniquesPath: string;
  /** Include P1 techniques table */
  readonly includeP1Table: boolean;
  /** Include P2 techniques table */
  readonly includeP2Table: boolean;
  /** Include papers by topic section */
  readonly includePapersByTopic: boolean;
  /** Include GitHub issues section */
  readonly includeGitHubIssues: boolean;
  /** Number of recent papers to show */
  readonly recentPapersLimit: number;
}

/**
 * Default generator options.
 */
export const DEFAULT_GENERATOR_OPTIONS: GeneratorOptions = {
  papersPath: 'docs/research/registry/papers.yaml',
  techniquesPath: 'docs/research/registry/techniques.yaml',
  includeP1Table: true,
  includeP2Table: true,
  includePapersByTopic: true,
  includeGitHubIssues: true,
  recentPapersLimit: 10,
};

// ============================================================================
// Internal Data Types
// ============================================================================

/**
 * Paper with ID attached for processing.
 */
export interface PaperWithId extends ResearchPaper {
  readonly id: string;
}

/**
 * Technique with ID attached for processing.
 */
export interface TechniqueWithId extends ResearchTechnique {
  readonly id: string;
}

/**
 * Parsed registry data with checksums.
 */
export interface ParsedData {
  readonly papers: readonly PaperWithId[];
  readonly techniques: readonly TechniqueWithId[];
  readonly papersChecksum: string;
  readonly techniquesChecksum: string;
}

/**
 * Statistics computed from registry data.
 */
export interface RegistryStats {
  readonly totalPapers: number;
  readonly totalTechniques: number;
  readonly totalTopics: number;
  readonly techniquesByStatus: Record<TechniqueStatus, number>;
  readonly topicStats: readonly TopicStat[];
}

/**
 * Statistics for a single topic.
 */
export interface TopicStat {
  readonly topic: ResearchTopic;
  readonly papers: number;
  readonly techniques: number;
}
