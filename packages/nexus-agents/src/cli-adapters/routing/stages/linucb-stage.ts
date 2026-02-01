/**
 * LinUCB Bandit Stage
 *
 * Adapts LinUCBBandit to the IRouterStage interface for pipeline composition.
 * Uses contextual bandit learning for adaptive model selection.
 *
 * @module cli-adapters/routing/stages/linucb-stage
 * (Source: ADR-0005, Issue #102, arXiv:2401.02987 - PILOT)
 */

import type { Result } from '../../../core/result.js';
import type { ILogger } from '../../../core/index.js';
import { ok, createLogger, getTimeProvider } from '../../../core/index.js';
import { clamp01 } from '../../../utils/math-utils.js';
import type {
  IRouterStage,
  RoutingContext,
  StageResult,
  StageError,
  RoutingOutcome,
  CliName,
} from '../router-stage.js';
import { addTrace, updateScore, getRemainingCandidates } from '../router-stage.js';
import { LinUCBBandit } from '../../linucb-bandit.js';
import type { BanditContext, LinUCBConfig } from '../../budget-router-types.js';

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configuration for the LinUCB stage.
 */
export interface LinUCBStageConfig {
  /** LinUCB configuration */
  readonly banditConfig?: Partial<LinUCBConfig>;
  /** Weight to apply to bandit scores (0-1) */
  readonly scoreWeight: number;
  /** Minimum pulls before trusting bandit */
  readonly minPullsForConfidence: number;
}

const DEFAULT_CONFIG: LinUCBStageConfig = {
  scoreWeight: 0.2,
  minPullsForConfidence: 5,
};

/** Available CLIs for bandit arms */
const CLI_ARMS: readonly CliName[] = ['claude', 'gemini', 'codex'];

// ============================================================================
// Stage Implementation
// ============================================================================

/**
 * LinUCB Stage for bandit-based adaptive model selection.
 */
export class LinUCBStage implements IRouterStage {
  readonly name = 'linucb-bandit';
  readonly priority = 70; // Runs after TOPSIS

  private readonly config: LinUCBStageConfig;
  private readonly bandit: LinUCBBandit;
  private readonly logger: ILogger;
  private routingsCount = 0;
  private totalExploration = 0;

  constructor(config: Partial<LinUCBStageConfig> = {}, logger?: ILogger) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.bandit = new LinUCBBandit(CLI_ARMS, this.config.banditConfig);
    this.logger = logger ?? createLogger({ component: 'LinUCBStage' });
  }

  canHandle(ctx: RoutingContext): boolean {
    return getRemainingCandidates(ctx).length > 0 && ctx.task.length > 0;
  }

  route(ctx: RoutingContext): Promise<Result<StageResult, StageError>> {
    const time = getTimeProvider();
    const startTime = time.now();
    const remaining = getRemainingCandidates(ctx);

    this.routingsCount++;

    // Build bandit context from task and routing context
    const banditContext = this.buildBanditContext(ctx);

    // Get bandit selection
    const selection = this.bandit.select(banditContext);
    const selectedCli = selection.armName as CliName;

    // Score candidates based on bandit UCB scores
    let updatedCtx = ctx;
    const scores = this.scoreCandidates(remaining, selectedCli, selection.ucbScore);

    for (const { cli, score } of scores) {
      updatedCtx = updateScore(updatedCtx, cli, score);
    }

    // Track exploration vs exploitation
    const isExploration = !remaining.includes(selectedCli);
    if (isExploration) this.totalExploration++;

    const signals = [...ctx.signals];
    signals.push(`linucb:selected-${selectedCli}`);
    signals.push(`linucb:ucb-${selection.ucbScore.toFixed(2)}`);
    if (isExploration) signals.push('linucb:exploring');

    const durationMs = time.now() - startTime;

    updatedCtx = addTrace(
      updatedCtx,
      this.name,
      durationMs,
      'score',
      `Selected: ${selectedCli}, UCB: ${selection.ucbScore.toFixed(3)}`
    );

    this.logger.debug('LinUCB scoring complete', {
      selected: selectedCli,
      ucbScore: selection.ucbScore.toFixed(3),
      isExploration,
    });

    return Promise.resolve(ok({ context: { ...updatedCtx, signals }, continuesPipeline: true }));
  }

  recordOutcome(outcome: RoutingOutcome): void {
    // Find arm index for the selected CLI
    const armIndex = CLI_ARMS.indexOf(outcome.selectedCli);
    if (armIndex === -1) return;

    // Build context from outcome
    const banditContext = this.buildOutcomeContext(outcome);

    // Calculate reward (0-1 scale)
    const reward = this.calculateReward(outcome);

    // Update bandit
    this.bandit.update(armIndex, banditContext, reward);

    this.logger.debug('LinUCB outcome recorded', {
      cli: outcome.selectedCli,
      reward: reward.toFixed(3),
      success: outcome.success,
    });
  }

  getStats(): Record<string, unknown> {
    const armStats = this.bandit.getStats();
    const totalPulls = armStats.reduce((sum, s) => sum + s.pullCount, 0);
    const totalReward = armStats.reduce((sum, s) => sum + s.avgReward * s.pullCount, 0);
    const avgReward = totalPulls > 0 ? totalReward / totalPulls : 0;

    return {
      routingsCount: this.routingsCount,
      explorationRate: this.routingsCount > 0 ? this.totalExploration / this.routingsCount : 0,
      bandit: {
        totalPulls,
        avgReward,
        armStats: armStats.map((s) => ({
          name: s.name,
          pulls: s.pullCount,
          avgReward: s.avgReward,
        })),
      },
      config: {
        scoreWeight: this.config.scoreWeight,
        minPullsForConfidence: this.config.minPullsForConfidence,
      },
    };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Build bandit context from routing context.
   */
  private buildBanditContext(ctx: RoutingContext): BanditContext {
    const isCodeTask = this.isCodeRelated(ctx.task) ? 1 : 0;
    const isReasoningTask = this.isReasoningRelated(ctx.task) ? 1 : 0;
    return {
      taskComplexity: this.estimateComplexity(ctx.task),
      contextLengthNormalized: Math.min(1, ctx.task.length / 10000),
      isCodeTask,
      isReasoningTask,
      budgetUtilization: this.extractBudgetUtilization(ctx.signals),
      timePressure: 0.5, // Default medium pressure
    };
  }

  /**
   * Build bandit context from outcome.
   */
  private buildOutcomeContext(outcome: RoutingOutcome): BanditContext {
    const isCodeTask = this.isCodeRelated(outcome.task) ? 1 : 0;
    const isReasoningTask = this.isReasoningRelated(outcome.task) ? 1 : 0;
    return {
      taskComplexity: this.estimateComplexity(outcome.task),
      contextLengthNormalized: Math.min(1, outcome.task.length / 10000),
      isCodeTask,
      isReasoningTask,
      budgetUtilization: 0.5,
      timePressure: 0.5,
    };
  }

  /**
   * Estimate task complexity from content.
   */
  private estimateComplexity(task: string): number {
    // Simple heuristic based on length and special tokens
    const length = task.length;
    const codeIndicators = (task.match(/```|function|class|import|const|let|var/g) ?? []).length;
    const complexity = Math.min(1, (length / 2000) * 0.5 + (codeIndicators / 10) * 0.5);
    return complexity;
  }

  /**
   * Check if task is code-related.
   */
  private isCodeRelated(task: string): boolean {
    const codePatterns = /```|function|class|import|const|let|var|def |return |async |await /i;
    return codePatterns.test(task);
  }

  /**
   * Check if task is reasoning-related.
   */
  private isReasoningRelated(task: string): boolean {
    const reasoningPatterns = /explain|why|how|analyze|compare|evaluate|reason|think|consider/i;
    return reasoningPatterns.test(task);
  }

  /**
   * Extract budget utilization from signals.
   */
  private extractBudgetUtilization(signals: string[]): number {
    const budgetSignal = signals.find((s) => s.startsWith('budget:utilization-'));
    if (budgetSignal !== undefined) {
      const value = parseFloat(budgetSignal.replace('budget:utilization-', ''));
      if (!isNaN(value)) return value;
    }
    return 0.5; // Default
  }

  /**
   * Score candidates based on bandit selection.
   */
  private scoreCandidates(
    candidates: CliName[],
    selectedCli: CliName,
    ucbScore: number
  ): Array<{ cli: CliName; score: number }> {
    return candidates.map((cli) => ({
      cli,
      score: this.calculateBanditScore(cli, selectedCli, ucbScore),
    }));
  }

  /**
   * Calculate bandit score for a CLI.
   */
  private calculateBanditScore(cli: CliName, selectedCli: CliName, ucbScore: number): number {
    const isSelected = cli === selectedCli;
    // Selected CLI gets UCB score, others get reduced score
    const baseScore = isSelected ? ucbScore : ucbScore * 0.5;
    return Math.min(1, baseScore) * this.config.scoreWeight;
  }

  /**
   * Calculate reward from outcome (0-1 scale).
   */
  private calculateReward(outcome: RoutingOutcome): number {
    if (!outcome.success) return 0.1; // Small reward for trying

    let reward = 0.5; // Base reward for success

    // Bonus for quality
    if (outcome.qualityScore !== undefined) {
      reward += outcome.qualityScore * 0.3;
    }

    // Penalty for slow responses (if latency data available)
    if (outcome.latencyMs !== undefined) {
      const latencyPenalty = Math.min(0.2, (outcome.latencyMs / 30000) * 0.2);
      reward -= latencyPenalty;
    }

    return clamp01(reward);
  }
}

/**
 * Creates a LinUCB stage.
 */
export function createLinUCBStage(
  config?: Partial<LinUCBStageConfig>,
  logger?: ILogger
): LinUCBStage {
  return new LinUCBStage(config, logger);
}
