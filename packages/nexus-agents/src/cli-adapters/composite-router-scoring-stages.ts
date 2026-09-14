/* eslint max-lines: ["error", { "max": 600, "skipBlankLines": true, "skipComments": true }] */
/**
 * CompositeRouter stateless scoring-stage runners.
 *
 * Each `run*Stage` runner wraps one routing stage: it short-circuits to a
 * named default when the stage is disabled or absent in {@link StageDependencies},
 * otherwise runs the stage, appends its marker to `stagesExecuted` and
 * projects the stage's signals into a typed result. The orchestrator that
 * sequences them (`runPipeline`) and the quality-constraint / category-override
 * gating live in `composite-router-stages.ts`; nothing here imports from it.
 * Split out under #6148.
 * @module cli-adapters/composite-router-scoring-stages
 */
import type { ILogger, TaskProfile } from '../core/index.js';
import type { CliName, RoutingArmId, CliTask } from './types.js';
import { routingArmDisplaySlot } from './types.js';
import type { BudgetRouter } from './budget-router.js';
import type { TopsisRouter } from './topsis-router.js';
import type { LinUCBBandit } from './linucb-bandit.js';
import type { PreferenceRouter } from './preference-router.js';
import type { ZeroRouter } from './zero-router.js';
import type { LatencyTracker } from './latency-tracker.js';
import type { IRoutingMemory } from '../context/routing-memory.js';
import type { CompositeRouterConfigWithPreference } from './composite-router-types.js';
import type {
  ConfidenceCascadeStage,
  CapabilityMatchStage,
  QualityConstraintStage,
  ResourceStrategyStage,
  DistilledRuleStage,
  KnnRoutingStage,
  CapacityFilterStage,
} from './routing/stages/index.js';
import { createRoutingContext, getRemainingCandidates } from './routing/router-stage.js';
import {
  taskProfileToBanditContext,
  filterByPreferenceTier,
  applyTopsisRanking,
  applyZeroRouterFilter,
  defaultPreferenceStageResult,
  defaultZeroRouterStageResult,
  type PreferenceStageResult,
  type ZeroRouterStageResult,
  type PerformanceFloorEntry,
} from './composite-router-helpers.js';

/**
 * Collapse a routing-arm candidate set to its unique display CLI slots (#3422).
 * The RoutingContext-based stages (confidence-cascade, capability-match,
 * quality-constraint, etc.) score/filter at slot granularity, so an api:* arm
 * is represented by its vendor slot. De-duplicated to avoid double-scoring when
 * both a CLI slot and its API arm are present.
 */
export function armsToSlots(candidates: readonly RoutingArmId[]): CliName[] {
  return [...new Set(candidates.map(routingArmDisplaySlot))];
}

/**
 * Filter an arm candidate set down to those whose display slot survived a
 * slot-level filter (#3422). Preserves the distinct api:* arms.
 */
function keepArmsForSlots(
  candidates: readonly RoutingArmId[],
  survivingSlots: readonly CliName[]
): RoutingArmId[] {
  const slotSet = new Set(survivingSlots);
  return candidates.filter((arm) => slotSet.has(routingArmDisplaySlot(arm)));
}

/** Dependencies required for pipeline stage execution. */
export interface StageDependencies {
  config: CompositeRouterConfigWithPreference;
  logger: ILogger;
  cliNames: RoutingArmId[];
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
  capacityFilterStage: CapacityFilterStage | undefined;
  /** Distilled rule stage instance (Issue #999) */
  distilledRuleStage: DistilledRuleStage | undefined;
  /** KNN routing stage instance (arXiv:2505.12601) */
  knnRoutingStage: KnnRoutingStage | undefined;
}
/** Default complexity when no signal is available. */
export const DEFAULT_COMPLEXITY: ConfidenceCascadeStageResult['complexity'] = 'moderate';

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
  candidates: RoutingArmId[],
  stagesExecuted: string[],
  deps: StageDependencies
): Promise<ConfidenceCascadeStageResult> {
  if (!deps.config.enableConfidenceCascade || deps.confidenceCascadeStage === undefined) {
    return DEFAULT_CASCADE_RESULT;
  }

  const ctx = createRoutingContext(task.content, armsToSlots(candidates));
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
  candidates: RoutingArmId[],
  stagesExecuted: string[],
  deps: StageDependencies
): Promise<CapabilityMatchStageResult> {
  if (!deps.config.enableCapabilityMatch || deps.capabilityMatchStage === undefined) {
    return DEFAULT_CAPABILITY_RESULT;
  }

  const ctx = createRoutingContext(task.content, armsToSlots(candidates));
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
  eligible: RoutingArmId[];
  filtered: Map<CliName, string>;
  usedFallback: boolean;
}

/** Runs quality constraint stage. (Issue #755, #1350) */
export async function runQualityConstraintStage(
  candidates: RoutingArmId[],
  stagesExecuted: string[],
  deps: StageDependencies
): Promise<QualityConstraintStageResult> {
  if (!deps.config.enableQualityConstraint || deps.qualityConstraintStage === undefined) {
    return { eligible: candidates, filtered: new Map(), usedFallback: false };
  }

  // Quality constraints are slot-level; collapse to slots for the stage, then
  // keep the arms whose slot survived (#3422).
  const ctx = createRoutingContext('', armsToSlots(candidates));
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

  // If all slots filtered, fall back to original set
  const eligible = remaining.length > 0 ? keepArmsForSlots(candidates, remaining) : candidates;
  return { eligible, filtered, usedFallback: remaining.length === 0 || usedFallback };
}

/** Resource strategy stage result. (Issue #998) */
export interface ResourceStrategyStageResult {
  scores: Map<CliName, number>;
  tier: string;
  resourceLevel: number | undefined;
  /**
   * Whether a tier was actually selected (#4866).
   *
   * `false` means the stage skipped for want of budget data, so `tier` is the
   * `'balanced'` default and NOT a decision. Without this, a genuinely
   * selected balanced tier and a stage that never ran are the same value.
   */
  tierMeasured: boolean;
}

/** Default resource strategy result. */
const DEFAULT_RESOURCE_RESULT: ResourceStrategyStageResult = {
  scores: new Map(),
  tier: 'balanced',
  resourceLevel: undefined,
  tierMeasured: false,
};

/** Runs resource strategy stage. (Issue #998, #1350) */
export async function runResourceStrategyStage(
  task: CliTask,
  candidates: RoutingArmId[],
  stagesExecuted: string[],
  deps: StageDependencies,
  budgetUtilization?: number
): Promise<ResourceStrategyStageResult> {
  if (!deps.config.enableResourceStrategy || deps.resourceStrategyStage === undefined) {
    return DEFAULT_RESOURCE_RESULT;
  }

  // The stage reads its input from context metadata. It used to be given a
  // fresh context with no metadata and no signals, so it skipped with "no
  // budget data" on every production call and no tier was ever selected
  // (#4866). Passed as a typed argument rather than revived as a cross-stage
  // signal channel — the string-prefix channel is what produced #4832/#4834.
  //
  // Undefined stays undefined: with no cost ceiling configured there is no
  // utilization, and substituting a default would activate tier adjustments
  // for users who never asked for budget-aware routing.
  const resourceLevel =
    budgetUtilization === undefined ? undefined : Math.max(0, Math.min(1, 1 - budgetUtilization));
  const ctx = createRoutingContext(
    task.content,
    armsToSlots(candidates),
    resourceLevel === undefined ? undefined : { resourceLevel }
  );
  const result = await deps.resourceStrategyStage.route(ctx);
  stagesExecuted.push('resource-strategy');

  if (!result.ok) {
    deps.logger.debug('Resource strategy stage failed', { error: result.error.message });
    return DEFAULT_RESOURCE_RESULT;
  }

  const { signals, scores } = result.value.context;
  const tier = extractTierFromSignals(signals);
  const tierMeasured = signals.some((sig) => sig.startsWith('resource-strategy:tier='));

  deps.logger.debug('Resource strategy completed', {
    tier,
    tierMeasured,
    resourceLevel,
    scoreCount: scores.size,
  });

  // Only report the level the stage actually ACTED on. Returning the input
  // regardless would claim a level was applied when the stage had skipped —
  // the same "reported but not used" shape this change exists to remove.
  return {
    scores: new Map(scores),
    tier,
    resourceLevel: tierMeasured ? resourceLevel : undefined,
    tierMeasured,
  };
}

/** Distilled rule stage result. (Issue #999) */
export interface DistilledRuleStageResult {
  scores: Map<CliName, number>;
  rulesApplied: number;
}

/** Runs distilled rule stage. (Issue #999, #1350) */
export async function runDistilledRuleStage(
  task: CliTask,
  candidates: RoutingArmId[],
  stagesExecuted: string[],
  deps: StageDependencies,
  taskCategory?: string
): Promise<DistilledRuleStageResult> {
  if (!deps.config.enableStrategyDistillation || deps.distilledRuleStage === undefined) {
    return { scores: new Map(), rulesApplied: 0 };
  }

  // Typed argument rather than a cross-stage signal (#4866 option B). The
  // vocabulary matters: rules carry a `TaskCategory`, and `detectTaskCategory`
  // is the only producer that speaks it — `capability:task-` emits an
  // unrelated four-value set (#4832).
  const ctx = createRoutingContext(
    task.content,
    armsToSlots(candidates),
    taskCategory === undefined ? undefined : { taskCategory }
  );
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

/** KNN routing stage result. (arXiv:2505.12601) */
export interface KnnRoutingStageResult {
  scores: Map<CliName, number>;
  hasExperience: boolean;
}

/** Runs KNN experience-based routing stage. (arXiv:2505.12601) */
export async function runKnnRoutingStage(
  task: CliTask,
  candidates: RoutingArmId[],
  stagesExecuted: string[],
  deps: StageDependencies
): Promise<KnnRoutingStageResult> {
  if (!deps.config.enableKnnRouting || deps.knnRoutingStage === undefined) {
    return { scores: new Map(), hasExperience: false };
  }

  const ctx = createRoutingContext(task.content, armsToSlots(candidates));
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
  candidates: RoutingArmId[],
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

/** Runs TOPSIS ranking stage. Uses plan billing criteria when billingMode is 'plan'.
 * When stageScores are provided, adjusts quality profiles before evaluation. (#1354)
 * When performance floor data is available, penalizes underperforming CLIs. (#1401) */
export function runTopsisStage(
  taskProfile: TaskProfile,
  candidates: RoutingArmId[],
  stagesExecuted: string[],
  deps: StageDependencies,
  options?: {
    stageScores?: ReadonlyMap<CliName, number>;
    performanceData?: ReadonlyMap<CliName, PerformanceFloorEntry>;
  }
): {
  ranking: RoutingArmId[];
  score: number | undefined;
  /** #5269: per-arm closeness, absent when no ranking ran. */
  scoresByArm?: ReadonlyMap<RoutingArmId, number>;
} {
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
  return {
    ranking: result.ranking,
    score: result.topScore,
    ...(result.scoresByArm === undefined ? {} : { scoresByArm: result.scoresByArm }),
  };
}

/** Runs LinUCB bandit selection stage. */
export function runLinUCBStage(
  taskProfile: TaskProfile,
  topsisRanking: RoutingArmId[],
  stagesExecuted: string[],
  deps: StageDependencies,
  budgetUtilization?: number
): { selectedCli: RoutingArmId | undefined; ucbScore: number | undefined } {
  if (!deps.config.enableLinUCBSelection || deps.linucbBandit === undefined) {
    return { selectedCli: topsisRanking[0], ucbScore: undefined };
  }
  const banditContext = taskProfileToBanditContext(taskProfile, budgetUtilization);
  const selection = deps.linucbBandit.select(banditContext);
  stagesExecuted.push('linucb-selection');
  // armName is the routing arm id — a CLI slot or a distinct api:* arm (#3422).
  const picked = selection.armName as RoutingArmId;
  // #3111: LinUCB.select() ranks over ALL registered arms, ignoring the
  // already-filtered candidate set. Constrain the pick to topsisRanking so a
  // fail-closed category override (e.g. security_review → [codex]) or a
  // quality filter can't be bypassed by a learned preference. recordOutcome
  // keys the reward update on the *routed* cliName, so falling back to the
  // TOPSIS-best candidate updates the arm actually used — no learning desync.
  if (!topsisRanking.includes(picked)) {
    return { selectedCli: topsisRanking[0], ucbScore: selection.ucbScore };
  }
  return { selectedCli: picked, ucbScore: selection.ucbScore };
}

/** Runs preference routing stage. */
export function runPreferenceStage(
  task: CliTask,
  candidates: RoutingArmId[],
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
  latencyAdjustedRanking: RoutingArmId[];
}

/** Runs latency scoring stage. (Issue #361) */
export function runLatencyStage(
  candidates: RoutingArmId[],
  stagesExecuted: string[],
  deps: StageDependencies
): LatencyStageResult {
  if (!deps.config.enableLatencyTracking || deps.latencyTracker === undefined) {
    return { latencyScore: undefined, latencyAdjustedRanking: candidates };
  }

  // Latency is tracked per slot; collapse arms and let an api:* arm sort by
  // its display slot's latency score (#3422).
  const scores = deps.latencyTracker.getScores(armsToSlots(candidates));
  stagesExecuted.push('latency-scoring');
  const scoreOf = (arm: RoutingArmId): number =>
    scores.find((s) => s.cli === routingArmDisplaySlot(arm))?.score ?? 0;

  // Sort candidates by latency score (higher is better/faster)
  const sortedCandidates = [...candidates].sort((a, b) => scoreOf(b) - scoreOf(a));

  const topArm = sortedCandidates[0];
  const topScore =
    topArm !== undefined
      ? scores.find((s) => s.cli === routingArmDisplaySlot(topArm))?.score
      : undefined;

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
  candidates: RoutingArmId[],
  stagesExecuted: string[],
  deps: StageDependencies
): RoutingMemoryStageResult {
  if (!deps.config.enableRoutingMemory || deps.routingMemory === undefined) {
    return { recommendation: undefined, memoryConfidence: undefined };
  }

  const taskType = inferTaskTypeFromContent(task.content);
  // Routing memory is a slot-level secondary learner; its recommendation is a
  // CLI slot, matched against the candidates' display slots (#3422).
  const recommendation = deps.routingMemory.getRecommendation(taskType);
  stagesExecuted.push('routing-memory');

  if (recommendation !== undefined && armsToSlots(candidates).includes(recommendation)) {
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
