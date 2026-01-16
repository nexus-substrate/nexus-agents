/**
 * nexus-agents/cli-adapters - CompositeRouter Helper Functions
 *
 * Pure helper functions extracted from CompositeRouter to reduce file size.
 *
 * @module cli-adapters/composite-router-helpers
 * (Source: Issue #275, Epic #164)
 */

import type { Task } from '../core/types/agent.js';
import type { CliName, CliTask, BudgetConstraint } from './types.js';
import type { BanditContext } from './budget-router-types.js';
import type { TopsisModelProfile, TopsisResult } from './topsis-types.js';
import { DEFAULT_MODEL_PROFILES } from './topsis-types.js';
import type { TaskProfile } from './task-analyzer.js';
import type { BudgetRouter } from './budget-router.js';
import type { TopsisRouter } from './topsis-router.js';
import type { CompositeRouterConfig } from './composite-router-types.js';

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

/**
 * Converts a CliTask to internal Task format.
 */
export function cliTaskToTask(cliTask: CliTask): Task {
  return { id: 'task-' + String(Date.now()), description: cliTask.content, context: {} };
}

/**
 * Budget filter result.
 */
export interface BudgetFilterResult {
  eligible: CliName[];
  withinBudget: boolean;
}

/**
 * Applies budget filtering to candidate CLIs.
 */
export function applyBudgetFilter(
  task: CliTask,
  candidates: CliName[],
  budgetRouter: BudgetRouter | undefined,
  config: CompositeRouterConfig
): BudgetFilterResult {
  if (budgetRouter === undefined) {
    return { eligible: candidates, withinBudget: true };
  }

  const rawConstraints = config.budgetConstraints;
  const constraint: BudgetConstraint = {};
  if (rawConstraints?.maxTokens !== undefined) {
    (constraint as { maxTokens: number }).maxTokens = rawConstraints.maxTokens;
  }
  if (rawConstraints?.maxCostUsd !== undefined) {
    (constraint as { maxCostUsd: number }).maxCostUsd = rawConstraints.maxCostUsd;
  }
  if (rawConstraints?.maxLatencyMs !== undefined) {
    (constraint as { maxLatencyMs: number }).maxLatencyMs = rawConstraints.maxLatencyMs;
  }

  const result = budgetRouter.checkBudget(task, constraint);
  return { eligible: result.withinBudget ? candidates : [], withinBudget: result.withinBudget };
}

/**
 * TOPSIS ranking result.
 */
export interface TopsisRankingResult {
  ranking: CliName[];
  topScore: number;
}

/**
 * Applies TOPSIS ranking to candidate CLIs.
 */
export function applyTopsisRanking(
  taskProfile: TaskProfile,
  candidates: CliName[],
  topsisRouter: TopsisRouter | undefined
): TopsisRankingResult {
  if (topsisRouter === undefined) {
    return { ranking: candidates, topScore: 1.0 };
  }

  const profiles = DEFAULT_MODEL_PROFILES.filter((p) => candidates.includes(p.cliName));
  const adjustedProfiles = profiles.map((p) => adjustProfileForTask(p, taskProfile));
  const result: TopsisResult = topsisRouter.selectModel({ profiles: adjustedProfiles });

  const scoreMap = new Map(result.scores.map((s) => [s.cliName, s.closenessScore]));
  const ranking = [...candidates].sort((a, b) => (scoreMap.get(b) ?? 0) - (scoreMap.get(a) ?? 0));
  return { ranking, topScore: scoreMap.get(ranking[0] ?? 'claude') ?? 1.0 };
}

/**
 * Preference stage result.
 */
export interface PreferenceStageResult {
  preferenceScore: number | undefined;
  preferenceTier: 'strong' | 'weak' | undefined;
  preferredCandidates: CliName[];
}

/**
 * Default preference stage result when preference routing is disabled.
 */
export function defaultPreferenceStageResult(candidates: CliName[]): PreferenceStageResult {
  return {
    preferenceScore: undefined,
    preferenceTier: undefined,
    preferredCandidates: candidates,
  };
}

/**
 * Creates the routing decision result object.
 */
export interface BuildDecisionContext {
  selectedCli: CliName;
  candidates: CliName[];
  topsisRanking: CliName[];
  stagesExecuted: string[];
  decisionTimeMs: number;
  withinBudget: boolean | undefined;
  preferenceScore: number | undefined;
  preferenceTier: 'strong' | 'weak' | undefined;
  topsisScore: number | undefined;
  ucbScore: number | undefined;
  taskProfile: TaskProfile;
}

/**
 * Builds the routing decision fields (excluding adapter which requires Map lookup).
 */
export function buildDecisionFields(ctx: BuildDecisionContext): {
  confidence: number;
  reason: string;
  alternatives: CliName[];
} {
  const confidence = calculateConfidence(ctx.topsisScore, ctx.ucbScore, ctx.candidates.length);
  const reason = buildReason(
    ctx.selectedCli,
    ctx.stagesExecuted,
    ctx.topsisScore,
    ctx.ucbScore,
    ctx.preferenceScore
  );
  const alternatives = ctx.topsisRanking.filter((c) => c !== ctx.selectedCli);
  return { confidence, reason, alternatives };
}
