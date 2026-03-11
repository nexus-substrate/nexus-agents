/* eslint-disable max-lines */
/**
 * CompositeRouter pipeline stage execution functions.
 * @module cli-adapters/composite-router-stages
 */
import type { Result } from '../core/index.js';
import { ok, err } from '../core/index.js';
import type { ILogger } from '../core/index.js';
import {
  createSharedTaskAnalyzer,
  taskAnalysisResultToTaskProfile,
  type TaskProfile,
} from '../core/index.js';
import type { CliName, CliTask } from './types.js';
import type { BudgetRouter } from './budget-router.js';
import type { TopsisRouter } from './topsis-router.js';
import type { LinUCBBandit } from './linucb-bandit.js';
import type { PreferenceRouter } from './preference-router.js';
import type { ZeroRouter } from './zero-router.js';
import type { LatencyTracker } from './latency-tracker.js';
import type { IRoutingMemory } from '../context/routing-memory.js';
import {
  CompositeRoutingError,
  type CompositeRouterConfigWithPreference,
  type PipelineResult,
} from './composite-router-types.js';
import {
  ConfidenceCascadeStage,
  CapabilityMatchStage,
  QualityConstraintStage,
  ResourceStrategyStage,
  DistilledRuleStage,
  KnnRoutingStage,
} from './routing/stages/index.js';
import { createRoutingContext, getRemainingCandidates } from './routing/router-stage.js';
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
  type PerformanceFloorEntry,
} from './composite-router-helpers.js';
import { getWeatherBonusScores } from './weather-bonus-stage.js';
import { detectTaskCategory } from '../config/task-specialization.js';
import { getOutcomeStore } from '../orchestration/outcomes/outcome-store.js';

/** Module-level singleton — SharedTaskAnalyzer is stateless, no need to re-instantiate per call. */
const sharedAnalyzer = createSharedTaskAnalyzer();

/** Dependencies required for pipeline stage execution. */
export interface StageDependencies {
  config: CompositeRouterConfigWithPreference;
  logger: ILogger;
  cliNames: CliName[];
  budgetRouter: BudgetRouter | undefined;
  zeroRouter: ZeroRouter | undefined;
  preferenceRouter: PreferenceRouter | undefined;
  topsisRouter: TopsisRouter | undefined;
  linucbBandit: LinUCBBandit | undefined;
  latencyTracker: LatencyTracker | undefined;
  routingMemory: IRoutingMemory | undefined;
  /** Confidence cascade stage instance (Issue #755) */
  confidenceCascadeStage: ConfidenceCascadeStage | undefined;
  /** Capability match stage instance (Issue #755) */
  capabilityMatchStage: CapabilityMatchStage | undefined;
  /** Quality constraint stage instance (Issue #755) */
  qualityConstraintStage: QualityConstraintStage | undefined;
  /** Resource strategy stage instance (Issue #998) */
  resourceStrategyStage: ResourceStrategyStage | undefined;
  /** Distilled rule stage instance (Issue #999) */
  distilledRuleStage: DistilledRuleStage | undefined;
  /** KNN routing stage instance (arXiv:2507.05370) */
  knnRoutingStage: KnnRoutingStage | undefined;
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
  const analysis = sharedAnalyzer.analyze(internalTask);
  stagesExecuted.push('task-analysis');
  return taskAnalysisResultToTaskProfile(analysis);
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

/** Default complexity when no signal is available. */
const DEFAULT_COMPLEXITY: ConfidenceCascadeStageResult['complexity'] = 'moderate';

/** Extract complexity level from confidence cascade signals. */
function extractComplexityFromSignals(
  signals: readonly string[]
): 'simple' | 'moderate' | 'complex' {
  for (const s of signals) {
    if (s === 'confidence:complexity-simple') return 'simple';
    if (s === 'confidence:complexity-complex') return 'complex';
    if (s === 'confidence:complexity-moderate') return 'moderate';
  }
  return DEFAULT_COMPLEXITY;
}

/** Extract task type from capability match signals. */
function extractTaskTypeFromSignals(signals: readonly string[]): string {
  for (const s of signals) {
    if (s.startsWith('capability:task-')) return s.slice('capability:task-'.length);
  }
  return 'general';
}

/** Extract best CLI from signals with a given prefix. */
function extractBestCliFromSignals(
  signals: readonly string[],
  prefix: string
): CliName | undefined {
  for (const s of signals) {
    if (s.startsWith(prefix)) return s.slice(prefix.length) as CliName;
  }
  return undefined;
}

/** Extract resource tier from signals. */
function extractTierFromSignals(signals: readonly string[]): string {
  for (const s of signals) {
    if (s.startsWith('resource-strategy:tier=')) return s.slice('resource-strategy:tier='.length);
  }
  return 'balanced';
}

/** Count applied rules from distilled-rule signals. */
function countAppliedRulesFromSignals(signals: readonly string[]): number {
  let count = 0;
  for (const s of signals) {
    if (s.startsWith('distilled-rule:applied=')) count++;
  }
  return count;
}

/** Confidence cascade stage result. (Issue #755) */
export interface ConfidenceCascadeStageResult {
  scores: Map<CliName, number>;
  complexity: 'simple' | 'moderate' | 'complex';
  shouldEscalate: boolean;
}

/** Default confidence cascade result. */
const DEFAULT_CASCADE_RESULT: ConfidenceCascadeStageResult = {
  scores: new Map(),
  complexity: DEFAULT_COMPLEXITY,
  shouldEscalate: false,
};

/** Runs confidence cascade stage. (Issue #755, #1350) */
export async function runConfidenceCascadeStage(
  task: CliTask,
  candidates: CliName[],
  stagesExecuted: string[],
  deps: StageDependencies
): Promise<ConfidenceCascadeStageResult> {
  if (!deps.config.enableConfidenceCascade || deps.confidenceCascadeStage === undefined) {
    return DEFAULT_CASCADE_RESULT;
  }

  const ctx = createRoutingContext(task.content, candidates);
  const result = await deps.confidenceCascadeStage.route(ctx);
  stagesExecuted.push('confidence-cascade');

  if (!result.ok) {
    deps.logger.debug('Confidence cascade stage failed', { error: result.error.message });
    return DEFAULT_CASCADE_RESULT;
  }

  const { signals, scores } = result.value.context;
  const complexity = extractComplexityFromSignals(signals);
  const shouldEscalate = signals.includes('confidence:should-escalate');

  deps.logger.debug('Confidence cascade completed', {
    complexity,
    shouldEscalate,
    scoreCount: scores.size,
  });

  return { scores: new Map(scores), complexity, shouldEscalate };
}

/** Capability match stage result. (Issue #755) */
export interface CapabilityMatchStageResult {
  scores: Map<CliName, number>;
  taskType: string;
  bestCli: CliName | undefined;
}

/** Default capability match result. */
const DEFAULT_CAPABILITY_RESULT: CapabilityMatchStageResult = {
  scores: new Map(),
  taskType: 'general',
  bestCli: undefined,
};

/** Runs capability match stage. (Issue #755, #1350) */
export async function runCapabilityMatchStage(
  task: CliTask,
  candidates: CliName[],
  stagesExecuted: string[],
  deps: StageDependencies
): Promise<CapabilityMatchStageResult> {
  if (!deps.config.enableCapabilityMatch || deps.capabilityMatchStage === undefined) {
    return DEFAULT_CAPABILITY_RESULT;
  }

  const ctx = createRoutingContext(task.content, candidates);
  const result = await deps.capabilityMatchStage.route(ctx);
  stagesExecuted.push('capability-match');

  if (!result.ok) {
    deps.logger.debug('Capability match stage failed', { error: result.error.message });
    return DEFAULT_CAPABILITY_RESULT;
  }

  const { signals, scores } = result.value.context;
  const taskType = extractTaskTypeFromSignals(signals);
  const bestCli = extractBestCliFromSignals(signals, 'capability:best-');

  deps.logger.debug('Capability match completed', {
    taskType,
    bestCli,
    scoreCount: scores.size,
  });

  return { scores: new Map(scores), taskType, bestCli };
}

/** Quality constraint stage result. (Issue #755) */
export interface QualityConstraintStageResult {
  eligible: CliName[];
  filtered: Map<CliName, string>;
  usedFallback: boolean;
}

/** Runs quality constraint stage. (Issue #755, #1350) */
export async function runQualityConstraintStage(
  candidates: CliName[],
  stagesExecuted: string[],
  deps: StageDependencies
): Promise<QualityConstraintStageResult> {
  if (!deps.config.enableQualityConstraint || deps.qualityConstraintStage === undefined) {
    return { eligible: candidates, filtered: new Map(), usedFallback: false };
  }

  const ctx = createRoutingContext('', candidates);
  const result = await deps.qualityConstraintStage.route(ctx);
  stagesExecuted.push('quality-constraint');

  if (!result.ok) {
    deps.logger.debug('Quality constraint stage failed', { error: result.error.message });
    return { eligible: candidates, filtered: new Map(), usedFallback: false };
  }

  const remaining = getRemainingCandidates(result.value.context);
  const filtered = new Map(result.value.context.filtered);
  const usedFallback = result.value.context.signals.includes('quality:used-fallback');

  deps.logger.debug('Quality constraint completed', {
    eligible: remaining.length,
    filtered: filtered.size,
    usedFallback,
  });

  // If all candidates filtered, fall back to original set
  const eligible = remaining.length > 0 ? remaining : candidates;
  return { eligible, filtered, usedFallback: remaining.length === 0 || usedFallback };
}

/** Resource strategy stage result. (Issue #998) */
export interface ResourceStrategyStageResult {
  scores: Map<CliName, number>;
  tier: string;
  resourceLevel: number | undefined;
}

/** Default resource strategy result. */
const DEFAULT_RESOURCE_RESULT: ResourceStrategyStageResult = {
  scores: new Map(),
  tier: 'balanced',
  resourceLevel: undefined,
};

/** Runs resource strategy stage. (Issue #998, #1350) */
export async function runResourceStrategyStage(
  task: CliTask,
  candidates: CliName[],
  stagesExecuted: string[],
  deps: StageDependencies
): Promise<ResourceStrategyStageResult> {
  if (!deps.config.enableResourceStrategy || deps.resourceStrategyStage === undefined) {
    return DEFAULT_RESOURCE_RESULT;
  }

  const ctx = createRoutingContext(task.content, candidates);
  const result = await deps.resourceStrategyStage.route(ctx);
  stagesExecuted.push('resource-strategy');

  if (!result.ok) {
    deps.logger.debug('Resource strategy stage failed', { error: result.error.message });
    return DEFAULT_RESOURCE_RESULT;
  }

  const { signals, scores } = result.value.context;
  const tier = extractTierFromSignals(signals);

  deps.logger.debug('Resource strategy completed', { tier, scoreCount: scores.size });

  return { scores: new Map(scores), tier, resourceLevel: undefined };
}

/** Distilled rule stage result. (Issue #999) */
export interface DistilledRuleStageResult {
  scores: Map<CliName, number>;
  rulesApplied: number;
}

/** Runs distilled rule stage. (Issue #999, #1350) */
export async function runDistilledRuleStage(
  task: CliTask,
  candidates: CliName[],
  stagesExecuted: string[],
  deps: StageDependencies
): Promise<DistilledRuleStageResult> {
  if (!deps.config.enableStrategyDistillation || deps.distilledRuleStage === undefined) {
    return { scores: new Map(), rulesApplied: 0 };
  }

  const ctx = createRoutingContext(task.content, candidates);
  const result = await deps.distilledRuleStage.route(ctx);
  stagesExecuted.push('distilled-rule');

  if (!result.ok) {
    deps.logger.debug('Distilled rule stage failed', { error: result.error.message });
    return { scores: new Map(), rulesApplied: 0 };
  }

  const { signals, scores } = result.value.context;
  const rulesApplied = countAppliedRulesFromSignals(signals);

  deps.logger.debug('Distilled rule stage completed', { rulesApplied, scoreCount: scores.size });

  return { scores: new Map(scores), rulesApplied };
}

/** KNN routing stage result. (arXiv:2507.05370) */
export interface KnnRoutingStageResult {
  scores: Map<CliName, number>;
  hasExperience: boolean;
}

/** Runs KNN experience-based routing stage. (arXiv:2507.05370) */
export async function runKnnRoutingStage(
  task: CliTask,
  candidates: CliName[],
  stagesExecuted: string[],
  deps: StageDependencies
): Promise<KnnRoutingStageResult> {
  if (!deps.config.enableKnnRouting || deps.knnRoutingStage === undefined) {
    return { scores: new Map(), hasExperience: false };
  }

  const ctx = createRoutingContext(task.content, candidates);
  const result = await deps.knnRoutingStage.route(ctx);
  stagesExecuted.push('knn-routing');

  if (!result.ok) {
    deps.logger.debug('KNN routing stage failed', { error: result.error.message });
    return { scores: new Map(), hasExperience: false };
  }

  const { signals, scores } = result.value.context;
  const hasExperience = signals.includes('knn:experience-matched');

  deps.logger.debug('KNN routing completed', { hasExperience, scoreCount: scores.size });

  return { scores: new Map(scores), hasExperience };
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

/** Builds per-CLI performance data for the given task category from the outcome store.
 * Returns empty map if category is unknown or store is empty. (#1401) */
function getPerformanceDataForCategory(taskContent: string): Map<CliName, PerformanceFloorEntry> {
  try {
    const match = detectTaskCategory(taskContent);
    if (match === null) return new Map();
    const summary = getOutcomeStore().summarize({ category: match.category });
    const result = new Map<CliName, PerformanceFloorEntry>();
    for (const [cli, stats] of summary.byCli) {
      result.set(cli as CliName, {
        successRate: stats.successRate,
        sampleCount: stats.count,
      });
    }
    return result;
  } catch {
    return new Map();
  }
}

/** Runs TOPSIS ranking stage. Uses plan billing criteria when billingMode is 'plan'.
 * When stageScores are provided, adjusts quality profiles before evaluation. (#1354)
 * When performance floor data is available, penalizes underperforming CLIs. (#1401) */
export function runTopsisStage(
  taskProfile: TaskProfile,
  candidates: CliName[],
  stagesExecuted: string[],
  deps: StageDependencies,
  options?: {
    stageScores?: ReadonlyMap<CliName, number>;
    performanceData?: ReadonlyMap<CliName, PerformanceFloorEntry>;
  }
): { ranking: CliName[]; score: number | undefined } {
  if (!deps.config.enableTopsisRanking || deps.topsisRouter === undefined) {
    return { ranking: candidates, score: undefined };
  }
  const topsisOptions: Parameters<typeof applyTopsisRanking>[3] = {
    billingMode: deps.config.billingMode,
  };
  if (options?.stageScores !== undefined) topsisOptions.stageScores = options.stageScores;
  if (options?.performanceData !== undefined)
    topsisOptions.performanceData = options.performanceData;
  const result = applyTopsisRanking(taskProfile, candidates, deps.topsisRouter, topsisOptions);
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

/** Merge multiple score maps into a single aggregated map. */
function mergeScoreMaps(
  ...maps: ReadonlyArray<ReadonlyMap<CliName, number>>
): Map<CliName, number> {
  const merged = new Map<CliName, number>();
  for (const m of maps) {
    for (const [cli, score] of m) {
      merged.set(cli, (merged.get(cli) ?? 0) + score);
    }
  }
  return merged;
}

/** Runs scoring stages (priorities 10-55) and returns intermediate results. */
async function runScoringStages(
  task: CliTask,
  candidates: CliName[],
  stagesExecuted: string[],
  deps: StageDependencies
): Promise<{
  cascadeResult: ConfidenceCascadeStageResult;
  memoryResult: RoutingMemoryStageResult;
  capResult: CapabilityMatchStageResult;
  knnResult: KnnRoutingStageResult;
  zeroResult: ZeroRouterStageResult;
  distilledResult: DistilledRuleStageResult;
  prefResult: PreferenceStageResult;
  resourceResult: ResourceStrategyStageResult;
  candidates: CliName[];
}> {
  const cascadeResult = await runConfidenceCascadeStage(task, candidates, stagesExecuted, deps);
  const memoryResult = runRoutingMemoryStage(task, candidates, stagesExecuted, deps);
  const capResult = await runCapabilityMatchStage(task, candidates, stagesExecuted, deps);
  const knnResult = await runKnnRoutingStage(task, candidates, stagesExecuted, deps);
  const zeroResult = runZeroRouterStage(task, candidates, stagesExecuted, deps);
  let filtered = zeroResult.filteredCandidates;
  const distilledResult = await runDistilledRuleStage(task, filtered, stagesExecuted, deps);
  const prefResult = runPreferenceStage(task, filtered, stagesExecuted, deps);
  filtered = prefResult.preferredCandidates;
  const resourceResult = await runResourceStrategyStage(task, filtered, stagesExecuted, deps);
  return {
    cascadeResult,
    memoryResult,
    capResult,
    knnResult,
    zeroResult,
    distilledResult,
    prefResult,
    resourceResult,
    candidates: filtered,
  };
}

/** Aggregates scores from scoring stages + weather bonuses for TOPSIS. (#1354, #1389) */
function aggregateStageScores(
  scoring: Awaited<ReturnType<typeof runScoringStages>>,
  taskContent: string
): Map<CliName, number> {
  const weatherScores = getWeatherBonusForTask(taskContent);
  return mergeScoreMaps(
    scoring.cascadeResult.scores,
    scoring.capResult.scores,
    scoring.knnResult.scores,
    scoring.distilledResult.scores,
    scoring.resourceResult.scores,
    weatherScores
  );
}

/** Best-effort weather bonus lookup for a task. */
function getWeatherBonusForTask(taskContent: string): Map<CliName, number> {
  try {
    const match = detectTaskCategory(taskContent);
    if (match === null) return new Map();
    return getWeatherBonusScores(match.category);
  } catch {
    return new Map();
  }
}

/** Executes full pipeline and returns result. (Made async in Issue #1350) */
export async function runPipeline(
  task: CliTask,
  taskProfile: TaskProfile,
  stagesExecuted: string[],
  cliNames: CliName[],
  deps: StageDependencies
): Promise<Result<PipelineResult, CompositeRoutingError>> {
  let candidates: CliName[] = [...cliNames];
  if (candidates.length === 0) {
    return err(new CompositeRoutingError('No CLI adapters available', 'initialization'));
  }

  const budgetResult = runBudgetStage(task, candidates, stagesExecuted, deps);
  if (!budgetResult.ok) return budgetResult;
  candidates = budgetResult.value.candidates;
  const withinBudget = budgetResult.value.withinBudget;

  const scoring = await runScoringStages(task, candidates, stagesExecuted, deps);
  candidates = scoring.candidates;
  const stageScores = aggregateStageScores(scoring, task.content);

  const topsisOpts: Parameters<typeof runTopsisStage>[4] = {
    performanceData: getPerformanceDataForCategory(task.content),
  };
  if (stageScores.size > 0) topsisOpts.stageScores = stageScores;
  const topsisResult = runTopsisStage(taskProfile, candidates, stagesExecuted, deps, topsisOpts);

  const linucbResult = runLinUCBStage(taskProfile, topsisResult.ranking, stagesExecuted, deps);
  if (linucbResult.selectedCli === undefined) {
    return err(new CompositeRoutingError('No candidates available', 'selection'));
  }

  const qualityResult = await runQualityConstraintStage(candidates, stagesExecuted, deps);
  const latencyResult = runLatencyStage(qualityResult.eligible, stagesExecuted, deps);
  const selectedCli = selectWithMemoryInfluence(
    linucbResult.selectedCli,
    scoring.memoryResult,
    deps
  );

  return ok(
    buildPipelineResult({
      ...scoring,
      qualityResult,
      topsisResult,
      linucbResult: { ucbScore: linucbResult.ucbScore },
      latencyResult,
      withinBudget,
      selectedCli,
    })
  );
}

/** Intermediate params for pipeline result construction. */
interface PipelineResultParams {
  cascadeResult: ConfidenceCascadeStageResult;
  capResult: CapabilityMatchStageResult;
  knnResult: KnnRoutingStageResult;
  distilledResult: DistilledRuleStageResult;
  resourceResult: ResourceStrategyStageResult;
  qualityResult: QualityConstraintStageResult;
  zeroResult: ZeroRouterStageResult;
  prefResult: PreferenceStageResult;
  topsisResult: { ranking: CliName[]; score: number | undefined };
  linucbResult: { ucbScore: number | undefined };
  latencyResult: LatencyStageResult;
  memoryResult: RoutingMemoryStageResult;
  withinBudget: boolean | undefined;
  selectedCli: CliName;
}

/** Assemble PipelineResult from stage outputs, including async stage scores. */
function buildPipelineResult(p: PipelineResultParams): PipelineResult {
  const stageScores = mergeScoreMaps(
    p.cascadeResult.scores,
    p.capResult.scores,
    p.knnResult.scores,
    p.distilledResult.scores,
    p.resourceResult.scores
  );

  return {
    candidates: p.qualityResult.eligible,
    withinBudget: p.withinBudget,
    difficultyEstimate: p.zeroResult.difficultyEstimate,
    difficultyTier: p.zeroResult.difficultyTier,
    preferenceScore: p.prefResult.preferenceScore,
    preferenceTier: p.prefResult.preferenceTier,
    topsisRanking: p.topsisResult.ranking,
    topsisScore: p.topsisResult.score,
    selectedCli: p.selectedCli,
    ucbScore: p.linucbResult.ucbScore,
    latencyScore: p.latencyResult.latencyScore,
    memoryRecommendation: p.memoryResult.recommendation,
    memoryConfidence: p.memoryResult.memoryConfidence,
    ...(stageScores.size > 0 ? { stageScores } : {}),
    ...(p.cascadeResult.complexity !== DEFAULT_COMPLEXITY
      ? { cascadeComplexity: p.cascadeResult.complexity }
      : {}),
    ...(p.capResult.taskType !== 'general' ? { capabilityTaskType: p.capResult.taskType } : {}),
    ...(p.qualityResult.filtered.size > 0 ? { qualityFiltered: p.qualityResult.filtered } : {}),
    ...(p.resourceResult.tier !== 'balanced' ? { resourceTier: p.resourceResult.tier } : {}),
    ...(p.distilledResult.rulesApplied > 0
      ? { distilledRulesApplied: p.distilledResult.rulesApplied }
      : {}),
  };
}

/** Select CLI with optional memory influence. (Issue #489) */
function selectWithMemoryInfluence(
  linucbSelection: CliName,
  memoryResult: RoutingMemoryStageResult,
  deps: StageDependencies
): CliName {
  // If routing memory has a high-confidence recommendation, use it.
  // Threshold must exceed the default memoryConfidence (0.8) to prevent
  // routing memory from always overriding LinUCB learning. (#1171)
  if (memoryResult.recommendation !== undefined && memoryResult.memoryConfidence !== undefined) {
    const confidenceThreshold = 0.85;
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
