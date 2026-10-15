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
import { getDefaultTopsisProfiles } from '../../topsis-types.js';
import type { KeyedTopsisProfile } from '../../topsis-helpers.js';
import { computeTokenCost } from '../../../learning/token-cost-core.js';

// ============================================================================
// Configuration
// ============================================================================

/** Max quality score from model registry (reasoning + codeGeneration are 0-10 each). */
const MAX_QUALITY = 10;

/** Bound-profile result; unknown profiles are excluded before evaluation by the caller. */
export interface QualityProfileEvaluation<Key extends string> {
  readonly eligible: Key[];
  readonly filtered: Map<Key, string>;
  readonly violations: Array<{ cli: Key; reason: string }>;
  readonly usedFallback: boolean;
}

/** Same normalization for the legacy CLI route and actual-arm entry point. */
function qualityProfile(
  profile: Pick<
    KeyedTopsisProfile<string>,
    'qualityScore' | 'costPerMillionInput' | 'costPerMillionOutput' | 'averageLatencyMs'
  >
): {
  readonly qualityScore: number;
  readonly costPerMillionInput: number;
  readonly costPerMillionOutput: number;
  readonly avgLatencyMs: number;
} {
  return {
    qualityScore: profile.qualityScore / MAX_QUALITY,
    costPerMillionInput: profile.costPerMillionInput,
    costPerMillionOutput: profile.costPerMillionOutput,
    avgLatencyMs: profile.averageLatencyMs,
  };
}

/**
 * Cost to compare against the ceiling.
 *
 * A ceiling must FAIL CLOSED. The previous implementation priced every token at
 * the INPUT rate and compared the result to `maxCostUsd`, so the estimate ran
 * 5-6x under the worst case across all four CLIs — and because the check is
 * `estimate > max → reject`, understating means the ceiling ADMITS candidates it
 * was configured to reject (#5186).
 *
 * When the caller supplies a split, price it exactly. When it supplies only a
 * total (or an incomplete split), use the higher of the INPUT and OUTPUT rates.
 * Registry/manifest prices need not make output more expensive (#7391).
 * Over-rejecting a cheap candidate costs a routing option; under-rejecting
 * an expensive one costs money, which is the asymmetry #4196 already encodes
 * elsewhere in this tree.
 */
function estimateCeilingCost(
  config: Pick<
    QualityConstraintConfig,
    'expectedTokens' | 'expectedInputTokens' | 'expectedOutputTokens'
  >,
  profile: ReturnType<typeof qualityProfile>
): number {
  const rates = {
    inputPer1M: profile.costPerMillionInput,
    outputPer1M: profile.costPerMillionOutput,
  };

  if (config.expectedInputTokens !== undefined && config.expectedOutputTokens !== undefined) {
    return computeTokenCost(
      { input: config.expectedInputTokens, output: config.expectedOutputTokens },
      rates
    ).costUsd;
  }

  // Split unknown: either component may contain the whole total. Bound both.
  return computeTokenCost(
    { input: 0, output: config.expectedTokens },
    { ...rates, outputPer1M: Math.max(rates.inputPer1M, rates.outputPer1M) }
  ).costUsd;
}

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
  /**
   * Expected INPUT tokens, when the caller knows the split. Supplying both this
   * and {@link expectedOutputTokens} prices the ceiling exactly; leaving them
   * incomplete prices {@link expectedTokens} at the higher INPUT/OUTPUT rate,
   * which is the conservative bound (#5186, #7391).
   */
  readonly expectedInputTokens?: number | undefined;
  /** Expected OUTPUT tokens, when the caller knows the split. */
  readonly expectedOutputTokens?: number | undefined;
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
    const result = this.filterProfiles(
      getDefaultTopsisProfiles().filter((p) => remaining.includes(p.cliName))
    );
    const { eligible, violations, usedFallback } = result;
    let updatedCtx = ctx;
    for (const [cli, reason] of result.filtered)
      updatedCtx = filterCandidate(updatedCtx, cli, reason);
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

  /** Host-bound models share the exact CLI constraint and fallback computation. */
  filterProfiles<Key extends string>(
    profiles: readonly KeyedTopsisProfile<Key>[]
  ): QualityProfileEvaluation<Key> {
    this.routingsCount++;
    const normalized = new Map(profiles.map((p) => [p.cliName, qualityProfile(p)]));
    const eligible: Key[] = [];
    const filtered = new Map<Key, string>();
    const violations: Array<{ cli: Key; reason: string }> = [];
    for (const profile of profiles) {
      const result = this.checkConstraints(qualityProfile(profile));
      if (result.meets) eligible.push(profile.cliName);
      else {
        filtered.set(profile.cliName, result.reason);
        violations.push({ cli: profile.cliName, reason: result.reason });
        this.filteredCount++;
        this.trackViolation(result.violated);
      }
    }
    let usedFallback = false;
    if (eligible.length === 0 && this.config.allowFallback && profiles.length > 0) {
      const fallback = this.selectFallback(normalized);
      if (fallback !== undefined) {
        eligible.push(fallback);
        filtered.delete(fallback);
        usedFallback = true;
        this.fallbackCount++;
      }
    }
    return { eligible, filtered, violations, usedFallback };
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
  private checkConstraints(profile: ReturnType<typeof qualityProfile>): {
    meets: boolean;
    reason: string;
    violated: 'quality' | 'cost' | 'latency' | null;
  } {
    // Check quality
    if (profile.qualityScore < this.config.minQuality) {
      return {
        meets: false,
        reason: `Quality ${profile.qualityScore.toFixed(2)} < min ${this.config.minQuality.toFixed(2)}`,
        violated: 'quality',
      };
    }

    // Check cost
    const estimatedCost = estimateCeilingCost(this.config, profile);
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
  private selectFallback<Key extends string>(
    profiles: ReadonlyMap<Key, ReturnType<typeof qualityProfile>>
  ): Key | undefined {
    return [...profiles].sort((a, b) => b[1].qualityScore - a[1].qualityScore)[0]?.[0];
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
