/**
 * Budget Filter Stage
 *
 * Adapts BudgetRouter to the IRouterStage interface for pipeline composition.
 * Filters candidates based on cost and token budget constraints.
 *
 * @module cli-adapters/routing/stages/budget-stage
 * (Source: ADR-0005, arXiv:2508.21141 - PILOT pattern)
 */

import type { Result } from '../../../core/result.js';
import type { ILogger } from '../../../core/index.js';
import { ok, createLogger, getTimeProvider } from '../../../core/index.js';
import type {
  IRouterStage,
  RoutingContext,
  StageResult,
  StageError,
  RoutingOutcome,
  CliName,
} from '../router-stage.js';
import { addTrace, filterCandidate, getRemainingCandidates } from '../router-stage.js';

// ============================================================================
// Configuration
// ============================================================================

/**
 * Cost per 1K tokens for each CLI (approximate).
 */
const COST_PER_1K_TOKENS: Record<CliName, { input: number; output: number }> = {
  claude: { input: 0.015, output: 0.075 },
  gemini: { input: 0.00125, output: 0.005 },
  codex: { input: 0.003, output: 0.015 },
};

/**
 * Configuration for the budget filter stage.
 */
export interface BudgetStageConfig {
  /** Maximum cost per task in USD */
  readonly maxCostUsd: number;
  /** Maximum tokens per task */
  readonly maxTokens: number;
  /** Expected input tokens (for estimation) */
  readonly expectedInputTokens: number;
  /** Expected output tokens (for estimation) */
  readonly expectedOutputTokens: number;
  /** Whether to enforce hard limits (filter out) vs soft limits (warn only) */
  readonly enforceHardLimits: boolean;
}

const DEFAULT_CONFIG: BudgetStageConfig = {
  maxCostUsd: 1.0,
  maxTokens: 100000,
  expectedInputTokens: 1000,
  expectedOutputTokens: 500,
  enforceHardLimits: true,
};

// ============================================================================
// Types
// ============================================================================

interface CostEstimate {
  cli: CliName;
  cost: number;
  tokens: number;
}

interface FilterResult {
  context: RoutingContext;
  eligible: CliName[];
}

// ============================================================================
// Stage Implementation
// ============================================================================

/**
 * Budget Filter Stage for cost-aware CLI selection.
 */
export class BudgetFilterStage implements IRouterStage {
  readonly name = 'budget-filter';
  readonly priority = 20; // Runs early to filter expensive options

  private readonly config: BudgetStageConfig;
  private readonly logger: ILogger;
  private routingsCount = 0;
  private filteredCount = 0;
  private totalCostEstimate = 0;

  constructor(config: Partial<BudgetStageConfig> = {}, logger?: ILogger) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger ?? createLogger({ component: 'BudgetFilterStage' });
  }

  canHandle(ctx: RoutingContext): boolean {
    return getRemainingCandidates(ctx).length > 0;
  }

  route(ctx: RoutingContext): Promise<Result<StageResult, StageError>> {
    const time = getTimeProvider();
    const startTime = time.now();
    const remaining = getRemainingCandidates(ctx);

    this.routingsCount++;

    const estimates = this.estimateAllCosts(remaining);
    const { context: updatedCtx, eligible } = this.filterByBudget(ctx, estimates);
    const signals = this.buildSignals(ctx.signals, remaining.length, eligible.length, estimates);
    const cheapest = this.findCheapest(estimates);
    const durationMs = time.now() - startTime;

    const finalCtx = addTrace(
      updatedCtx,
      this.name,
      durationMs,
      'filter',
      `Eligible: ${String(eligible.length)}/${String(remaining.length)}, cheapest: ${cheapest?.cli ?? 'none'}`
    );

    this.logger.debug('Budget filter complete', {
      eligible: eligible.length,
      filtered: remaining.length - eligible.length,
      cheapest: cheapest?.cli,
    });

    return Promise.resolve(
      ok({ context: { ...finalCtx, signals }, continuesPipeline: eligible.length > 0 })
    );
  }

  /**
   * Record outcome for future cost calibration.
   */
  recordOutcome(outcome: RoutingOutcome): void {
    this.logger.debug('Budget outcome recorded', {
      cli: outcome.selectedCli,
      success: outcome.success,
      tokensUsed: outcome.tokensUsed,
    });
    // Future: Track actual vs estimated costs for calibration
  }

  /**
   * Get stage statistics.
   */
  getStats(): Record<string, unknown> {
    return {
      routingsCount: this.routingsCount,
      filteredCount: this.filteredCount,
      filterRate: this.routingsCount > 0 ? this.filteredCount / this.routingsCount : 0,
      avgCostEstimate: this.routingsCount > 0 ? this.totalCostEstimate / this.routingsCount : 0,
      config: {
        maxCostUsd: this.config.maxCostUsd,
        maxTokens: this.config.maxTokens,
        enforceHardLimits: this.config.enforceHardLimits,
      },
    };
  }

  /**
   * Estimate cost for a CLI based on expected tokens.
   */
  private estimateCost(cli: CliName): number {
    const rates = COST_PER_1K_TOKENS[cli];
    const inputCost = (this.config.expectedInputTokens / 1000) * rates.input;
    const outputCost = (this.config.expectedOutputTokens / 1000) * rates.output;
    return inputCost + outputCost;
  }

  /**
   * Estimate costs for all candidates.
   */
  private estimateAllCosts(candidates: CliName[]): CostEstimate[] {
    return candidates.map((cli) => ({
      cli,
      cost: this.estimateCost(cli),
      tokens: this.config.expectedInputTokens + this.config.expectedOutputTokens,
    }));
  }

  /**
   * Filter candidates by budget constraints.
   */
  private filterByBudget(ctx: RoutingContext, estimates: CostEstimate[]): FilterResult {
    let updatedCtx = ctx;
    const eligible: CliName[] = [];

    for (const estimate of estimates) {
      const withinBudget =
        estimate.cost <= this.config.maxCostUsd && estimate.tokens <= this.config.maxTokens;

      if (!withinBudget && this.config.enforceHardLimits) {
        updatedCtx = filterCandidate(
          updatedCtx,
          estimate.cli,
          `Exceeds budget: $${estimate.cost.toFixed(4)} > $${this.config.maxCostUsd.toFixed(2)}`
        );
        this.filteredCount++;
      } else {
        eligible.push(estimate.cli);
        this.totalCostEstimate += estimate.cost;
      }
    }

    return { context: updatedCtx, eligible };
  }

  /**
   * Build routing signals for the context.
   */
  private buildSignals(
    existing: string[],
    totalCount: number,
    eligibleCount: number,
    estimates: CostEstimate[]
  ): string[] {
    const signals = [...existing];

    if (eligibleCount < totalCount) {
      signals.push(`budget:filtered-${String(totalCount - eligibleCount)}`);
    }

    const cheapest = this.findCheapest(estimates);
    if (cheapest !== undefined) {
      signals.push(`budget:cheapest-${cheapest.cli}`);
    }

    // Emit budget utilization for ResourceStrategyStage (Issue #998)
    const avgCost = this.computeAverageCost(estimates);
    if (this.config.maxCostUsd > 0) {
      const utilization = Math.min(1, avgCost / this.config.maxCostUsd);
      signals.push(`budget:utilization=${utilization.toFixed(4)}`);
    }

    return signals;
  }

  /** Computes average cost across all estimates. */
  private computeAverageCost(estimates: CostEstimate[]): number {
    if (estimates.length === 0) return 0;
    const total = estimates.reduce((sum, e) => sum + e.cost, 0);
    return total / estimates.length;
  }

  /**
   * Find the cheapest CLI option.
   */
  private findCheapest(estimates: CostEstimate[]): CostEstimate | undefined {
    return [...estimates].sort((a, b) => a.cost - b.cost)[0];
  }
}

/**
 * Creates a budget filter stage.
 */
export function createBudgetStage(
  config?: Partial<BudgetStageConfig>,
  logger?: ILogger
): BudgetFilterStage {
  return new BudgetFilterStage(config, logger);
}
