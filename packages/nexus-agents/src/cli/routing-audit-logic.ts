/**
 * Routing Audit Logic
 *
 * Core routing audit functions for analyzing task routing decisions.
 *
 * @module cli/routing-audit-logic
 * (Source: Issue #170, Alignment Roadmap Phase 1)
 */

import { createLogger, getTimeProvider } from '../core/index.js';
import type { CliName } from '../cli-adapters/types.js';
import { TopsisRouter } from '../cli-adapters/topsis-router.js';
import type { TopsisResult } from '../cli-adapters/topsis-types.js';
import { DEFAULT_MODEL_PROFILES } from '../cli-adapters/topsis-types.js';
import { LinUCBBandit } from '../cli-adapters/linucb-bandit.js';
import type { BanditContext } from '../cli-adapters/budget-router-types.js';
import { analyzeTask, type TaskProfile } from '../cli-adapters/task-analyzer.js';
import type { Task } from '../core/types/agent.js';
import type {
  RoutingAuditOptions,
  RoutingAuditResult,
  BudgetFilterResult,
  LinUCBArmDetail,
  BanditStats,
  DetailedArmStats,
} from './routing-audit-types.js';

const logger = createLogger({ component: 'routing-audit' });

// =============================================================================
// Constants
// =============================================================================

const CLI_NAMES: readonly CliName[] = ['claude', 'gemini', 'codex'];

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Analyzes a task string and returns its profile.
 */
export function analyzeTaskString(taskStr: string): TaskProfile {
  const task: Task = {
    id: 'audit-' + String(getTimeProvider().now()),
    description: taskStr,
    context: {},
  };
  return analyzeTask(task);
}

/**
 * Converts task profile to bandit context.
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
 * Simulates budget filtering (all pass by default).
 */
export function simulateBudgetFilter(): readonly BudgetFilterResult[] {
  return CLI_NAMES.map((cliName) => ({
    cliName,
    withinBudget: true,
    reason: 'within budget',
  }));
}

/**
 * Runs TOPSIS ranking on the CLI options.
 */
export function runTopsisRanking(taskProfile: TaskProfile): TopsisResult {
  const router = new TopsisRouter();

  // Adjust profiles based on task type
  const adjustedProfiles = DEFAULT_MODEL_PROFILES.map((p) => {
    if (taskProfile.taskType === 'architecture' || taskProfile.reasoningComplexity > 7) {
      return { ...p, qualityScore: Math.min(p.qualityScore * 1.2, 10) };
    }
    if (taskProfile.taskType === 'bulk_operations' || taskProfile.contextRequired < 1000) {
      return { ...p, averageLatencyMs: p.averageLatencyMs * 0.8 };
    }
    return p;
  });

  return router.selectModel({
    profiles: adjustedProfiles,
    expectedInputTokens: taskProfile.contextRequired,
    expectedOutputTokens: Math.round(taskProfile.contextRequired * 0.3),
  });
}

/**
 * Computes UCB scores for all arms.
 */
export function computeLinUCBDetails(
  bandit: LinUCBBandit,
  context: BanditContext
): readonly LinUCBArmDetail[] {
  const stats = bandit.getStats();
  const selection = bandit.select(context);

  const avgRewards = stats.map((s) => s.avgReward);
  const maxAvgReward = Math.max(...avgRewards, 0);

  return stats.map((stat) => {
    const isSelected = stat.name === selection.armName;
    // Estimate if this is exploration: selected despite lower avg reward
    const isExploration = isSelected && stat.avgReward < maxAvgReward * 0.9;

    return {
      cliName: stat.name as CliName,
      ucbScore: isSelected ? selection.ucbScore : stat.avgReward + 1.0,
      pullCount: stat.pullCount,
      avgReward: stat.avgReward,
      isExploration: isExploration && isSelected,
    };
  });
}

/**
 * Computes detailed bandit statistics for ML observability.
 */
export function computeBanditStats(bandit: LinUCBBandit): BanditStats {
  const detailedStats = bandit.getDetailedStats();
  const explorationStats = bandit.getExplorationStats();

  const detailedArms: DetailedArmStats[] = detailedStats.map((s) => ({
    cliName: s.name as CliName,
    pullCount: s.pullCount,
    avgReward: s.avgReward,
    cumulativeReward: s.cumulativeReward,
    learnedWeights: s.learnedWeights,
    featureImportance: s.featureImportance,
  }));

  return {
    detailedArms,
    exploration: explorationStats,
  };
}

// =============================================================================
// Selection Logic Helpers
// =============================================================================

/**
 * Determines the final CLI selection based on mode.
 */
function determineSelectedCli(
  deterministic: boolean | undefined,
  topsisSelectedModel: CliName,
  banditArmName: string
): CliName {
  return deterministic === true ? topsisSelectedModel : (banditArmName as CliName);
}

/**
 * Determines the selection reason based on mode and exploration state.
 */
function determineSelectionReason(
  deterministic: boolean | undefined,
  isExploration: boolean
): string {
  if (deterministic === true) {
    return 'TOPSIS rank #1 (deterministic mode)';
  }
  if (isExploration) {
    return 'LinUCB exploration (high uncertainty)';
  }
  return 'LinUCB exploitation (best expected reward)';
}

// =============================================================================
// Main Audit Function
// =============================================================================

/**
 * Performs a complete routing audit.
 */
export function auditRouting(options: RoutingAuditOptions): RoutingAuditResult {
  const { task, deterministic, banditStats: includeBanditStats } = options;
  logger.debug('Starting routing audit', { task: task.slice(0, 50) });

  // Step 1: Analyze task
  const taskProfile = analyzeTaskString(task);

  // Step 2: Budget filtering (simulated)
  const budgetResults = simulateBudgetFilter();
  const eligibleClis = budgetResults.filter((r) => r.withinBudget).map((r) => r.cliName);

  // Step 3: TOPSIS ranking
  const topsisResult = runTopsisRanking(taskProfile);

  // Step 4: LinUCB selection
  const bandit = new LinUCBBandit(eligibleClis);
  const context = taskProfileToBanditContext(taskProfile);
  const linucbDetails = computeLinUCBDetails(bandit, context);
  const selection = bandit.select(context);

  // Step 5: Determine final selection
  const selectedCli = determineSelectedCli(
    deterministic,
    topsisResult.selectedModel,
    selection.armName
  );
  const selectedArmDetail = linucbDetails.find((d) => d.cliName === selectedCli);
  const isExploration = selectedArmDetail?.isExploration === true;
  const selectionReason = determineSelectionReason(deterministic, isExploration);

  // Step 6: Build result
  const baseResult = {
    task,
    taskProfile,
    budgetResults,
    topsisResult,
    linucbDetails,
    selectedCli,
    selectionReason,
    isExploration,
  };

  return includeBanditStats === true
    ? { ...baseResult, banditStats: computeBanditStats(bandit) }
    : baseResult;
}
