/**
 * nexus-agents/swe-bench - Evaluation Comparison Types
 *
 * Comparison and leaderboard types for competitor analysis.
 *
 * @module swe-bench/evaluation-comparison-types
 * @see https://www.swebench.com/SWE-bench/guides/evaluation/
 * (Source: Issue #257 - SWE-Bench Evaluation)
 */

import type { SWEBenchVariant } from './types.js';
import type { EvaluationRunResult } from './evaluation-result-types.js';

/**
 * Known competitor systems for comparison.
 */
export type CompetitorSystem =
  | 'devin'
  | 'aider'
  | 'claude-code'
  | 'cursor'
  | 'codex'
  | 'gpt-engineer'
  | 'auto-gpt'
  | 'other';

/**
 * Comparison data point for a competitor.
 */
export interface CompetitorResult {
  /** Competitor system name. */
  readonly system: CompetitorSystem;
  /** Display name. */
  readonly displayName: string;
  /** SWE-bench variant evaluated. */
  readonly variant: SWEBenchVariant;
  /** Resolution rate achieved. */
  readonly resolutionRate: number;
  /** Number of instances resolved. */
  readonly resolvedInstances: number;
  /** Total instances evaluated. */
  readonly totalInstances: number;
  /** Average tokens per instance (if available). */
  readonly avgTokensPerInstance?: number;
  /** Average cost per instance (if available). */
  readonly avgCostPerInstance?: number;
  /** Data source URL. */
  readonly sourceUrl?: string;
  /** Date of the result. */
  readonly resultDate: string;
}

/**
 * Comparison report between nexus-agents and competitors.
 */
export interface ComparisonReport {
  /** nexus-agents result. */
  readonly nexusResult: EvaluationRunResult;
  /** Competitor results for comparison. */
  readonly competitors: readonly CompetitorResult[];
  /** Ranking among competitors. */
  readonly ranking: number;
  /** Total systems compared. */
  readonly totalSystems: number;
  /** Report generation timestamp. */
  readonly generatedAt: string;
}

/**
 * Leaderboard entry for a model/system.
 */
export interface LeaderboardEntry {
  /** Rank on leaderboard. */
  readonly rank: number;
  /** System/model name. */
  readonly modelName: string;
  /** Organization/team. */
  readonly organization?: string;
  /** Resolution rate on SWE-bench Lite. */
  readonly liteResolutionRate?: number;
  /** Resolution rate on SWE-bench Verified. */
  readonly verifiedResolutionRate?: number;
  /** Resolution rate on full SWE-bench. */
  readonly fullResolutionRate?: number;
  /** Submission date. */
  readonly submissionDate: string;
  /** Whether this is an agent system vs. single-turn model. */
  readonly isAgentSystem: boolean;
  /** Source/paper URL. */
  readonly sourceUrl?: string;
}

/**
 * Snapshot of the SWE-bench leaderboard.
 */
export interface LeaderboardSnapshot {
  /** When this snapshot was taken. */
  readonly snapshotDate: string;
  /** Entries sorted by rank. */
  readonly entries: readonly LeaderboardEntry[];
  /** Source URL for the leaderboard. */
  readonly sourceUrl: string;
}
