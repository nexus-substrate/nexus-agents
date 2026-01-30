/**
 * Budget-constrained task router implementation.
 * Based on PILOT pattern (arXiv:2508.21141) for cost-efficient task routing.
 *
 * Routes tasks with respect to token, cost, and latency budgets.
 * Provides budget tracking, warnings, and enforcement options.
 *
 * @module cli-adapters/budget-router
 * (Source: Issue #102, arXiv:2508.21141 - EMNLP 2025)
 */

import type { Result } from '../core/index.js';
import { getTimeProvider } from '../core/index.js';
import { createLogger } from '../core/logger.js';
import type {
  IBudgetRouter,
  BudgetConstraint,
  SessionBudget,
  BudgetExceededError,
  BudgetWarning,
  BudgetRoutingResult,
  BudgetRouterOptions,
  CliTask,
  CliResponse,
  CliError,
  CliName,
  ICliAdapter,
} from './types.js';
import { DEFAULT_CAPABILITIES } from './types.js';
import { estimateTokens, estimateCost } from './budget-utils.js';
import { generateBudgetWarnings } from './budget-warnings.js';
import { createBudgetExceededError } from './budget-errors.js';

const logger = createLogger({ component: 'budget-router' });

/**
 * Default budget router configuration.
 */
const DEFAULT_OPTIONS: Required<BudgetRouterOptions> = {
  defaultConstraints: {
    maxTokens: 100000,
    maxCostUsd: 1.0,
    maxLatencyMs: 60000,
  },
  sessionBudget: {
    tokenBudget: 1000000,
    costBudgetUsd: 10.0,
    resetIntervalMs: 3600000, // 1 hour
  },
  warningThresholds: {
    info: 50,
    warning: 75,
    critical: 90,
  },
  enforceHardLimits: true,
};

/**
 * Budget-constrained task router.
 * Implements budget-aware routing with session tracking and enforcement.
 */
export class BudgetRouter implements IBudgetRouter {
  private readonly adapters: Map<CliName, ICliAdapter>;
  private readonly options: Required<BudgetRouterOptions>;
  private tokensUsed = 0;
  private costSpentUsd = 0;
  private sessionStartedAt: Date;
  private resetTimer?: ReturnType<typeof setTimeout>;

  constructor(adapters: Map<CliName, ICliAdapter>, options?: BudgetRouterOptions) {
    this.adapters = adapters;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.sessionStartedAt = new Date(getTimeProvider().now());

    // Set up auto-reset timer if configured
    const resetInterval = this.options.sessionBudget.resetIntervalMs ?? 3600000;
    if (resetInterval > 0) {
      this.scheduleReset();
    }
  }

  /**
   * Get current session budget status.
   */
  getSessionBudget(): SessionBudget {
    const sessionBudget = this.options.sessionBudget;
    const tokenBudget = sessionBudget.tokenBudget ?? 1000000;
    const costBudgetUsd = sessionBudget.costBudgetUsd ?? 10.0;
    const resetIntervalMs = sessionBudget.resetIntervalMs ?? 3600000;

    const tokensRemaining = Math.max(0, tokenBudget - this.tokensUsed);
    const costRemainingUsd = Math.max(0, costBudgetUsd - this.costSpentUsd);

    const tokenUtilization = tokenBudget > 0 ? (this.tokensUsed / tokenBudget) * 100 : 0;
    const costUtilization = costBudgetUsd > 0 ? (this.costSpentUsd / costBudgetUsd) * 100 : 0;
    const utilizationPercent = Math.max(tokenUtilization, costUtilization);

    const resetsAt =
      resetIntervalMs > 0 ? new Date(this.sessionStartedAt.getTime() + resetIntervalMs) : undefined;

    const result: SessionBudget = {
      tokenBudget,
      costBudgetUsd,
      tokensUsed: this.tokensUsed,
      costSpentUsd: this.costSpentUsd,
      tokensRemaining,
      costRemainingUsd,
      utilizationPercent,
      startedAt: this.sessionStartedAt,
    };

    if (resetsAt !== undefined) {
      return { ...result, resetsAt };
    }
    return result;
  }

  /**
   * Update session budget after task completion.
   */
  updateBudget(usage: { tokens?: number; costUsd?: number }): void {
    if (usage.tokens !== undefined) {
      this.tokensUsed += usage.tokens;
    }
    if (usage.costUsd !== undefined) {
      this.costSpentUsd += usage.costUsd;
    }

    logger.debug('Budget updated', {
      tokensUsed: this.tokensUsed,
      costSpentUsd: this.costSpentUsd,
    });
  }

  /**
   * Reset session budget.
   */
  resetBudget(): void {
    this.tokensUsed = 0;
    this.costSpentUsd = 0;
    this.sessionStartedAt = new Date(getTimeProvider().now());
    logger.info('Budget reset');

    // Reschedule reset timer
    const resetInterval = this.options.sessionBudget.resetIntervalMs ?? 3600000;
    if (resetInterval > 0) {
      this.scheduleReset();
    }
  }

  /**
   * Check if task is within budget constraints.
   */
  checkBudget(task: CliTask, constraint?: BudgetConstraint): BudgetRoutingResult {
    const budget = { ...this.options.defaultConstraints, ...constraint };

    // Estimate tokens for this task
    const estimatedInputTokens = estimateTokens(task.content);
    const estimatedOutputTokens = task.maxTokens ?? estimatedInputTokens * 2;
    const estimatedTokens = estimatedInputTokens + estimatedOutputTokens;

    // Find the best adapter within budget
    const adapter = this.selectAdapterWithinBudget(budget, estimatedTokens);
    const estimatedCostUsd = adapter
      ? estimateCost(adapter.name, estimatedInputTokens, estimatedOutputTokens)
      : 0;

    // Check budget constraints
    const currentBudget = this.getSessionBudget();
    const withinBudget = this.checkConstraints(budget, estimatedTokens, estimatedCostUsd);

    // Generate warnings
    const warnings = generateBudgetWarnings(
      currentBudget,
      estimatedTokens,
      estimatedCostUsd,
      this.options.warningThresholds
    );

    // Project budget after task
    const projectedBudget = this.projectBudget(estimatedTokens, estimatedCostUsd);

    return {
      adapter,
      withinBudget,
      estimatedCostUsd,
      estimatedTokens,
      warnings,
      projectedBudget,
    };
  }

  /**
   * Route task with budget awareness.
   */
  routeWithBudget(
    task: CliTask,
    budget?: BudgetConstraint
  ): Promise<Result<BudgetRoutingResult, BudgetExceededError>> {
    const result = this.checkBudget(task, budget);

    if (!result.withinBudget && this.options.enforceHardLimits) {
      const currentBudget = this.getSessionBudget();
      const error = createBudgetExceededError(
        budget ?? this.options.defaultConstraints,
        result,
        currentBudget
      );
      return Promise.resolve({ ok: false, error });
    }

    logger.debug('Budget routing decision', {
      withinBudget: result.withinBudget,
      adapter: result.adapter?.name,
      estimatedCost: result.estimatedCostUsd,
      warnings: result.warnings.length,
    });

    return Promise.resolve({ ok: true, value: result });
  }

  /**
   * Execute task with budget tracking.
   */
  async executeWithBudget(
    task: CliTask,
    budget?: BudgetConstraint
  ): Promise<Result<CliResponse & { budgetAfter: SessionBudget }, CliError>> {
    // First, route with budget check
    const routingResult = await this.routeWithBudget(task, budget);
    if (!routingResult.ok) {
      return routingResult;
    }

    const { adapter, estimatedTokens, estimatedCostUsd, warnings } = routingResult.value;
    if (!adapter) {
      return this.createNoAdapterError();
    }

    this.logWarnings(warnings);

    // Execute the task
    const result = await this.executeAndTrack(adapter, task, estimatedTokens, estimatedCostUsd);
    return result;
  }

  private createNoAdapterError(): Result<CliResponse & { budgetAfter: SessionBudget }, CliError> {
    return {
      ok: false,
      error: {
        code: 'NOT_FOUND',
        message: 'No adapter available within budget constraints',
        cli: 'claude' as CliName,
        retryable: false,
      },
    };
  }

  private logWarnings(warnings: readonly BudgetWarning[]): void {
    for (const warning of warnings) {
      if (warning.level === 'critical') {
        logger.warn('Budget critical warning', { warning });
      } else {
        logger.debug('Budget warning', { warning });
      }
    }
  }

  private async executeAndTrack(
    adapter: ICliAdapter,
    task: CliTask,
    estimatedTokens: number,
    estimatedCostUsd: number
  ): Promise<Result<CliResponse & { budgetAfter: SessionBudget }, CliError>> {
    const startTime = getTimeProvider().now();
    const result = await adapter.execute(task);

    if (!result.ok) {
      return result;
    }

    const actualTokens = result.value.usage?.totalTokens ?? estimatedTokens;
    const actualCostUsd = result.value.costUsd ?? estimatedCostUsd;

    this.updateBudget({ tokens: actualTokens, costUsd: actualCostUsd });

    const budgetAfter = this.getSessionBudget();
    const durationMs = getTimeProvider().now() - startTime;

    logger.info('Task executed with budget tracking', {
      adapter: adapter.name,
      actualTokens,
      actualCostUsd,
      durationMs,
      budgetUtilization: Math.round(budgetAfter.utilizationPercent),
    });

    return { ok: true, value: { ...result.value, durationMs, budgetAfter } };
  }

  /**
   * Clean up resources.
   */
  dispose(): void {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
    }
  }

  // Private helpers

  private scheduleReset(): void {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
    }
    const resetInterval = this.options.sessionBudget.resetIntervalMs ?? 3600000;
    this.resetTimer = setTimeout(() => {
      this.resetBudget();
    }, resetInterval);
  }

  private selectAdapterWithinBudget(
    budget: BudgetConstraint,
    estimatedTokens: number
  ): ICliAdapter | null {
    // Sort adapters by cost efficiency (higher = cheaper)
    const sortedAdapters = Array.from(this.adapters.entries()).sort((a, b) => {
      const capA = DEFAULT_CAPABILITIES[a[0]];
      const capB = DEFAULT_CAPABILITIES[b[0]];
      return capB.cost - capA.cost; // Prefer cheaper models
    });

    for (const [name, adapter] of sortedAdapters) {
      const estimatedCost = estimateCost(name, estimatedTokens / 2, estimatedTokens / 2);
      const caps = DEFAULT_CAPABILITIES[name];

      // Check if adapter can handle the task within budget
      const withinTokenBudget =
        budget.maxTokens === undefined || estimatedTokens <= budget.maxTokens;
      const withinCostBudget =
        budget.maxCostUsd === undefined || estimatedCost <= budget.maxCostUsd;
      const withinContextWindow = estimatedTokens <= caps.contextWindow;

      if (withinTokenBudget && withinCostBudget && withinContextWindow) {
        return adapter;
      }
    }

    return null;
  }

  private checkConstraints(
    budget: BudgetConstraint,
    estimatedTokens: number,
    estimatedCostUsd: number
  ): boolean {
    const currentBudget = this.getSessionBudget();

    // Check per-task constraints
    if (budget.maxTokens !== undefined && estimatedTokens > budget.maxTokens) {
      return false;
    }
    if (budget.maxCostUsd !== undefined && estimatedCostUsd > budget.maxCostUsd) {
      return false;
    }

    // Check session budget
    if (currentBudget.tokensRemaining < estimatedTokens) {
      return false;
    }
    if (currentBudget.costRemainingUsd < estimatedCostUsd) {
      return false;
    }

    return true;
  }

  private projectBudget(estimatedTokens: number, estimatedCostUsd: number): SessionBudget {
    const current = this.getSessionBudget();
    return {
      ...current,
      tokensUsed: current.tokensUsed + estimatedTokens,
      costSpentUsd: current.costSpentUsd + estimatedCostUsd,
      tokensRemaining: Math.max(0, current.tokensRemaining - estimatedTokens),
      costRemainingUsd: Math.max(0, current.costRemainingUsd - estimatedCostUsd),
      utilizationPercent: Math.max(
        ((current.tokensUsed + estimatedTokens) / current.tokenBudget) * 100,
        ((current.costSpentUsd + estimatedCostUsd) / current.costBudgetUsd) * 100
      ),
    };
  }
}

/** Create a budget router instance. */
export function createBudgetRouter(
  adapters: Map<CliName, ICliAdapter>,
  opts?: BudgetRouterOptions
): IBudgetRouter {
  return new BudgetRouter(adapters, opts);
}
