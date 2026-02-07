/**
 * nexus-agents/orchestration - Triangulated Code Review Types
 *
 * Types for multi-CLI code review dispatch with finding deduplication
 * and confidence weighting.
 *
 * @module orchestration/triangulated-review-types
 * (Source: Issue #864 — Code review triangulation across CLIs)
 */

import { z } from 'zod';
import type { CliName } from '../cli-adapters/types-core.js';
import type {
  ReviewFinding,
  ReviewSeverity,
  ReviewCategory,
} from '../dogfooding/pr-review-types.js';

// Re-export for consumer convenience
export type { ReviewFinding, ReviewSeverity, ReviewCategory };

// ============================================================================
// CLI Review Partition
// ============================================================================

/** Result from a single CLI's review. */
export interface CliReviewPartition {
  readonly cli: CliName;
  readonly success: boolean;
  readonly findings: readonly ReviewFinding[];
  readonly summary: string;
  readonly durationMs: number;
  readonly model?: string;
  readonly error?: string;
}

// ============================================================================
// Deduplicated Finding
// ============================================================================

/** A finding that may have been seen by multiple CLIs. */
export interface DeduplicatedFinding {
  /** The canonical finding (from the highest-confidence source). */
  readonly finding: ReviewFinding;
  /** Which CLIs reported this (or a similar) finding. */
  readonly reportedBy: readonly CliName[];
  /** Weighted confidence incorporating specialization bonus. */
  readonly weightedConfidence: number;
  /** Number of CLIs that independently found this. */
  readonly corroborationCount: number;
}

// ============================================================================
// Triangulated Review Result
// ============================================================================

/** Combined result from triangulated code review. */
export interface TriangulatedReviewResult {
  /** Per-CLI partition results. */
  readonly partitions: readonly CliReviewPartition[];
  /** Deduplicated and confidence-weighted findings. */
  readonly findings: readonly DeduplicatedFinding[];
  /** CLIs that successfully contributed. */
  readonly clisUsed: readonly CliName[];
  /** Total time for the review. */
  readonly totalDurationMs: number;
  /** Executive summary. */
  readonly summary: string;
  /** Finding counts by severity. */
  readonly countBySeverity: Readonly<Record<ReviewSeverity, number>>;
}

// ============================================================================
// Configuration
// ============================================================================

export const TriangulatedReviewConfigSchema = z.object({
  /** Max CLIs to dispatch to (default: 3). */
  maxClis: z.number().int().min(1).max(4).default(3),
  /** Per-CLI timeout in ms (default: 90_000). */
  perCliTimeoutMs: z.number().int().min(1000).max(300_000).default(90_000),
  /** Max chars per CLI response (default: 8000). */
  maxOutputCharsPerCli: z.number().int().min(100).max(30_000).default(8000),
  /** Line proximity for dedup: findings within N lines are considered same (default: 5). */
  lineProximity: z.number().int().min(0).max(50).default(5),
});

export type TriangulatedReviewConfig = z.infer<typeof TriangulatedReviewConfigSchema>;

/** Creates default configuration. */
export function createDefaultReviewConfig(): TriangulatedReviewConfig {
  return TriangulatedReviewConfigSchema.parse({});
}
