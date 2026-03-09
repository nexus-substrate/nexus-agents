/**
 * nexus-agents/cli-adapters - Router Scoring Logic
 *
 * Scoring functions for the capability-based task router.
 * Extracted from router.ts for maintainability.
 *
 * (Source: Issue #78 - Capability-based task router)
 */

import type { CliName, CapabilityProfile } from './types.js';
import type { TaskProfile, TaskTypeCategory } from '../core/index.js';

// TaskType is an alias for TaskTypeCategory for backward compatibility
type TaskType = TaskTypeCategory;

/**
 * Capability matching matrix from Issue #78.
 * Maps task types to CLI preferences (0-1 scale).
 */
export const CAPABILITY_MATRIX: Record<TaskType, Record<CliName, number>> = {
  architecture: { claude: 0.7, gemini: 1.0, codex: 0.5, opencode: 0.6 },
  large_codebase: { claude: 0.6, gemini: 1.0, codex: 0.5, opencode: 0.7 },
  code_implementation: { claude: 0.8, gemini: 0.5, codex: 1.0, opencode: 0.7 },
  test_generation: { claude: 0.5, gemini: 0.4, codex: 1.0, opencode: 0.6 },
  bulk_operations: { claude: 0.4, gemini: 1.0, codex: 0.7, opencode: 0.7 },
  code_review: { claude: 1.0, gemini: 0.6, codex: 0.7, opencode: 0.7 },
  documentation: { claude: 0.9, gemini: 0.7, codex: 0.5, opencode: 0.6 },
  general: { claude: 0.8, gemini: 0.6, codex: 0.6, opencode: 0.65 },
} as const;

/**
 * Scoring weights for different factors.
 */
export const SCORING_WEIGHTS = {
  taskType: 0.3,
  reasoning: 0.25,
  codeGeneration: 0.15,
  contextWindow: 0.1,
  cost: 0.1,
  speed: 0.1,
} as const;

/**
 * Thresholds for capability-based scoring.
 */
export const SCORING_THRESHOLDS = {
  highComplexity: 7,
  highReasoning: 9,
  highCodeGen: 9,
  largeContext: 100_000,
  veryLargeContext: 500_000,
  highCost: 8,
  highSpeed: 8,
} as const;

/**
 * Gets preference score for task type from capability matrix.
 */
export function getTypePreference(taskType: TaskType, cliName: CliName): number {
  return CAPABILITY_MATRIX[taskType][cliName];
}

/**
 * Scores task type preference.
 */
export function scoreTaskType(profile: TaskProfile, cliName: CliName, reasons: string[]): number {
  const preference = getTypePreference(profile.taskType, cliName);
  if (preference > 0.5) {
    reasons.push(`Preferred for ${profile.taskType}`);
  }
  return preference * SCORING_WEIGHTS.taskType;
}

/**
 * Scores reasoning capability match.
 */
export function scoreReasoning(
  profile: TaskProfile,
  capabilities: CapabilityProfile,
  reasons: string[]
): number {
  if (profile.reasoningComplexity < SCORING_THRESHOLDS.highComplexity) return 0;
  if (capabilities.reasoning >= SCORING_THRESHOLDS.highReasoning) {
    reasons.push('High reasoning capability');
  }
  return (capabilities.reasoning / 10) * SCORING_WEIGHTS.reasoning;
}

/**
 * Scores code generation capability match.
 */
export function scoreCodeGeneration(
  profile: TaskProfile,
  capabilities: CapabilityProfile,
  reasons: string[]
): number {
  if (!profile.codeGeneration) return 0;
  if (capabilities.codeGeneration >= SCORING_THRESHOLDS.highCodeGen) {
    reasons.push('Excellent code generation');
  }
  return (capabilities.codeGeneration / 10) * SCORING_WEIGHTS.codeGeneration;
}

/**
 * Scores context window match.
 */
export function scoreContextWindow(
  profile: TaskProfile,
  capabilities: CapabilityProfile,
  reasons: string[]
): number {
  if (profile.contextRequired <= SCORING_THRESHOLDS.largeContext) return 0;
  if (capabilities.contextWindow >= SCORING_THRESHOLDS.veryLargeContext) {
    reasons.push('Large context window');
  }
  const contextRatio = Math.min(capabilities.contextWindow / profile.contextRequired, 2);
  return (contextRatio - 1) * SCORING_WEIGHTS.contextWindow;
}

/**
 * Scores cost efficiency.
 */
export function scoreCostEfficiency(
  profile: TaskProfile,
  capabilities: CapabilityProfile,
  reasons: string[],
  preferCostEfficient: boolean
): number {
  if (!profile.budgetSensitive && !preferCostEfficient) return 0;
  if (capabilities.cost >= SCORING_THRESHOLDS.highCost) {
    reasons.push('Cost efficient');
  }
  return (capabilities.cost / 10) * SCORING_WEIGHTS.cost;
}

/**
 * Scores speed for parallelizable tasks.
 */
export function scoreSpeed(
  profile: TaskProfile,
  capabilities: CapabilityProfile,
  reasons: string[]
): number {
  if (!profile.parallelizable) return 0;
  if (capabilities.speed >= SCORING_THRESHOLDS.highSpeed) {
    reasons.push('Fast execution');
  }
  return (capabilities.speed / 10) * SCORING_WEIGHTS.speed;
}
