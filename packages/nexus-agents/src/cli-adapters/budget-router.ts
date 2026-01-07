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
 * Token cost estimates per 1M tokens (USD).
 * Based on public pricing as of 2025-01.
 */
const TOKEN_COSTS: Record<CliName, { input: number; output: number }> = {
  claude: { input: 3.0, output: 15.0 },
  gemini: { input: 0.075, output: 0.3 },
  codex: { input: 2.5, output: 10.0 },
};

/**
 * Estimate tokens from task content.
 * Uses rough approximation of 4 characters per token.
 */
function estimateTokens(content: string): number {
  return Math.ceil(content.length / 4);
}

/**
 * Estimate cost for a task based on estimated tokens.
 */
function estimateCost(model: CliName, inputTokens: number, outputTokens: number): number {
  const costs = TOKEN_COSTS[model];
  const inputCost = (inputTokens / 1_000_000) * costs.input;
  const outputCost = (outputTokens / 1_000_000) * costs.output;
  return inputCost + outputCost;
}

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
    this.sessionStartedAt = new Date();

    // Set up auto-reset timer if configured
    if (this.options.sessionBudget.resetIntervalMs > 0) {
      this.scheduleReset();
    }
  }

  /**
   * Get current session budget status.
   */
  getSessionBudget(): SessionBudget {
    const { tokenBudget, costBudgetUsd, resetIntervalMs } = this.options.sessionBudget;
    const tokensRemaining = Math.max(0, tokenBudget - this.tokensUsed);
    const costRemainingUsd = Math.max(0, costBudgetUsd - this.costSpentUsd);

    const tokenUtilization = tokenBudget > 0 ? (this.tokensUsed / tokenBudget) * 100 : 0;
    const costUtilization = costBudgetUsd > 0 ? (this.costSpentUsd / costBudgetUsd) * 100 : 0;
    const utilizationPercent = Math.max(tokenUtilization, costUtilization);

    const interval = resetIntervalMs ?? 0;
    const resetsAt =
      interval > 0 ? new Date(this.sessionStartedAt.getTime() + interval) : undefined;

    return {
      tokenBudget,
      costBudgetUsd,
      tokensUsed: this.tokensUsed,
      costSpentUsd: this.costSpentUsd,
      tokensRemaining,
      costRemainingUsd,
      utilizationPercent,
      startedAt: this.sessionStartedAt,
      resetsAt,
    };
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
    this.sessionStartedAt = new Date();
    logger.info('Budget reset');

    // Reschedule reset timer
    if (this.options.sessionBudget.resetIntervalMs > 0) {
      this.scheduleReset();
    }
  }

  /**
   * Check if task is within budget constraints.
   */
  checkBudget(task: CliTask, constraint?: BudgetConstraint): BudgetRoutingResult {
    const budget = { ...this.options.defaultConstraints, ...constraint };
    const warnings: BudgetWarning[] = [];

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
    this.generateWarnings(currentBudget, estimatedTokens, estimatedCostUsd, warnings);

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
      const error = this.createBudgetExceededError(
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
    const startTime = Date.now();
    const result = await adapter.execute(task);

    if (!result.ok) {
      return result;
    }

    const actualTokens = result.value.usage?.totalTokens ?? estimatedTokens;
    const actualCostUsd = result.value.costUsd ?? estimatedCostUsd;

    this.updateBudget({ tokens: actualTokens, costUsd: actualCostUsd });

    const budgetAfter = this.getSessionBudget();
    const durationMs = Date.now() - startTime;

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
    this.resetTimer = setTimeout(() => {
      this.resetBudget();
    }, this.options.sessionBudget.resetIntervalMs);
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

  private generateWarnings(
    currentBudget: SessionBudget,
    estimatedTokens: number,
    estimatedCostUsd: number,
    warnings: BudgetWarning[]
  ): void {
    const thresholds = this.options.warningThresholds;

    // Token budget warnings
    const projectedTokenUtilization =
      ((currentBudget.tokensUsed + estimatedTokens) / currentBudget.tokenBudget) * 100;
    this.addTokenWarning(
      projectedTokenUtilization,
      thresholds,
      currentBudget.tokensRemaining - estimatedTokens,
      warnings
    );

    // Cost budget warnings
    const projectedCostUtilization =
      ((currentBudget.costSpentUsd + estimatedCostUsd) / currentBudget.costBudgetUsd) * 100;
    this.addCostWarning(
      projectedCostUtilization,
      thresholds,
      currentBudget.costRemainingUsd - estimatedCostUsd,
      warnings
    );
  }

  private addTokenWarning(
    utilization: number,
    thresholds: { info: number; warning: number; critical: number },
    remaining: number,
    warnings: BudgetWarning[]
  ): void {
    const level = this.getWarningLevel(utilization, thresholds);
    if (level === null) return;

    const pct = String(Math.round(utilization));
    const message =
      level === 'critical'
        ? `Token budget ${pct}% utilized after this task`
        : level === 'warning'
          ? `Token budget approaching limit (${pct}%)`
          : `Token budget ${pct}% utilized`;

    warnings.push({
      level,
      message,
      constraint: 'tokens',
      utilizationPercent: utilization,
      estimatedRemaining: remaining,
    });
  }

  private addCostWarning(
    utilization: number,
    thresholds: { info: number; warning: number; critical: number },
    remaining: number,
    warnings: BudgetWarning[]
  ): void {
    const level = this.getWarningLevel(utilization, thresholds);
    if (level === null || level === 'info') return; // Only warning/critical for cost

    const pct = String(Math.round(utilization));
    const message =
      level === 'critical'
        ? `Cost budget ${pct}% utilized after this task`
        : `Cost budget approaching limit (${pct}%)`;

    warnings.push({
      level,
      message,
      constraint: 'cost',
      utilizationPercent: utilization,
      estimatedRemaining: remaining,
    });
  }

  private getWarningLevel(
    utilization: number,
    thresholds: { info: number; warning: number; critical: number }
  ): BudgetWarning['level'] | null {
    if (utilization >= thresholds.critical) return 'critical';
    if (utilization >= thresholds.warning) return 'warning';
    if (utilization >= thresholds.info) return 'info';
    return null;
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

  private createBudgetExceededError(
    budget: BudgetConstraint,
    result: BudgetRoutingResult,
    currentBudget: SessionBudget
  ): BudgetExceededError {
    // Determine which constraint was exceeded
    let constraint: 'tokens' | 'cost' | 'latency' = 'tokens';
    let limit = 0;
    let current = 0;
    let suggestion = '';

    if (budget.maxTokens !== undefined && result.estimatedTokens > budget.maxTokens) {
      constraint = 'tokens';
      limit = budget.maxTokens;
      current = result.estimatedTokens;
      suggestion = 'Reduce task complexity or increase token budget';
    } else if (budget.maxCostUsd !== undefined && result.estimatedCostUsd > budget.maxCostUsd) {
      constraint = 'cost';
      limit = budget.maxCostUsd;
      current = result.estimatedCostUsd;
      suggestion = 'Use a cheaper model or increase cost budget';
    } else if (currentBudget.tokensRemaining < result.estimatedTokens) {
      constraint = 'tokens';
      limit = currentBudget.tokenBudget;
      current = currentBudget.tokensUsed + result.estimatedTokens;
      suggestion = 'Wait for budget reset or increase session budget';
    } else if (currentBudget.costRemainingUsd < result.estimatedCostUsd) {
      constraint = 'cost';
      limit = currentBudget.costBudgetUsd;
      current = currentBudget.costSpentUsd + result.estimatedCostUsd;
      suggestion = 'Wait for budget reset or increase session budget';
    }

    return {
      code: 'BUDGET_EXCEEDED',
      message: `Budget constraint exceeded: ${constraint}`,
      cli: 'claude' as CliName,
      retryable: false,
      constraint,
      limit,
      current,
      suggestion,
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
