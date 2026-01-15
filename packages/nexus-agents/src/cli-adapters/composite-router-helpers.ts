/**
 * nexus-agents/cli-adapters - CompositeRouter Helper Functions
 *
 * Pure helper functions extracted from CompositeRouter to reduce file size.
 *
 * @module cli-adapters/composite-router-helpers
 * (Source: Issue #275, Epic #164)
 */

import type { CliName } from './types.js';
import type { BanditContext } from './budget-router-types.js';
import type { TopsisModelProfile } from './topsis-types.js';
import type { TaskProfile } from './task-analyzer.js';

/**
 * Adjusts model profile based on task characteristics.
 */
export function adjustProfileForTask(
  profile: TopsisModelProfile,
  taskProfile: TaskProfile
): TopsisModelProfile {
  if (taskProfile.taskType === 'architecture' || taskProfile.reasoningComplexity > 7) {
    return { ...profile, qualityScore: Math.min(profile.qualityScore * 1.2, 10) };
  }
  if (taskProfile.taskType === 'bulk_operations' || taskProfile.contextRequired < 1000) {
    return { ...profile, averageLatencyMs: profile.averageLatencyMs * 0.8 };
  }
  return profile;
}

/**
 * Converts a task profile to LinUCB bandit context.
 */
export function taskProfileToBanditContext(profile: TaskProfile): BanditContext {
  return {
    taskComplexity: profile.reasoningComplexity / 10,
    contextLengthNormalized: Math.min(profile.contextRequired / 100000, 1),
    isCodeTask: profile.codeGeneration,
    isReasoningTask: profile.taskType === 'architecture' || profile.reasoningComplexity > 5,
    budgetUtilization: 0.5,
    timePressure: 0.3,
  };
}

/**
 * Calculates routing confidence from multiple scores.
 */
export function calculateConfidence(
  topsisScore: number | undefined,
  ucbScore: number | undefined,
  candidateCount: number
): number {
  const scores: number[] = [];
  if (topsisScore !== undefined) scores.push(topsisScore);
  if (ucbScore !== undefined) scores.push(Math.min(ucbScore / 10, 1));
  const baseConfidence = Math.min(0.5 + candidateCount * 0.1, 0.8);
  if (scores.length === 0) return baseConfidence;
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  return 0.3 * baseConfidence + 0.7 * avgScore;
}

/**
 * Builds a human-readable routing reason.
 */
export function buildReason(
  selectedCli: CliName,
  stages: string[],
  topsisScore?: number,
  ucbScore?: number,
  preferenceScore?: number
): string {
  const parts: string[] = ['Selected ' + selectedCli];
  if (stages.includes('budget-filter')) parts.push('within budget');
  if (preferenceScore !== undefined) parts.push('preference ' + preferenceScore.toFixed(2));
  if (topsisScore !== undefined) parts.push('TOPSIS score ' + topsisScore.toFixed(2));
  if (ucbScore !== undefined) parts.push('UCB score ' + ucbScore.toFixed(2));
  return parts.join(', ');
}

/**
 * Filters CLI candidates based on preference tier.
 */
export function filterByPreferenceTier(candidates: CliName[], tier: 'strong' | 'weak'): CliName[] {
  // Strong models: claude (opus, sonnet)
  // Weak models: gemini (flash), codex
  const strongModels: CliName[] = ['claude'];
  const weakModels: CliName[] = ['gemini', 'codex'];

  const preferred = tier === 'strong' ? strongModels : weakModels;
  const filtered = candidates.filter((c) => preferred.includes(c));

  // Return filtered if any match, otherwise return all candidates
  return filtered.length > 0 ? filtered : candidates;
}
