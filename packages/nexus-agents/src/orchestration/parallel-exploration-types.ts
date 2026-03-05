/**
 * nexus-agents/orchestration - Parallel Exploration Types
 *
 * Types for multi-CLI parallel exploration dispatch.
 *
 * @module orchestration/parallel-exploration-types
 * (Source: Issue #862 — Multi-model parallel exploration)
 */

import { z } from 'zod';
import type { CliName } from '../cli-adapters/types-core.js';
import type { TaskCategory } from '../config/task-specialization-types.js';

// ============================================================================
// Partition & Result Types
// ============================================================================

/** Result from a single CLI partition. */
export interface PartitionResult {
  readonly cli: CliName;
  readonly success: boolean;
  readonly output: string;
  readonly durationMs: number;
  readonly model?: string;
  readonly error?: string;
}

/** Combined result from parallel exploration. */
export interface ExplorationResult {
  readonly partitions: readonly PartitionResult[];
  readonly synthesized: string;
  readonly totalDurationMs: number;
  readonly clisUsed: readonly CliName[];
  readonly category: TaskCategory;
}

// ============================================================================
// Configuration
// ============================================================================

export const ParallelExplorationConfigSchema = z.object({
  /** Max CLIs to dispatch to in parallel (default: 3) */
  maxParallelClis: z.number().int().min(1).max(4).default(3),
  /** Timeout per CLI invocation in ms (default: 90_000, raised from 60s for reliability). */
  perCliTimeoutMs: z.number().int().min(1000).max(300_000).default(90_000),
  /** Maximum output chars per CLI response (default: 8000, raised from 4k for exploration depth). */
  maxOutputCharsPerCli: z.number().int().min(100).max(20_000).default(8000),
});

export type ParallelExplorationConfig = z.infer<typeof ParallelExplorationConfigSchema>;

/** Creates default configuration. */
export function createDefaultConfig(): ParallelExplorationConfig {
  return ParallelExplorationConfigSchema.parse({});
}

// ============================================================================
// Eligibility Check
// ============================================================================

/** Categories eligible for parallel exploration. */
const PARALLEL_ELIGIBLE_CATEGORIES: ReadonlySet<TaskCategory> = new Set([
  'exploration',
  'research',
  'code_review',
]);

/** Checks if a task category is eligible for parallel exploration. */
export function isParallelEligible(category: TaskCategory): boolean {
  return PARALLEL_ELIGIBLE_CATEGORIES.has(category);
}
