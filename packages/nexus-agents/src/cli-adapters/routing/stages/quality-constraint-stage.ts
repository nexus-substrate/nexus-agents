/**
 * Quality Constraint Stage
 *
 * Applies quality constraints to filter candidates that don't meet
 * minimum quality, cost, or latency requirements.
 *
 * @module cli-adapters/routing/stages/quality-constraint-stage
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
 * Quality profile for each CLI.
 */
interface QualityProfile {
  readonly qualityScore: number; // 0-1 overall quality
  readonly costPer1kTokens: number; // USD
  readonly avgLatencyMs: number; // Milliseconds
}

/**
 * CLI quality profiles.
 */
const CLI_QUALITY_PROFILES: Record<CliName, QualityProfile> = {
  claude: { qualityScore: 0.95, costPer1kTokens: 0.045, avgLatencyMs: 2000 },
  gemini: { qualityScore: 0.8, costPer1kTokens: 0.003, avgLatencyMs: 1500 },
  codex: { qualityScore: 0.85, costPer1kTokens: 0.009, avgLatencyMs: 1000 },
  opencode: { qualityScore: 0.82, costPer1kTokens: 0.008, avgLatencyMs: 1500 },
};

/**
 * Configuration for the quality constraint stage.
 */
export interface QualityConstraintConfig {
  /** Minimum quality score (0-1) */
  readonly minQuality: number;
  /** Maximum cost per task in USD */
  readonly maxCostUsd: number;
  /** Maximum latency in milliseconds */
  readonly maxLatencyMs: number;
  /** Expected tokens for cost estimation */
  readonly expectedTokens: number;
  /** Allow fallback to highest quality if all filtered */
  readonly allowFallback: boolean;
}

const DEFAULT_CONFIG: QualityConstraintConfig = {
  minQuality: 0.7,
  maxCostUsd: 1.0,
  maxLatencyMs: 10000,
  expectedTokens: 1500,
  allowFallback: true,
};

// ============================================================================
// Stage Implementation
// ============================================================================

/**
 * Quality Constraint Stage for constraint-based filtering.
 * Runs near end (priority 75) to apply final quality gates.
 */
export class QualityConstraintStage implements IRouterStage {
  readonly name = 'quality-constraint';
  readonly priority = 75; // Near end, before latency

  private readonly config: QualityConstraintConfig;
  private readonly logger: ILogger;
  private routingsCount = 0;
  private filteredCount = 0;
  private fallbackCount = 0;
  private constraintViolations = { quality: 0, cost: 0, latency: 0 };

  constructor(config: Partial<QualityConstraintConfig> = {}, logger?: ILogger) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger ?? createLogger({ component: 'QualityConstraintStage' });
  }

  canHandle(ctx: RoutingContext): boolean {
    return getRemainingCandidates(ctx).length > 0;
  }

  route(ctx: RoutingContext): Promise<Result<StageResult, StageError>> {
    const time = getTimeProvider();
    const startTime = time.now();
    const remaining = getRemainingCandidates(ctx);

    this.routingsCount++;

    let updatedCtx = ctx;
    const eligible: CliName[] = [];
    const violations: Array<{ cli: CliName; reason: string }> = [];

    for (const cli of remaining) {
      const result = this.checkConstraints(cli);
      if (result.meets) {
        eligible.push(cli);
      } else {
        updatedCtx = filterCandidate(updatedCtx, cli, result.reason);
        violations.push({ cli, reason: result.reason });
        this.filteredCount++;
        this.trackViolation(result.violated);
      }
    }

    // Handle fallback if all filtered
    let usedFallback = false;
    if (eligible.length === 0 && this.config.allowFallback && remaining.length > 0) {
      const fallback = this.selectFallback(remaining);
      if (fallback !== undefined) {
        eligible.push(fallback);
        usedFallback = true;
        this.fallbackCount++;
        // Remove from filtered
        const newFiltered = new Map(updatedCtx.filtered);
        newFiltered.delete(fallback);
        updatedCtx = { ...updatedCtx, filtered: newFiltered };
      }
    }

    const signals = this.buildSignals(ctx.signals, eligible, violations, usedFallback);
    const durationMs = time.now() - startTime;

    const finalCtx = addTrace(
      updatedCtx,
      this.name,
      durationMs,
      'filter',
      `Eligible: ${String(eligible.length)}/${String(remaining.length)}, fallback: ${String(usedFallback)}`
    );

    this.logger.debug('Quality constraint complete', {
      eligible: eligible.length,
      filtered: violations.length,
      usedFallback,
    });

    return Promise.resolve(
      ok({ context: { ...finalCtx, signals }, continuesPipeline: eligible.length > 0 })
    );
  }

  recordOutcome(outcome: RoutingOutcome): void {
    this.logger.debug('Quality outcome recorded', {
      cli: outcome.selectedCli,
      success: outcome.success,
      qualityScore: outcome.qualityScore,
      latencyMs: outcome.latencyMs,
    });
  }

  getStats(): Record<string, unknown> {
    return {
      routingsCount: this.routingsCount,
      filteredCount: this.filteredCount,
      fallbackCount: this.fallbackCount,
      filterRate: this.routingsCount > 0 ? this.filteredCount / this.routingsCount : 0,
      constraintViolations: { ...this.constraintViolations },
      config: {
        minQuality: this.config.minQuality,
        maxCostUsd: this.config.maxCostUsd,
        maxLatencyMs: this.config.maxLatencyMs,
      },
    };
  }

  /**
   * Check if a CLI meets all constraints.
   */
  private checkConstraints(cli: CliName): {
    meets: boolean;
    reason: string;
    violated: 'quality' | 'cost' | 'latency' | null;
  } {
    const profile = CLI_QUALITY_PROFILES[cli];

    // Check quality
    if (profile.qualityScore < this.config.minQuality) {
      return {
        meets: false,
        reason: `Quality ${profile.qualityScore.toFixed(2)} < min ${this.config.minQuality.toFixed(2)}`,
        violated: 'quality',
      };
    }

    // Check cost
    const estimatedCost = (this.config.expectedTokens / 1000) * profile.costPer1kTokens;
    if (estimatedCost > this.config.maxCostUsd) {
      return {
        meets: false,
        reason: `Cost $${estimatedCost.toFixed(4)} > max $${this.config.maxCostUsd.toFixed(2)}`,
        violated: 'cost',
      };
    }

    // Check latency
    if (profile.avgLatencyMs > this.config.maxLatencyMs) {
      return {
        meets: false,
        reason: `Latency ${String(profile.avgLatencyMs)}ms > max ${String(this.config.maxLatencyMs)}ms`,
        violated: 'latency',
      };
    }

    return { meets: true, reason: '', violated: null };
  }

  /**
   * Track which constraint was violated.
   */
  private trackViolation(violated: 'quality' | 'cost' | 'latency' | null): void {
    if (violated !== null) {
      this.constraintViolations[violated]++;
    }
  }

  /**
   * Select fallback as highest quality candidate.
   */
  private selectFallback(candidates: CliName[]): CliName | undefined {
    const sorted = [...candidates].sort((a, b) => {
      const profileA = CLI_QUALITY_PROFILES[a];
      const profileB = CLI_QUALITY_PROFILES[b];
      return profileB.qualityScore - profileA.qualityScore;
    });
    return sorted[0];
  }

  /**
   * Build routing signals for the context.
   */
  private buildSignals(
    existing: string[],
    eligible: CliName[],
    violations: Array<{ cli: CliName; reason: string }>,
    usedFallback: boolean
  ): string[] {
    const signals = [...existing];

    if (eligible.length > 0) {
      signals.push('quality:meets-constraints');
    }

    if (violations.length > 0) {
      signals.push(`quality:filtered-${String(violations.length)}`);

      // Track which constraints were violated
      const violationTypes = new Set(
        violations.map((v) => {
          if (v.reason.includes('Quality')) return 'quality';
          if (v.reason.includes('Cost')) return 'cost';
          if (v.reason.includes('Latency')) return 'latency';
          return 'unknown';
        })
      );

      for (const type of violationTypes) {
        signals.push(`quality:constraint-${type}`);
      }
    }

    if (usedFallback) {
      signals.push('quality:used-fallback');
    }

    return signals;
  }
}

/**
 * Creates a quality constraint stage.
 */
export function createQualityConstraintStage(
  config?: Partial<QualityConstraintConfig>,
  logger?: ILogger
): QualityConstraintStage {
  return new QualityConstraintStage(config, logger);
}
