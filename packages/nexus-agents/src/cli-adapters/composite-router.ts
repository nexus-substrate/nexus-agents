/**
 * CompositeRouter: Chains Budget -> ZeroRouter -> Preference -> TOPSIS -> LinUCB.
 * @module cli-adapters/composite-router
 * (Source: Issue #166, Epic #164, Issue #347, arXiv:2509.07571)
 */
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
import {
  CompositeRouterConfigSchema,
  CompositeRoutingError,
  type CompositeRouterConfig,
  type CompositeRouterConfigWithPreference,
  type CompositeRoutingDecision,
  type CompositeRouterStats,
  type BuildDecisionParams,
  type PipelineResult,
} from './composite-router-types.js';
import { buildDecisionFields } from './composite-router-helpers.js';
import {
  analyzeTaskProfile,
  runPipeline,
  type StageDependencies,
} from './composite-router-stages.js';
import {
  recordBanditOutcome,
  recordPreferenceSignal,
  recordZeroRouterOutcome,
  hasMinimumPreferenceData,
  type LastRoutedTaskInfo,
  type OutcomeDependencies,
} from './composite-router-outcome.js';

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
  private lastRoutedTask?: LastRoutedTaskInfo;

  constructor(
    adapters: Map<CliName, ICliAdapter>,
    config?: Partial<CompositeRouterConfigWithPreference>,
    logger?: ILogger
  ) {
    const { preferenceRouterConfig, zeroRouterConfig, ...baseConfig } = config ?? {};
    this.config = CompositeRouterConfigSchema.parse(baseConfig);
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
      const taskProfile = analyzeTaskProfile(task, stagesExecuted);
      const deps = this.getStageDependencies();
      const pipelineResult = runPipeline(task, taskProfile, stagesExecuted, this.cliNames, deps);
      if (!pipelineResult.ok) {
        if (pipelineResult.error.stage === 'budget-filter') this.budgetRejections++;
        return pipelineResult;
      }

      this.trackLastRoutedTask(task, pipelineResult.value);

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

  private getStageDependencies(): StageDependencies {
    return {
      config: this.config,
      logger: this.logger,
      cliNames: this.cliNames,
      budgetRouter: this.budgetRouter,
      zeroRouter: this.zeroRouter,
      preferenceRouter: this.preferenceRouter,
      topsisRouter: this.topsisRouter,
      linucbBandit: this.linucbBandit,
    };
  }

  private trackLastRoutedTask(task: CliTask, result: PipelineResult): void {
    if (result.difficultyEstimate !== undefined) {
      this.lastRoutedTask = {
        task,
        selectedCli: result.selectedCli,
        difficulty: result.difficultyEstimate.aggregateScore,
      };
    }
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
    recordBanditOutcome(cliName, task, reward, this.getOutcomeDependencies());
  }

  recordPreference(
    query: string,
    strongModelPreferred: boolean,
    quality?: { strong?: number; weak?: number }
  ): void {
    recordPreferenceSignal(query, strongModelPreferred, quality, this.getOutcomeDependencies());
  }

  recordDifficultyOutcome(task: CliTask, success: boolean, qualityScore?: number): void {
    recordZeroRouterOutcome(task, success, qualityScore, this.getOutcomeDependencies());
  }

  hasMinimumPreferenceData(): boolean {
    return hasMinimumPreferenceData(this.getOutcomeDependencies());
  }

  private getOutcomeDependencies(): OutcomeDependencies {
    return {
      logger: this.logger,
      cliNames: this.cliNames,
      linucbBandit: this.linucbBandit,
      preferenceRouter: this.preferenceRouter,
      zeroRouter: this.zeroRouter,
      lastRoutedTask: this.lastRoutedTask,
    };
  }

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

/** Creates a CompositeRouter instance. */
export function createCompositeRouter(
  adapters: Map<CliName, ICliAdapter>,
  config?: Partial<CompositeRouterConfig>,
  logger?: ILogger
): ICompositeRouter {
  return new CompositeRouter(adapters, config, logger);
}
