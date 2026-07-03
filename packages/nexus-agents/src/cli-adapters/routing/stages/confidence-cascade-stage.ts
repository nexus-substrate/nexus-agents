/**
 * Confidence Cascade Stage
 *
 * Routes based on task complexity and model confidence profiles.
 * Simpler tasks can use faster/cheaper models; complex tasks escalate.
 *
 * @module cli-adapters/routing/stages/confidence-cascade-stage
 * (Source: ADR-0005, Issue #99, arXiv:2510.05164 - SATER pattern)
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
import { addTrace, updateScore, getRemainingCandidates } from '../router-stage.js';
import {
  type TaskComplexity,
  COMPLEX_TASK_INDICATORS,
  SIMPLE_TASK_INDICATORS,
} from '../../confidence-router-types.js';
import { deriveCliConfidenceProfiles } from '../../derive-tier-tables.js';

// ============================================================================
// Configuration
// ============================================================================

/**
 * Confidence profile for each CLI, DERIVED from its default-model
 * `qualityScores` (#4195): `complexScore` tracks composite quality (hard tasks
 * escalate to the strongest model), `simpleScore` tracks speed (easy tasks take
 * the fastest). No longer a hand-tuned literal.
 */
const CLI_CONFIDENCE_PROFILES: Record<CliName, { simpleScore: number; complexScore: number }> =
  deriveCliConfidenceProfiles();

/**
 * Configuration for the confidence cascade stage.
 */
export interface ConfidenceCascadeConfig {
  /** Threshold for escalating to more capable model */
  readonly escalationThreshold: number;
  /** Weight for complexity-based scoring */
  readonly complexityWeight: number;
  /** Enable debug logging */
  readonly debug: boolean;
}

const DEFAULT_CONFIG: ConfidenceCascadeConfig = {
  escalationThreshold: 0.7,
  complexityWeight: 0.3,
  debug: false,
};

// ============================================================================
// Stage Implementation
// ============================================================================

/**
 * Confidence Cascade Stage for complexity-aware routing.
 * Runs early (priority 10) to establish baseline confidence scores.
 */
export class ConfidenceCascadeStage implements IRouterStage {
  readonly name = 'confidence-cascade';
  readonly priority = 10; // Runs earliest - sets foundation

  private readonly config: ConfidenceCascadeConfig;
  private readonly logger: ILogger;
  private routingsCount = 0;
  private escalationCount = 0;
  private complexityDistribution = { simple: 0, moderate: 0, complex: 0 };

  constructor(config: Partial<ConfidenceCascadeConfig> = {}, logger?: ILogger) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger ?? createLogger({ component: 'ConfidenceCascadeStage' });
  }

  canHandle(ctx: RoutingContext): boolean {
    return getRemainingCandidates(ctx).length > 0;
  }

  route(ctx: RoutingContext): Promise<Result<StageResult, StageError>> {
    const time = getTimeProvider();
    const startTime = time.now();
    const remaining = getRemainingCandidates(ctx);

    this.routingsCount++;

    const complexity = this.estimateComplexity(ctx.task);
    this.complexityDistribution[complexity]++;

    let updatedCtx = ctx;
    const scores: Array<{ cli: CliName; score: number }> = [];

    for (const cli of remaining) {
      const score = this.calculateConfidenceScore(cli, complexity);
      scores.push({ cli, score });
      updatedCtx = updateScore(updatedCtx, cli, score * this.config.complexityWeight);
    }

    const shouldEscalate = this.checkEscalation(scores, complexity);
    if (shouldEscalate) {
      this.escalationCount++;
    }

    const signals = this.buildSignals(ctx.signals, complexity, shouldEscalate, scores);
    const durationMs = time.now() - startTime;

    const finalCtx = addTrace(
      updatedCtx,
      this.name,
      durationMs,
      'score',
      `Complexity: ${complexity}, escalate: ${String(shouldEscalate)}`
    );

    this.logger.debug('Confidence cascade complete', {
      complexity,
      shouldEscalate,
      scores: scores.map((s) => `${s.cli}:${s.score.toFixed(2)}`),
    });

    return Promise.resolve(ok({ context: { ...finalCtx, signals }, continuesPipeline: true }));
  }

  recordOutcome(outcome: RoutingOutcome): void {
    this.logger.debug('Confidence outcome recorded', {
      cli: outcome.selectedCli,
      success: outcome.success,
      qualityScore: outcome.qualityScore,
    });
  }

  getStats(): Record<string, unknown> {
    return {
      routingsCount: this.routingsCount,
      escalationCount: this.escalationCount,
      escalationRate: this.routingsCount > 0 ? this.escalationCount / this.routingsCount : 0,
      complexityDistribution: { ...this.complexityDistribution },
      config: {
        escalationThreshold: this.config.escalationThreshold,
        complexityWeight: this.config.complexityWeight,
      },
    };
  }

  /**
   * Estimate task complexity from content.
   */
  private estimateComplexity(task: string): TaskComplexity {
    const content = task.toLowerCase();
    const wordCount = content.split(/\s+/).length;

    const complexCount = COMPLEX_TASK_INDICATORS.filter((i) => content.includes(i)).length;
    const simpleCount = SIMPLE_TASK_INDICATORS.filter((i) => content.includes(i)).length;

    if (wordCount > 100 || complexCount >= 2) {
      return 'complex';
    } else if (wordCount < 30 || simpleCount >= 2) {
      return 'simple';
    }
    return 'moderate';
  }

  /**
   * Calculate confidence score for a CLI based on task complexity.
   */
  private calculateConfidenceScore(cli: CliName, complexity: TaskComplexity): number {
    const profile = CLI_CONFIDENCE_PROFILES[cli];

    switch (complexity) {
      case 'simple':
        return profile.simpleScore;
      case 'complex':
        return profile.complexScore;
      case 'moderate':
        // Blend simple and complex scores
        return (profile.simpleScore + profile.complexScore) / 2;
    }
  }

  /**
   * Check if task should escalate to more capable model.
   */
  private checkEscalation(
    scores: Array<{ cli: CliName; score: number }>,
    complexity: TaskComplexity
  ): boolean {
    if (complexity === 'simple') return false;

    const maxScore = Math.max(...scores.map((s) => s.score));
    return maxScore < this.config.escalationThreshold;
  }

  /**
   * Build routing signals for the context.
   */
  private buildSignals(
    existing: string[],
    complexity: TaskComplexity,
    shouldEscalate: boolean,
    scores: Array<{ cli: CliName; score: number }>
  ): string[] {
    const signals = [...existing];

    signals.push(`confidence:complexity-${complexity}`);

    if (shouldEscalate) {
      signals.push('confidence:should-escalate');
    }

    const best = [...scores].sort((a, b) => b.score - a.score)[0];
    if (best !== undefined) {
      signals.push(`confidence:best-${best.cli}`);
    }

    return signals;
  }
}

/**
 * Creates a confidence cascade stage.
 */
export function createConfidenceCascadeStage(
  config?: Partial<ConfidenceCascadeConfig>,
  logger?: ILogger
): ConfidenceCascadeStage {
  return new ConfidenceCascadeStage(config, logger);
}
