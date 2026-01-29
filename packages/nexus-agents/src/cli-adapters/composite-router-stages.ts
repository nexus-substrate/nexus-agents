/**
 * CompositeRouter pipeline stage execution functions.
 * @module cli-adapters/composite-router-stages
 */
import type { Result } from '../core/index.js';
import { ok, err } from '../core/index.js';
import type { ILogger } from '../core/index.js';
import type { CliName, CliTask } from './types.js';
import type { BudgetRouter } from './budget-router.js';
import type { TopsisRouter } from './topsis-router.js';
import type { LinUCBBandit } from './linucb-bandit.js';
import type { PreferenceRouter } from './preference-router.js';
import type { ZeroRouter } from './zero-router.js';
import type { LatencyTracker } from './latency-tracker.js';
import type { IRoutingMemory } from '../context/routing-memory.js';
import { analyzeTask, type TaskProfile } from './task-analyzer.js';
import {
  CompositeRoutingError,
  type CompositeRouterConfig,
  type PipelineResult,
} from './composite-router-types.js';
import {
  cliTaskToTask,
  taskProfileToBanditContext,
  filterByPreferenceTier,
  applyBudgetFilter,
  applyTopsisRanking,
  applyZeroRouterFilter,
  defaultPreferenceStageResult,
  defaultZeroRouterStageResult,
  type PreferenceStageResult,
  type ZeroRouterStageResult,
} from './composite-router-helpers.js';

/** Dependencies required for pipeline stage execution. */
export interface StageDependencies {
  config: CompositeRouterConfig;
  logger: ILogger;
  cliNames: CliName[];
  budgetRouter: BudgetRouter | undefined;
  zeroRouter: ZeroRouter | undefined;
  preferenceRouter: PreferenceRouter | undefined;
  topsisRouter: TopsisRouter | undefined;
  linucbBandit: LinUCBBandit | undefined;
  latencyTracker: LatencyTracker | undefined;
  routingMemory: IRoutingMemory | undefined;
}

/** Result from budget stage including rejection tracking. */
export interface BudgetStageResult {
  candidates: CliName[];
  withinBudget: boolean | undefined;
  rejected: boolean;
}

/** Analyzes task and returns profile, updating stages array. */
export function analyzeTaskProfile(task: CliTask, stagesExecuted: string[]): TaskProfile {
  const internalTask = cliTaskToTask(task);
  const taskProfile = analyzeTask(internalTask);
  stagesExecuted.push('task-analysis');
  return taskProfile;
}

/** Runs budget filtering stage. */
export function runBudgetStage(
  task: CliTask,
  candidates: CliName[],
  stagesExecuted: string[],
  deps: StageDependencies
): Result<{ candidates: CliName[]; withinBudget: boolean | undefined }, CompositeRoutingError> {
  if (!deps.config.enableBudgetFilter || deps.budgetRouter === undefined) {
    return ok({ candidates, withinBudget: undefined });
  }
  const result = applyBudgetFilter(task, candidates, deps.budgetRouter, deps.config);
  stagesExecuted.push('budget-filter');
  if (result.eligible.length === 0) {
    return err(new CompositeRoutingError('No CLIs within budget', 'budget-filter'));
  }
  return ok({ candidates: result.eligible, withinBudget: result.withinBudget });
}

/** Runs ZeroRouter difficulty estimation stage. */
export function runZeroRouterStage(
  task: CliTask,
  candidates: CliName[],
  stagesExecuted: string[],
  deps: StageDependencies
): ZeroRouterStageResult {
  if (!deps.config.enableZeroRouter || deps.zeroRouter === undefined) {
    return defaultZeroRouterStageResult(candidates);
  }

  const result = applyZeroRouterFilter(task, candidates, deps.zeroRouter);
  stagesExecuted.push('zero-router');

  deps.logger.debug('ZeroRouter applied', {
    level: result.difficultyEstimate?.level,
    tier: result.difficultyTier,
    score: result.difficultyEstimate?.aggregateScore.toFixed(3),
    candidatesAfter: result.filteredCandidates.length,
  });

  return result;
}

/** Runs TOPSIS ranking stage. */
export function runTopsisStage(
  taskProfile: TaskProfile,
  candidates: CliName[],
  stagesExecuted: string[],
  deps: StageDependencies
): { ranking: CliName[]; score: number | undefined } {
  if (!deps.config.enableTopsisRanking || deps.topsisRouter === undefined) {
    return { ranking: candidates, score: undefined };
  }
  const result = applyTopsisRanking(taskProfile, candidates, deps.topsisRouter);
  stagesExecuted.push('topsis-ranking');
  return { ranking: result.ranking, score: result.topScore };
}

/** Runs LinUCB bandit selection stage. */
export function runLinUCBStage(
  taskProfile: TaskProfile,
  topsisRanking: CliName[],
  stagesExecuted: string[],
  deps: StageDependencies
): { selectedCli: CliName | undefined; ucbScore: number | undefined } {
  if (!deps.config.enableLinUCBSelection || deps.linucbBandit === undefined) {
    return { selectedCli: topsisRanking[0], ucbScore: undefined };
  }
  const banditContext = taskProfileToBanditContext(taskProfile);
  const selection = deps.linucbBandit.select(banditContext);
  stagesExecuted.push('linucb-selection');
  return { selectedCli: selection.armName as CliName, ucbScore: selection.ucbScore };
}

/** Runs preference routing stage. */
export function runPreferenceStage(
  task: CliTask,
  candidates: CliName[],
  stagesExecuted: string[],
  deps: StageDependencies
): PreferenceStageResult {
  if (!deps.config.enablePreferenceRouting || deps.preferenceRouter === undefined) {
    return defaultPreferenceStageResult(candidates);
  }
  if (!deps.preferenceRouter.hasMinimumData()) {
    deps.logger.debug('Preference routing skipped: insufficient data');
    return defaultPreferenceStageResult(candidates);
  }

  const decision = deps.preferenceRouter.route(task.content);
  stagesExecuted.push('preference-routing');
  const preferredCandidates = filterByPreferenceTier(candidates, decision.selectedTier);

  deps.logger.debug('Preference routing applied', {
    tier: decision.selectedTier,
    probability: decision.prediction.strongModelProbability,
    candidatesAfter: preferredCandidates.length,
  });

  return {
    preferenceScore: decision.prediction.strongModelProbability,
    preferenceTier: decision.selectedTier,
    preferredCandidates: preferredCandidates.length > 0 ? preferredCandidates : candidates,
  };
}

/** Latency scoring stage result. (Issue #361) */
export interface LatencyStageResult {
  latencyScore: number | undefined;
  latencyAdjustedRanking: CliName[];
}

/** Runs latency scoring stage. (Issue #361) */
export function runLatencyStage(
  candidates: CliName[],
  stagesExecuted: string[],
  deps: StageDependencies
): LatencyStageResult {
  if (!deps.config.enableLatencyTracking || deps.latencyTracker === undefined) {
    return { latencyScore: undefined, latencyAdjustedRanking: candidates };
  }

  const scores = deps.latencyTracker.getScores(candidates);
  stagesExecuted.push('latency-scoring');

  // Sort candidates by latency score (higher is better/faster)
  const sortedCandidates = [...candidates].sort((a, b) => {
    const scoreA = scores.find((s) => s.cli === a)?.score ?? 0;
    const scoreB = scores.find((s) => s.cli === b)?.score ?? 0;
    return scoreB - scoreA;
  });

  const topScore = scores.find((s) => s.cli === sortedCandidates[0])?.score;

  deps.logger.debug('Latency scoring applied', {
    scores: scores.map((s) => ({
      cli: s.cli,
      score: s.score.toFixed(3),
      reliable: s.hasReliableData,
    })),
    topCandidate: sortedCandidates[0],
  });

  return {
    latencyScore: topScore,
    latencyAdjustedRanking: sortedCandidates,
  };
}

/** Routing memory stage result. (Issue #489) */
export interface RoutingMemoryStageResult {
  recommendation: CliName | undefined;
  memoryConfidence: number | undefined;
}

/** Runs routing memory stage to get learned recommendation. (Issue #489) */
export function runRoutingMemoryStage(
  task: CliTask,
  candidates: CliName[],
  stagesExecuted: string[],
  deps: StageDependencies
): RoutingMemoryStageResult {
  if (!deps.config.enableRoutingMemory || deps.routingMemory === undefined) {
    return { recommendation: undefined, memoryConfidence: undefined };
  }

  const taskType = inferTaskTypeFromContent(task.content);
  const recommendation = deps.routingMemory.getRecommendation(taskType);
  stagesExecuted.push('routing-memory');

  if (recommendation !== undefined && candidates.includes(recommendation)) {
    deps.logger.debug('Routing memory recommendation', {
      taskType,
      recommended: recommendation,
      inCandidates: true,
    });
    return { recommendation, memoryConfidence: 0.8 };
  }

  deps.logger.debug('Routing memory: no recommendation or not in candidates', {
    taskType,
    recommended: recommendation,
    candidateCount: candidates.length,
  });
  return { recommendation: undefined, memoryConfidence: undefined };
}

/** Task type keywords mapping for routing memory. */
const TASK_TYPE_KEYWORDS: ReadonlyArray<readonly [string, ReadonlyArray<string>]> = [
  ['coding', ['code', 'implement']],
  ['review', ['review', 'audit']],
  ['testing', ['test', 'spec']],
  ['documentation', ['document', 'explain']],
  ['refactoring', ['refactor']],
  ['debugging', ['debug', 'fix']],
];

/** Infer task type from content for routing memory lookup. */
function inferTaskTypeFromContent(content: string): string {
  const lower = content.toLowerCase();
  for (const [taskType, keywords] of TASK_TYPE_KEYWORDS) {
    if (keywords.some((kw) => lower.includes(kw))) return taskType;
  }
  return 'general';
}

/** Executes full pipeline and returns result. */
export function runPipeline(
  task: CliTask,
  taskProfile: TaskProfile,
  stagesExecuted: string[],
  cliNames: CliName[],
  deps: StageDependencies
): Result<PipelineResult, CompositeRoutingError> {
  let candidates: CliName[] = [...cliNames];
  if (candidates.length === 0) {
    return err(new CompositeRoutingError('No CLI adapters available', 'initialization'));
  }

  // Step 1: Budget filtering
  const budgetResult = runBudgetStage(task, candidates, stagesExecuted, deps);
  if (!budgetResult.ok) return budgetResult;
  candidates = budgetResult.value.candidates;
  const withinBudget = budgetResult.value.withinBudget;

  // Step 2: Routing Memory (Issue #489) - check for learned recommendations
  const memoryResult = runRoutingMemoryStage(task, candidates, stagesExecuted, deps);

  // Step 3: ZeroRouter + Step 4: Preference + Step 5: Latency + Step 6: TOPSIS + Step 7: LinUCB
  const zeroResult = runZeroRouterStage(task, candidates, stagesExecuted, deps);
  candidates = zeroResult.filteredCandidates;

  const prefResult = runPreferenceStage(task, candidates, stagesExecuted, deps);
  candidates = prefResult.preferredCandidates;

  // Latency scoring stage (Issue #361)
  const latencyResult = runLatencyStage(candidates, stagesExecuted, deps);

  const topsisResult = runTopsisStage(taskProfile, candidates, stagesExecuted, deps);
  const linucbResult = runLinUCBStage(taskProfile, topsisResult.ranking, stagesExecuted, deps);
  if (linucbResult.selectedCli === undefined) {
    return err(new CompositeRoutingError('No candidates available', 'selection'));
  }

  // Use memory recommendation if available and high confidence (Issue #489)
  const selectedCli = selectWithMemoryInfluence(linucbResult.selectedCli, memoryResult, deps);

  return ok({
    candidates,
    withinBudget,
    difficultyEstimate: zeroResult.difficultyEstimate,
    difficultyTier: zeroResult.difficultyTier,
    preferenceScore: prefResult.preferenceScore,
    preferenceTier: prefResult.preferenceTier,
    topsisRanking: topsisResult.ranking,
    topsisScore: topsisResult.score,
    selectedCli,
    ucbScore: linucbResult.ucbScore,
    latencyScore: latencyResult.latencyScore,
    memoryRecommendation: memoryResult.recommendation,
    memoryConfidence: memoryResult.memoryConfidence,
  });
}

/** Select CLI with optional memory influence. (Issue #489) */
function selectWithMemoryInfluence(
  linucbSelection: CliName,
  memoryResult: RoutingMemoryStageResult,
  deps: StageDependencies
): CliName {
  // If routing memory has a high-confidence recommendation, use it
  if (memoryResult.recommendation !== undefined && memoryResult.memoryConfidence !== undefined) {
    const confidenceThreshold = 0.7;
    if (memoryResult.memoryConfidence >= confidenceThreshold) {
      deps.logger.debug('Using routing memory recommendation', {
        memoryChoice: memoryResult.recommendation,
        linucbChoice: linucbSelection,
        confidence: memoryResult.memoryConfidence,
      });
      return memoryResult.recommendation;
    }
  }
  return linucbSelection;
}
