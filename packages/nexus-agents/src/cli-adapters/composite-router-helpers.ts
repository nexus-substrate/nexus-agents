/**
 * nexus-agents/cli-adapters - CompositeRouter Helper Functions
 *
 * Pure helper functions extracted from CompositeRouter to reduce file size.
 *
 * @module cli-adapters/composite-router-helpers
 * (Source: Issue #275, Epic #164, Issue #347)
 */

import type { Task } from '../core/types/agent.js';
import { getTimeProvider, type TaskProfile } from '../core/index.js';
import type { CliName, CliTask, BudgetConstraint } from './types.js';
import type { BanditContext } from './budget-router-types.js';
import type { TopsisModelProfile, TopsisResult } from './topsis-types.js';
import {
  DEFAULT_MODEL_PROFILES,
  DEFAULT_TOPSIS_CRITERIA,
  PLAN_BILLING_TOPSIS_CRITERIA,
  getCriteriaForTaskCategory,
} from './topsis-types.js';
import type { BillingMode } from '../mcp/tools/delegate-to-model-types.js';
import type { BudgetRouter } from './budget-router.js';
import { TopsisRouter } from './topsis-router.js';
import type { CompositeRouterConfig } from './composite-router-types.js';
import type { IZeroRouter } from './zero-router.js';
import type { DifficultyEstimate, DifficultyOutcome, ModelTier } from './zero-router-types.js';
import { hashTaskContent } from './zero-router-calibration.js';

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
    isCodeTask: profile.codeGeneration ? 1 : 0,
    isReasoningTask: profile.taskType === 'architecture' || profile.reasoningComplexity > 5 ? 1 : 0,
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
 * Options for building routing reason.
 */
export interface BuildReasonOptions {
  selectedCli: CliName;
  stages: string[];
  topsisScore?: number;
  ucbScore?: number;
  preferenceScore?: number;
  difficultyTier?: ModelTier;
  difficultyScore?: number;
}

/**
 * Builds a human-readable routing reason.
 */
export function buildReason(options: BuildReasonOptions): string {
  const { selectedCli, stages, topsisScore, ucbScore, preferenceScore, difficultyTier } = options;
  const difficultyScore = options.difficultyScore;
  const parts: string[] = ['Selected ' + selectedCli];
  if (stages.includes('budget-filter')) parts.push('within budget');
  if (difficultyTier !== undefined && difficultyScore !== undefined) {
    parts.push('difficulty ' + difficultyTier + ' (' + difficultyScore.toFixed(2) + ')');
  }
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
  return {
    id: 'task-' + String(getTimeProvider().now()),
    description: cliTask.content,
    context: {},
  };
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
  /** Number of candidates within the tolerance band of the top score. */
  toleranceBandSize?: number;
}

/**
 * Tolerance band percentage for TOPSIS scoring.
 * Candidates within this % of the top score are considered quality-equivalent.
 * Among equivalent candidates, the original ranking is preserved (TOPSIS tiebreak).
 * This prevents over-concentration on a single CLI and improves diversity.
 * (Source: Issue #1401 — tolerance-routing technique)
 */
export const TOPSIS_TOLERANCE_BAND_PERCENT = 0.05;

/** Returns a TopsisRouter with task-category-aware criteria (#1491).
 * Only creates a new router when the criteria differ from the billing-mode default. */
function selectTopsisRouter(
  router: TopsisRouter,
  billingMode: BillingMode,
  taskType?: string
): TopsisRouter {
  if (taskType !== undefined) {
    const mode = billingMode === 'plan' ? 'plan' : 'api';
    const criteria = getCriteriaForTaskCategory(taskType, mode);
    const defaultCriteria =
      mode === 'plan' ? PLAN_BILLING_TOPSIS_CRITERIA : DEFAULT_TOPSIS_CRITERIA;
    // Only create a new router when category criteria differ from default
    if (criteria !== defaultCriteria) {
      return new TopsisRouter({ criteria });
    }
  }
  if (billingMode === 'plan') {
    return new TopsisRouter({ criteria: PLAN_BILLING_TOPSIS_CRITERIA });
  }
  return router;
}

/** Max quality boost from stage scores: +15%. */
const STAGE_SCORE_MAX_BOOST = 0.15;

/** Max quality penalty from stage scores: -10%. */
const STAGE_SCORE_MAX_PENALTY = 0.1;

/**
 * Adjusts TOPSIS model profiles based on aggregated stage scores.
 * CLIs with above-average stage affinity get quality boosted (up to +15%),
 * below-average get quality reduced (down to -10%). (#1354)
 */
export function adjustProfileWithStageScores(
  profiles: readonly TopsisModelProfile[],
  stageScores: ReadonlyMap<CliName, number>
): TopsisModelProfile[] {
  if (stageScores.size === 0) return [...profiles];

  // Calculate the mean score across all CLIs that have scores
  const scoreValues = [...stageScores.values()];
  const mean = scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length;
  // Range for normalization: max deviation from mean
  const maxDev = Math.max(
    ...scoreValues.map((v) => Math.abs(v - mean)),
    0.001 // prevent division by zero
  );

  return profiles.map((p) => {
    const score = stageScores.get(p.cliName);
    if (score === undefined) return p;

    const deviation = score - mean;
    // Normalize to [-1, 1] range
    const normalized = deviation / maxDev;
    // Map to boost/penalty: positive → boost, negative → penalty
    const multiplier =
      normalized >= 0
        ? 1 + normalized * STAGE_SCORE_MAX_BOOST
        : 1 + normalized * STAGE_SCORE_MAX_PENALTY;
    const adjustedQuality = Math.min(p.qualityScore * multiplier, 10);

    return { ...p, qualityScore: adjustedQuality };
  });
}

/**
 * Applies TOPSIS ranking to candidate CLIs.
 * Uses task-category-aware criteria weights when taskProfile.taskType is available (#1491).
 * When stageScores are provided, adjusts quality profiles before evaluation. (#1354)
 */
export function applyTopsisRanking(
  taskProfile: TaskProfile,
  candidates: CliName[],
  topsisRouter: TopsisRouter | undefined,
  billingMode: BillingMode = 'api',
  stageScores?: ReadonlyMap<CliName, number>
): TopsisRankingResult {
  if (topsisRouter === undefined) {
    return { ranking: candidates, topScore: 1.0 };
  }

  const router = selectTopsisRouter(topsisRouter, billingMode, taskProfile.taskType);
  const profiles = DEFAULT_MODEL_PROFILES.filter((p) => candidates.includes(p.cliName));
  let adjustedProfiles = profiles.map((p) => adjustProfileForTask(p, taskProfile));
  if (stageScores !== undefined && stageScores.size > 0) {
    adjustedProfiles = adjustProfileWithStageScores(adjustedProfiles, stageScores);
  }
  const result: TopsisResult = router.selectModel({ profiles: adjustedProfiles });

  const scoreMap = new Map(result.scores.map((s) => [s.cliName, s.closenessScore]));
  const ranking = [...candidates].sort((a, b) => (scoreMap.get(b) ?? 0) - (scoreMap.get(a) ?? 0));
  const topScore = scoreMap.get(ranking[0] ?? 'claude') ?? 1.0;

  // Tolerance band: count how many candidates are within TOLERANCE_BAND_PERCENT of top
  const threshold = topScore * (1 - TOPSIS_TOLERANCE_BAND_PERCENT);
  const toleranceBandSize = ranking.filter((c) => (scoreMap.get(c) ?? 0) >= threshold).length;

  return { ranking, topScore, toleranceBandSize };
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
 * ZeroRouter stage result.
 */
export interface ZeroRouterStageResult {
  difficultyEstimate: DifficultyEstimate | undefined;
  difficultyTier: ModelTier | undefined;
  filteredCandidates: CliName[];
}

/**
 * Default ZeroRouter stage result when ZeroRouter is disabled.
 */
export function defaultZeroRouterStageResult(candidates: CliName[]): ZeroRouterStageResult {
  return {
    difficultyEstimate: undefined,
    difficultyTier: undefined,
    filteredCandidates: candidates,
  };
}

/**
 * Maps model tier to preferred CLI order.
 * Fast tier prefers gemini/codex, Powerful tier prefers claude.
 */
export function filterByDifficultyTier(candidates: CliName[], tier: ModelTier): CliName[] {
  // Tier mappings aligned with ZeroRouter DEFAULT_TIER_TO_CLIS
  const tierPreferences: Record<ModelTier, CliName[]> = {
    fast: ['gemini', 'codex', 'claude'],
    balanced: ['codex', 'gemini', 'claude'],
    powerful: ['claude', 'codex', 'gemini'],
  };

  const preferred = tierPreferences[tier];
  // Sort candidates by tier preference order
  const sortedCandidates = [...candidates].sort((a, b) => {
    const aIndex = preferred.indexOf(a);
    const bIndex = preferred.indexOf(b);
    // If not in preference list, put at end
    const aPos = aIndex === -1 ? preferred.length : aIndex;
    const bPos = bIndex === -1 ? preferred.length : bIndex;
    return aPos - bPos;
  });

  return sortedCandidates;
}

/**
 * Applies ZeroRouter difficulty-based filtering to candidate CLIs.
 */
export function applyZeroRouterFilter(
  task: CliTask,
  candidates: CliName[],
  zeroRouter: IZeroRouter | undefined
): ZeroRouterStageResult {
  if (zeroRouter === undefined || candidates.length === 0) {
    return defaultZeroRouterStageResult(candidates);
  }

  const decision = zeroRouter.routeByDifficulty(task, candidates);
  const difficultyEstimate = decision.difficulty;
  const difficultyTier = decision.tier;

  // Sort candidates by tier preference
  const filteredCandidates = filterByDifficultyTier(candidates, difficultyTier);

  return {
    difficultyEstimate,
    difficultyTier,
    filteredCandidates,
  };
}

/**
 * Builds a DifficultyOutcome object for calibration.
 */
export function buildDifficultyOutcome(
  taskContent: string,
  difficulty: number,
  selectedCli: CliName,
  success: boolean,
  qualityScore?: number
): DifficultyOutcome {
  const base = {
    taskHash: hashTaskContent(taskContent),
    estimatedDifficulty: difficulty,
    selectedCli,
    success,
    timestamp: getTimeProvider().now(),
  };
  return qualityScore !== undefined ? { ...base, qualityScore } : base;
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
  difficultyEstimate: DifficultyEstimate | undefined;
  difficultyTier: ModelTier | undefined;
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
  const reason = buildReason({
    selectedCli: ctx.selectedCli,
    stages: ctx.stagesExecuted,
    ...(ctx.topsisScore !== undefined ? { topsisScore: ctx.topsisScore } : {}),
    ...(ctx.ucbScore !== undefined ? { ucbScore: ctx.ucbScore } : {}),
    ...(ctx.preferenceScore !== undefined ? { preferenceScore: ctx.preferenceScore } : {}),
    ...(ctx.difficultyTier !== undefined ? { difficultyTier: ctx.difficultyTier } : {}),
    ...(ctx.difficultyEstimate?.aggregateScore !== undefined
      ? { difficultyScore: ctx.difficultyEstimate.aggregateScore }
      : {}),
  });
  const alternatives = ctx.topsisRanking.filter((c) => c !== ctx.selectedCli);
  return { confidence, reason, alternatives };
}

/**
 * Builds preference stats for CompositeRouter stats output.
 */
export function buildPreferenceStats(
  enablePreferenceRouting: boolean,
  preferenceRouter:
    | {
        getStats: () => { totalDataPoints: number; strongModelPreferenceRate: number };
        hasMinimumData: () => boolean;
      }
    | undefined
):
  | {
      enabled: boolean;
      hasSufficientData: boolean;
      dataPointCount: number;
      strongModelPreferenceRate: number;
    }
  | undefined {
  if (!enablePreferenceRouting || preferenceRouter === undefined) {
    return undefined;
  }
  const stats = preferenceRouter.getStats();
  return {
    enabled: true,
    hasSufficientData: preferenceRouter.hasMinimumData(),
    dataPointCount: stats.totalDataPoints,
    strongModelPreferenceRate: stats.strongModelPreferenceRate,
  };
}

// ---------------------------------------------------------------------------
// Capacity-Aware Load Balancing (Issue #807)
// ---------------------------------------------------------------------------

import type { CapacityStatus, ICliAdapter } from './types.js';

/**
 * Fetches capacity status from all adapters.
 * Returns a map of CLI name to capacity status.
 */
export async function fetchCapacityData(
  adapters: Map<CliName, ICliAdapter>
): Promise<Map<CliName, CapacityStatus>> {
  const result = new Map<CliName, CapacityStatus>();
  const entries = [...adapters];
  const settled = await Promise.allSettled(entries.map(([, a]) => a.getCapacity()));
  for (const [idx, entry] of entries.entries()) {
    const outcome = settled[idx];
    if (outcome?.status === 'fulfilled') {
      result.set(entry[0], outcome.value);
    }
  }
  return result;
}
