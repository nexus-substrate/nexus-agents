/**
 * CompositeRouter: Chains Budget → ZeroRouter → Preference → TOPSIS → LinUCB.
 * @module cli-adapters/composite-router
 * (Source: Issue #166, Epic #164, Issue #347, arXiv:2509.07571)
 */
/* eslint-disable max-lines -- Composite router coordinates 5 pipeline stages */
import type { Result } from '../core/index.js';
import { ok, err, createLogger } from '../core/index.js';
import type { ILogger } from '../core/index.js';
import type { ICliAdapter, CliName, CliTask } from './types.js';
import { BudgetRouter } from './budget-router.js';
import { TopsisRouter } from './topsis-router.js';
import { LinUCBBandit } from './linucb-bandit.js';
import { PreferenceRouter } from './preference-router.js';
import type { PreferenceRouterConfig } from './preference-router-types.js';
import { ZeroRouter, type IZeroRouter } from './zero-router.js';
import type { ZeroRouterConfig } from './zero-router-types.js';
import { analyzeTask, type TaskProfile } from './task-analyzer.js';
import {
  CompositeRouterConfigSchema,
  CompositeRoutingError,
  type CompositeRouterConfig,
  type CompositeRouterConfigWithPreference,
  type CompositeRoutingDecision,
  type CompositeRouterStats,
  type PipelineResult,
  type BuildDecisionParams,
} from './composite-router-types.js';
import {
  taskProfileToBanditContext,
  filterByPreferenceTier,
  cliTaskToTask,
  applyBudgetFilter,
  applyTopsisRanking,
  applyZeroRouterFilter,
  defaultPreferenceStageResult,
  defaultZeroRouterStageResult,
  buildDecisionFields,
  buildDifficultyOutcome,
  type PreferenceStageResult,
  type ZeroRouterStageResult,
} from './composite-router-helpers.js';

// Re-export types for consumers
export {
  CompositeRouterConfigSchema,
  DEFAULT_COMPOSITE_CONFIG,
  CompositeRoutingError,
  type CompositeRouterConfig,
  type CompositeRouterConfigWithPreference,
  type CompositeRoutingDecision,
  type CompositeRouterStats,
} from './composite-router-types.js';

/** Composite router interface for dependency injection. */
export interface ICompositeRouter {
  route(task: CliTask): Promise<Result<CompositeRoutingDecision, CompositeRoutingError>>;
  recordOutcome(cliName: CliName, task: CliTask, reward: number): void;
  recordPreference(
    query: string,
    strongPreferred: boolean,
    quality?: { strong?: number; weak?: number }
  ): void;
  recordDifficultyOutcome(task: CliTask, success: boolean, qualityScore?: number): void;
  getStats(): CompositeRouterStats;
  hasMinimumPreferenceData(): boolean;
  getZeroRouter(): IZeroRouter | undefined;
}

/** CompositeRouter implementation. */
export class CompositeRouter implements ICompositeRouter {
  private readonly config: CompositeRouterConfig;
  private readonly preferenceRouterConfig?: Partial<PreferenceRouterConfig>;
  private readonly zeroRouterConfig?: Partial<ZeroRouterConfig>;
  private readonly logger: ILogger;
  private readonly adapters: Map<CliName, ICliAdapter>;
  private budgetRouter?: BudgetRouter;
  private zeroRouter?: ZeroRouter;
  private preferenceRouter?: PreferenceRouter;
  private topsisRouter?: TopsisRouter;
  private linucbBandit?: LinUCBBandit;
  private readonly cliNames: CliName[];

  // Statistics tracking
  private totalDecisions = 0;
  private decisionsPerCli: Record<CliName, number> = { claude: 0, gemini: 0, codex: 0 };
  private totalDecisionTimeMs = 0;
  private budgetRejections = 0;

  // Track last routing for difficulty outcome recording
  private lastRoutedTask?: { task: CliTask; selectedCli: CliName; difficulty: number };

  constructor(
    adapters: Map<CliName, ICliAdapter>,
    config?: Partial<CompositeRouterConfigWithPreference>,
    logger?: ILogger
  ) {
    const { preferenceRouterConfig, zeroRouterConfig, ...baseConfig } = config ?? {};
    this.config = CompositeRouterConfigSchema.parse(baseConfig);
    if (preferenceRouterConfig !== undefined) this.preferenceRouterConfig = preferenceRouterConfig;
    if (zeroRouterConfig !== undefined) this.zeroRouterConfig = zeroRouterConfig;
    this.logger = logger ?? createLogger({ component: 'CompositeRouter' });
    this.adapters = adapters;
    this.cliNames = Array.from(adapters.keys());
    this.initializeRouters(adapters, preferenceRouterConfig, zeroRouterConfig);
  }

  private initializeRouters(
    adapters: Map<CliName, ICliAdapter>,
    preferenceConfig?: Partial<PreferenceRouterConfig>,
    zeroConfig?: Partial<ZeroRouterConfig>
  ): void {
    if (this.config.enableBudgetFilter && adapters.size > 0) {
      this.budgetRouter = new BudgetRouter(adapters);
    }
    if (this.config.enableZeroRouter) this.zeroRouter = new ZeroRouter(zeroConfig, this.logger);
    if (this.config.enablePreferenceRouting)
      this.preferenceRouter = new PreferenceRouter(preferenceConfig);
    if (this.config.enableTopsisRanking) this.topsisRouter = new TopsisRouter();
    if (this.config.enableLinUCBSelection && this.cliNames.length > 0) {
      this.linucbBandit = new LinUCBBandit(this.cliNames, { alpha: this.config.linucbAlpha });
    }
    this.logger.info('CompositeRouter initialized', {
      adapterCount: adapters.size,
      enableBudget: this.config.enableBudgetFilter,
      enableZeroRouter: this.config.enableZeroRouter,
      enablePreference: this.config.enablePreferenceRouting,
      enableTopsis: this.config.enableTopsisRanking,
      enableLinUCB: this.config.enableLinUCBSelection,
    });
  }

  async route(task: CliTask): Promise<Result<CompositeRoutingDecision, CompositeRoutingError>> {
    return Promise.resolve().then(() => this.executeRouting(task, Date.now()));
  }

  private executeRouting(
    task: CliTask,
    startTime: number
  ): Result<CompositeRoutingDecision, CompositeRoutingError> {
    const stagesExecuted: string[] = [];
    try {
      const taskProfile = this.analyzeTaskProfile(task, stagesExecuted);
      const pipelineResult = this.runPipeline(task, taskProfile, stagesExecuted);
      if (!pipelineResult.ok) return pipelineResult;

      return this.buildRoutingDecision({
        ...pipelineResult.value,
        taskProfile,
        stagesExecuted,
        startTime,
      });
    } catch (error) {
      return this.handleRoutingError(error, stagesExecuted);
    }
  }

  private analyzeTaskProfile(task: CliTask, stagesExecuted: string[]): TaskProfile {
    const internalTask = cliTaskToTask(task);
    const taskProfile = analyzeTask(internalTask);
    stagesExecuted.push('task-analysis');
    return taskProfile;
  }

  private runPipeline(
    task: CliTask,
    taskProfile: TaskProfile,
    stagesExecuted: string[]
  ): Result<PipelineResult, CompositeRoutingError> {
    let candidates: CliName[] = [...this.cliNames];
    if (candidates.length === 0) {
      return err(new CompositeRoutingError('No CLI adapters available', 'initialization'));
    }

    // Step 1: Budget filtering
    const budgetResult = this.runBudgetStage(task, candidates, stagesExecuted);
    if (!budgetResult.ok) return budgetResult;
    candidates = budgetResult.value.candidates;
    const withinBudget = budgetResult.value.withinBudget;

    // Step 2: ZeroRouter + Step 3: Preference + Step 4: TOPSIS + Step 5: LinUCB
    const zeroResult = this.runZeroRouterStage(task, candidates, stagesExecuted);
    candidates = zeroResult.filteredCandidates;

    const prefResult = this.runPreferenceStage(task, candidates, stagesExecuted);
    candidates = prefResult.preferredCandidates;

    const topsisResult = this.runTopsisStage(taskProfile, candidates, stagesExecuted);
    const linucbResult = this.runLinUCBStage(taskProfile, topsisResult.ranking, stagesExecuted);
    if (linucbResult.selectedCli === undefined) {
      return err(new CompositeRoutingError('No candidates available', 'selection'));
    }

    if (zeroResult.difficultyEstimate !== undefined) {
      this.lastRoutedTask = {
        task,
        selectedCli: linucbResult.selectedCli,
        difficulty: zeroResult.difficultyEstimate.aggregateScore,
      };
    }

    return ok({
      candidates,
      withinBudget,
      difficultyEstimate: zeroResult.difficultyEstimate,
      difficultyTier: zeroResult.difficultyTier,
      preferenceScore: prefResult.preferenceScore,
      preferenceTier: prefResult.preferenceTier,
      topsisRanking: topsisResult.ranking,
      topsisScore: topsisResult.score,
      selectedCli: linucbResult.selectedCli,
      ucbScore: linucbResult.ucbScore,
    });
  }

  private runBudgetStage(
    task: CliTask,
    candidates: CliName[],
    stagesExecuted: string[]
  ): Result<{ candidates: CliName[]; withinBudget: boolean | undefined }, CompositeRoutingError> {
    if (!this.config.enableBudgetFilter || this.budgetRouter === undefined) {
      return ok({ candidates, withinBudget: undefined });
    }
    const result = applyBudgetFilter(task, candidates, this.budgetRouter, this.config);
    stagesExecuted.push('budget-filter');
    if (result.eligible.length === 0) {
      this.budgetRejections++;
      return err(new CompositeRoutingError('No CLIs within budget', 'budget-filter'));
    }
    return ok({ candidates: result.eligible, withinBudget: result.withinBudget });
  }

  private runZeroRouterStage(
    task: CliTask,
    candidates: CliName[],
    stagesExecuted: string[]
  ): ZeroRouterStageResult {
    if (!this.config.enableZeroRouter || this.zeroRouter === undefined) {
      return defaultZeroRouterStageResult(candidates);
    }

    const result = applyZeroRouterFilter(task, candidates, this.zeroRouter);
    stagesExecuted.push('zero-router');

    this.logger.debug('ZeroRouter applied', {
      level: result.difficultyEstimate?.level,
      tier: result.difficultyTier,
      score: result.difficultyEstimate?.aggregateScore.toFixed(3),
      candidatesAfter: result.filteredCandidates.length,
    });

    return result;
  }

  private runTopsisStage(
    taskProfile: TaskProfile,
    candidates: CliName[],
    stagesExecuted: string[]
  ): { ranking: CliName[]; score: number | undefined } {
    if (!this.config.enableTopsisRanking || this.topsisRouter === undefined) {
      return { ranking: candidates, score: undefined };
    }
    const result = applyTopsisRanking(taskProfile, candidates, this.topsisRouter);
    stagesExecuted.push('topsis-ranking');
    return { ranking: result.ranking, score: result.topScore };
  }

  private runLinUCBStage(
    taskProfile: TaskProfile,
    topsisRanking: CliName[],
    stagesExecuted: string[]
  ): { selectedCli: CliName | undefined; ucbScore: number | undefined } {
    if (!this.config.enableLinUCBSelection || this.linucbBandit === undefined) {
      return { selectedCli: topsisRanking[0], ucbScore: undefined };
    }
    const banditContext = taskProfileToBanditContext(taskProfile);
    const selection = this.linucbBandit.select(banditContext);
    stagesExecuted.push('linucb-selection');
    return { selectedCli: selection.armName as CliName, ucbScore: selection.ucbScore };
  }

  private runPreferenceStage(
    task: CliTask,
    candidates: CliName[],
    stagesExecuted: string[]
  ): PreferenceStageResult {
    if (!this.config.enablePreferenceRouting || this.preferenceRouter === undefined) {
      return defaultPreferenceStageResult(candidates);
    }
    if (!this.preferenceRouter.hasMinimumData()) {
      this.logger.debug('Preference routing skipped: insufficient data');
      return defaultPreferenceStageResult(candidates);
    }

    const decision = this.preferenceRouter.route(task.content);
    stagesExecuted.push('preference-routing');
    const preferredCandidates = filterByPreferenceTier(candidates, decision.selectedTier);

    this.logger.debug('Preference routing applied', {
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

  private buildRoutingDecision(
    params: BuildDecisionParams & PipelineResult
  ): Result<CompositeRoutingDecision, CompositeRoutingError> {
    const selectedAdapter = this.adapters.get(params.selectedCli);
    if (selectedAdapter === undefined) {
      return err(
        new CompositeRoutingError('Adapter not found: ' + params.selectedCli, 'selection')
      );
    }

    const decisionTimeMs = Date.now() - params.startTime;
    this.updateStats(params.selectedCli, decisionTimeMs);
    const { confidence, reason, alternatives } = buildDecisionFields({ ...params, decisionTimeMs });

    return ok({
      adapter: selectedAdapter,
      cliName: params.selectedCli,
      confidence,
      reason,
      stagesExecuted: params.stagesExecuted,
      decisionTimeMs,
      withinBudget: params.withinBudget,
      difficultyEstimate: params.difficultyEstimate,
      difficultyTier: params.difficultyTier,
      preferenceScore: params.preferenceScore,
      preferenceTier: params.preferenceTier,
      topsisScore: params.topsisScore,
      ucbScore: params.ucbScore,
      alternatives,
      taskProfile: params.taskProfile,
    });
  }

  private updateStats(selectedCli: CliName, decisionTimeMs: number): void {
    this.totalDecisions++;
    this.decisionsPerCli[selectedCli]++;
    this.totalDecisionTimeMs += decisionTimeMs;
  }

  private handleRoutingError(
    error: unknown,
    stagesExecuted: string[]
  ): Result<CompositeRoutingDecision, CompositeRoutingError> {
    const stage = stagesExecuted[stagesExecuted.length - 1] ?? 'unknown';
    const msg = 'Routing failed: ' + (error instanceof Error ? error.message : String(error));
    return err(new CompositeRoutingError(msg, stage, error instanceof Error ? error : undefined));
  }

  recordOutcome(cliName: CliName, task: CliTask, reward: number): void {
    if (this.linucbBandit === undefined) return;
    const armIndex = this.cliNames.indexOf(cliName);
    if (armIndex === -1) {
      this.logger.warn('Unknown CLI for outcome recording', { cliName });
      return;
    }
    const internalTask = cliTaskToTask(task);
    const taskProfile = analyzeTask(internalTask);
    const context = taskProfileToBanditContext(taskProfile);
    this.linucbBandit.update(armIndex, context, reward);
    this.logger.debug('Recorded outcome', { cliName, reward });
  }

  recordPreference(
    query: string,
    strongModelPreferred: boolean,
    quality?: { strong?: number; weak?: number }
  ): void {
    if (this.preferenceRouter === undefined) {
      this.logger.warn('Preference routing not enabled, cannot record preference');
      return;
    }
    this.preferenceRouter.recordPreference(
      query,
      strongModelPreferred,
      quality?.strong,
      quality?.weak
    );
    this.logger.debug('Recorded preference', { strongModelPreferred });
  }

  hasMinimumPreferenceData(): boolean {
    if (this.preferenceRouter === undefined) return false;
    return this.preferenceRouter.hasMinimumData();
  }

  /** Records a difficulty outcome for ZeroRouter calibration. */
  recordDifficultyOutcome(task: CliTask, success: boolean, qualityScore?: number): void {
    if (this.zeroRouter === undefined) {
      this.logger.debug('ZeroRouter not enabled, skipping difficulty outcome');
      return;
    }
    const { difficulty, selectedCli } = this.getDifficultyInfo(task);
    const outcome = buildDifficultyOutcome(
      task.content,
      difficulty,
      selectedCli,
      success,
      qualityScore
    );
    this.zeroRouter.calibrate(outcome);
    this.logger.debug('Recorded difficulty outcome', {
      difficulty: difficulty.toFixed(3),
      success,
      qualityScore,
    });
  }

  private getDifficultyInfo(task: CliTask): { difficulty: number; selectedCli: CliName } {
    if (this.lastRoutedTask?.task.content === task.content) {
      return {
        difficulty: this.lastRoutedTask.difficulty,
        selectedCli: this.lastRoutedTask.selectedCli,
      };
    }
    // This is only called when zeroRouter is defined (checked in caller)
    if (this.zeroRouter === undefined) return { difficulty: 0.5, selectedCli: 'claude' };
    const estimate = this.zeroRouter.estimateDifficulty(task);
    return { difficulty: estimate.aggregateScore, selectedCli: 'claude' };
  }

  /**
   * Gets the ZeroRouter instance for direct access to calibration stats.
   */
  getZeroRouter(): IZeroRouter | undefined {
    return this.zeroRouter;
  }

  getStats(): CompositeRouterStats {
    const preferenceStats = this.buildPreferenceStats();
    const baseStats = {
      totalDecisions: this.totalDecisions,
      decisionsPerCli: { ...this.decisionsPerCli },
      avgDecisionTimeMs:
        this.totalDecisions > 0 ? this.totalDecisionTimeMs / this.totalDecisions : 0,
      budgetRejectionRate:
        this.totalDecisions > 0 ? this.budgetRejections / this.totalDecisions : 0,
      banditStats: this.linucbBandit?.getStats() ?? [],
    };

    // Conditionally add preferenceStats only if preference routing is enabled
    if (preferenceStats !== undefined) {
      return { ...baseStats, preferenceStats };
    }
    return baseStats;
  }

  private buildPreferenceStats(): CompositeRouterStats['preferenceStats'] {
    if (!this.config.enablePreferenceRouting || this.preferenceRouter === undefined) {
      return undefined;
    }

    const stats = this.preferenceRouter.getStats();
    return {
      enabled: true,
      hasSufficientData: this.preferenceRouter.hasMinimumData(),
      dataPointCount: stats.totalDataPoints,
      strongModelPreferenceRate: stats.strongModelPreferenceRate,
    };
  }
}

/**
 * Creates a CompositeRouter instance.
 */
export function createCompositeRouter(
  adapters: Map<CliName, ICliAdapter>,
  config?: Partial<CompositeRouterConfig>,
  logger?: ILogger
): ICompositeRouter {
  return new CompositeRouter(adapters, config, logger);
}
