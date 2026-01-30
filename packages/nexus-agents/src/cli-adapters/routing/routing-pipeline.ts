/**
 * Routing Pipeline Implementation
 *
 * Executes routing stages in priority order to produce a routing decision.
 * Supports stage composition, feedback recording, and execution tracing.
 *
 * @module cli-adapters/routing/routing-pipeline
 * (Source: Issue #574, ADR-0005)
 */

import { createLogger, type ILogger, getTimeProvider } from '../../core/index.js';
import type { Result } from '../../core/result.js';
import {
  type IRoutingPipeline,
  type IRouterStage,
  type RoutingContext,
  type RoutingDecision,
  type RoutingOutcome,
  type StageError,
  type PipelineStats,
  type CliName,
  createRoutingContext,
  createStageError,
  getRemainingCandidates,
  selectBestCandidate,
  addTrace,
} from './router-stage.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for the routing pipeline.
 */
export interface RoutingPipelineConfig {
  /** Logger instance */
  readonly logger?: ILogger;
  /** Available CLI adapters */
  readonly availableClis?: readonly CliName[];
  /** Default CLI if no decision made */
  readonly defaultCli?: CliName;
  /** Maximum pipeline execution time in ms */
  readonly timeoutMs?: number;
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Composable routing pipeline implementation.
 */
export class RoutingPipeline implements IRoutingPipeline {
  private readonly logger: ILogger;
  private readonly availableClis: readonly CliName[];
  private readonly defaultCli: CliName;
  private readonly timeoutMs: number;
  private readonly stages: IRouterStage[] = [];

  // Stats tracking
  private totalRoutings = 0;
  private totalLatencyMs = 0;
  private successCount = 0;

  constructor(config?: RoutingPipelineConfig) {
    this.logger = config?.logger ?? createLogger({ component: 'RoutingPipeline' });
    this.availableClis = config?.availableClis ?? ['claude', 'gemini', 'codex'];
    this.defaultCli = config?.defaultCli ?? 'claude';
    this.timeoutMs = config?.timeoutMs ?? 5000;
  }

  async execute(
    task: string,
    metadata?: Record<string, unknown>
  ): Promise<Result<RoutingDecision, StageError>> {
    const time = getTimeProvider();
    const startTime = time.now();
    this.totalRoutings++;

    let ctx = createRoutingContext(task, this.availableClis, metadata);
    this.logger.debug('Starting routing pipeline', {
      task: task.slice(0, 100),
      stages: this.stages.length,
    });

    // Execute stages
    const stageResult = await this.executeStages(ctx, startTime);
    if (!stageResult.ok) return stageResult;
    if (stageResult.value.earlyDecision !== undefined) {
      return { ok: true, value: stageResult.value.earlyDecision };
    }

    ctx = stageResult.value.context;

    // Build final decision
    const decision = this.buildDecision(ctx, startTime);
    if (decision === undefined) {
      return {
        ok: false,
        error: createStageError('pipeline', 'no_candidates', 'No valid candidates after pipeline'),
      };
    }

    this.recordSuccess(startTime);
    this.logger.debug('Pipeline complete', {
      selected: decision.selectedCli,
      confidence: decision.confidence,
    });
    return { ok: true, value: decision };
  }

  private async executeStages(
    ctx: RoutingContext,
    startTime: number
  ): Promise<
    Result<{ context: RoutingContext; earlyDecision: RoutingDecision | undefined }, StageError>
  > {
    const time = getTimeProvider();
    const sortedStages = [...this.stages].sort((a, b) => a.priority - b.priority);

    for (const stage of sortedStages) {
      const stageStart = time.now();

      if (!stage.canHandle(ctx)) {
        ctx = addTrace(
          ctx,
          stage.name,
          time.now() - stageStart,
          'skip',
          'canHandle returned false'
        );
        continue;
      }

      const result = await this.executeStageWithTimeout(stage, ctx);
      if (!result.ok) {
        this.logger.warn('Stage failed', { stage: stage.name, error: result.error });
        ctx = addTrace(
          ctx,
          stage.name,
          time.now() - stageStart,
          'skip',
          `Error: ${result.error.message}`
        );
        continue;
      }

      ctx = result.value.context;

      if (result.value.decision !== undefined) {
        this.recordSuccess(startTime);
        return { ok: true, value: { context: ctx, earlyDecision: result.value.decision } };
      }

      if (!result.value.continuesPipeline) break;

      if (getRemainingCandidates(ctx).length === 0) {
        return {
          ok: false,
          error: createStageError(stage.name, 'no_candidates', 'All candidates filtered out'),
        };
      }
    }

    return { ok: true, value: { context: ctx, earlyDecision: undefined } };
  }

  private recordSuccess(startTime: number): void {
    const time = getTimeProvider();
    this.successCount++;
    this.totalLatencyMs += time.now() - startTime;
  }

  addStage(stage: IRouterStage): void {
    // Check for duplicate names
    const existing = this.stages.findIndex((s) => s.name === stage.name);
    if (existing >= 0) {
      this.stages[existing] = stage;
      this.logger.debug('Replaced existing stage', { name: stage.name });
    } else {
      this.stages.push(stage);
      this.logger.debug('Added stage', { name: stage.name, priority: stage.priority });
    }
  }

  removeStage(name: string): boolean {
    const index = this.stages.findIndex((s) => s.name === name);
    if (index >= 0) {
      this.stages.splice(index, 1);
      this.logger.debug('Removed stage', { name });
      return true;
    }
    return false;
  }

  getStages(): readonly IRouterStage[] {
    return [...this.stages].sort((a, b) => a.priority - b.priority);
  }

  recordOutcome(outcome: RoutingOutcome): void {
    for (const stage of this.stages) {
      if (stage.recordOutcome !== undefined) {
        try {
          stage.recordOutcome(outcome);
        } catch (error) {
          this.logger.warn('Stage recordOutcome failed', { stage: stage.name, error });
        }
      }
    }
  }

  getStats(): PipelineStats {
    const stageStats: Record<string, Record<string, unknown>> = {};
    for (const stage of this.stages) {
      if (stage.getStats !== undefined) {
        stageStats[stage.name] = stage.getStats();
      }
    }

    return {
      totalRoutings: this.totalRoutings,
      averageLatencyMs: this.totalRoutings > 0 ? this.totalLatencyMs / this.totalRoutings : 0,
      successRate: this.totalRoutings > 0 ? this.successCount / this.totalRoutings : 0,
      stageStats,
    };
  }

  private async executeStageWithTimeout(
    stage: IRouterStage,
    ctx: RoutingContext
  ): Promise<
    Result<
      { context: RoutingContext; continuesPipeline: boolean; decision?: RoutingDecision },
      StageError
    >
  > {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error('Stage timeout'));
      }, this.timeoutMs);
    });

    try {
      const result = await Promise.race([stage.route(ctx), timeoutPromise]);
      return result;
    } catch (error) {
      return {
        ok: false,
        error: createStageError(
          stage.name,
          'timeout',
          `Stage timed out after ${String(this.timeoutMs)}ms`,
          error instanceof Error ? error : undefined
        ),
      };
    }
  }

  private buildDecision(ctx: RoutingContext, startTime: number): RoutingDecision | undefined {
    const best = selectBestCandidate(ctx);
    if (best === undefined) return undefined;

    const remaining = getRemainingCandidates(ctx);
    const alternatives = remaining
      .filter((cli) => cli !== best.cli)
      .sort((a, b) => (ctx.scores.get(b) ?? 0) - (ctx.scores.get(a) ?? 0));

    // Calculate confidence based on score margin
    const secondBest = alternatives[0];
    const secondScore = secondBest !== undefined ? (ctx.scores.get(secondBest) ?? 0) : 0;
    const scoreDiff = best.score - secondScore;
    const maxScore = Math.max(...Array.from(ctx.scores.values()), 1);
    const confidence = Math.min(0.5 + (scoreDiff / maxScore) * 0.5, 1);

    // Build reason from signals
    const reason =
      ctx.signals.length > 0
        ? ctx.signals.join('; ')
        : `Selected ${best.cli} with score ${best.score.toFixed(2)}`;

    const time = getTimeProvider();
    return {
      selectedCli: best.cli,
      confidence,
      reason,
      alternatives,
      routingTimeMs: time.now() - startTime,
      trace: ctx.trace,
    };
  }
}

/**
 * Creates a routing pipeline instance.
 */
export function createRoutingPipeline(config?: RoutingPipelineConfig): IRoutingPipeline {
  return new RoutingPipeline(config);
}
