/**
 * nexus-agents/orchestration - Consensus Planning Types
 *
 * Types for multi-CLI plan generation and synthesis.
 * Multiple CLIs independently generate plans, then synthesis
 * identifies agreements and divergences.
 *
 * @module orchestration/consensus-plan-types
 * (Source: Issue #863 — Consensus planning mode)
 */

import { z } from 'zod';
import type { CliName } from '../cli-adapters/types-core.js';
import { PER_CLI_TASK_TIMEOUTS } from '../config/timeouts.js';

// ============================================================================
// Plan Structure
// ============================================================================

export const PlanStepSchema = z.object({
  /** Step description. */
  description: z.string(),
  /** Estimated complexity: low, medium, high. */
  complexity: z.enum(['low', 'medium', 'high']).default('medium'),
  /** Dependencies on other step indices. */
  dependencies: z.array(z.number().int().min(0)).default([]),
});

export type PlanStep = z.infer<typeof PlanStepSchema>;

export const PlanRiskSchema = z.object({
  /** Risk description. */
  description: z.string(),
  /** Impact level. */
  impact: z.enum(['low', 'medium', 'high']).default('medium'),
  /** Mitigation strategy. */
  mitigation: z.string().default(''),
});

export type PlanRisk = z.infer<typeof PlanRiskSchema>;

/** A structured plan from a single CLI. */
export interface CliPlan {
  readonly steps: readonly PlanStep[];
  readonly risks: readonly PlanRisk[];
  readonly alternatives: readonly string[];
  readonly summary: string;
}

// ============================================================================
// CLI Plan Partition
// ============================================================================

/** Result from a single CLI's planning. */
export interface CliPlanPartition {
  readonly cli: CliName;
  readonly success: boolean;
  readonly plan: CliPlan | null;
  readonly rawOutput: string;
  readonly durationMs: number;
  readonly model?: string;
  readonly error?: string;
}

// ============================================================================
// Synthesis Types
// ============================================================================

/** A step that appears in multiple plans. */
export interface AgreedStep {
  /** The step description (from the highest-confidence source). */
  readonly description: string;
  /** Which CLIs proposed this step. */
  readonly proposedBy: readonly CliName[];
}

/** A point where plans diverge. */
export interface Divergence {
  /** What the divergence is about. */
  readonly topic: string;
  /** What each CLI proposed. */
  readonly positions: ReadonlyMap<CliName, string>;
}

/** Synthesized result from multiple plans. */
export interface ConsensusPlanResult {
  /** Per-CLI partition results. */
  readonly partitions: readonly CliPlanPartition[];
  /** Steps that multiple CLIs agreed on. */
  readonly agreedSteps: readonly AgreedStep[];
  /** Points of divergence between CLIs. */
  readonly divergences: readonly Divergence[];
  /** All risks collected from all CLIs (deduplicated). */
  readonly risks: readonly PlanRisk[];
  /** Merged alternatives from all CLIs. */
  readonly alternatives: readonly string[];
  /** Executive summary. */
  readonly summary: string;
  /** CLIs that successfully contributed. */
  readonly clisUsed: readonly CliName[];
  /** Total time for planning. */
  readonly totalDurationMs: number;
}

// ============================================================================
// Configuration
// ============================================================================

export const ConsensusPlanConfigSchema = z.object({
  /** Max CLIs to dispatch to (default: 3). */
  maxClis: z.number().int().min(1).max(4).default(3),
  /** Per-CLI timeout in ms (default from config/timeouts.ts, Issue #984). */
  perCliTimeoutMs: z
    .number()
    .int()
    .min(PER_CLI_TASK_TIMEOUTS.minMs)
    .max(PER_CLI_TASK_TIMEOUTS.maxMs)
    .default(PER_CLI_TASK_TIMEOUTS.defaultMs),
  /** Max chars per CLI response (default: 8000). */
  maxOutputCharsPerCli: z.number().int().min(100).max(30_000).default(8000),
});

export type ConsensusPlanConfig = z.infer<typeof ConsensusPlanConfigSchema>;

/** Creates default configuration. */
export function createDefaultPlanConfig(): ConsensusPlanConfig {
  return ConsensusPlanConfigSchema.parse({});
}
