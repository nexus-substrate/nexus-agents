/**
 * nexus-agents/agents - Result Aggregator
 *
 * Aggregates results from multiple experts into a final output.
 * Handles merging, conflict detection, and quality scoring.
 */

import type { Result, ILogger } from '../../core/index.js';
import { ok, err, AgentError, createLogger, getTimeProvider } from '../../core/index.js';
import type { AggregatedResult, ResultConflict } from './collaboration-types.js';
import { summarizeTokenUsage } from './token-usage-summary.js';
import type {
  AggregationStrategy,
  ExpertResult,
  ConflictResolver,
  QualityScorer,
  AggregatorInput,
} from './aggregator-types.js';
import {
  defaultConflictResolver,
  defaultQualityScorer,
  determineStrategy,
  areAllStrings,
  areAllObjects,
  areAllArrays,
  mergeStrings,
  mergeArrays,
  mergeObjects,
  selectBest,
  buildConsensus,
  chainSequential,
} from './aggregator-helpers.js';

// Re-export types for backward compatibility
export type {
  AggregationStrategy,
  ExpertResult,
  ConflictResolver,
  QualityScorer,
  AggregatorInput,
} from './aggregator-types.js';

/**
 * Options for result aggregation.
 */
export interface AggregatorOptions {
  logger?: ILogger;
  conflictResolver?: ConflictResolver;
  qualityScorer?: QualityScorer;
  minQualityScore?: number;
}

/**
 * Aggregates results from multiple experts.
 */
/**
 * A conflict list together with whether anything was compared to produce it
 * (#4854). Returned as one value so a branch cannot report the list without
 * saying whether it looked — the drift that made an empty list ambiguous.
 */
interface ConflictOutcome {
  conflicts: ResultConflict[];
  conflictsDetected: boolean;
}

export class ResultAggregator {
  private readonly logger: ILogger;
  private readonly conflictResolver: ConflictResolver;
  private readonly qualityScorer: QualityScorer;
  private readonly minQualityScore: number;

  constructor(options: AggregatorOptions = {}) {
    this.logger = options.logger ?? createLogger({ component: 'ResultAggregator' });
    this.conflictResolver = options.conflictResolver ?? defaultConflictResolver;
    this.qualityScorer = options.qualityScorer ?? defaultQualityScorer;
    this.minQualityScore = options.minQualityScore ?? 0;
  }

  /**
   * Aggregates expert results into a final result.
   */
  aggregate(input: AggregatorInput): Result<AggregatedResult, AgentError> {
    if (input.results.length === 0) {
      return err(new AgentError('No results to aggregate'));
    }

    this.logger.info('Aggregating results', {
      pattern: input.pattern,
      resultCount: input.results.length,
    });

    const strategy = determineStrategy(input.pattern);
    const { output: aggregatedOutput, ...outcome } = this.applyStrategy(strategy, input);
    const qualityScore = this.qualityScorer(input.results, aggregatedOutput);

    const qualityCheck = this.checkQuality(qualityScore);
    if (!qualityCheck.ok) return err(qualityCheck.error);

    const result = this.buildResult(
      input.results,
      aggregatedOutput,
      strategy,
      outcome,
      qualityScore
    );

    this.logger.info('Aggregation complete', {
      strategy,
      qualityScore: result.qualityScore,
      conflictCount: outcome.conflicts.length,
    });

    return ok(result);
  }

  /**
   * `conflictsDetected` travels with the conflict list because only one of
   * these branches compares anything (#4854). `select_best`, `consensus` and
   * `sequential_chain` pick or concatenate; an empty list from them is the
   * absence of a check, not the absence of disagreement.
   */
  private applyStrategy(
    strategy: AggregationStrategy,
    input: AggregatorInput
  ): { output: unknown } & ConflictOutcome {
    switch (strategy) {
      case 'merge':
        return this.mergeResults(input.results);
      case 'select_best':
        return {
          output: selectBest(input.results, input.reviews),
          conflicts: [],
          conflictsDetected: false,
        };
      case 'consensus':
        return {
          output: buildConsensus(input.results, input.votes),
          conflicts: [],
          conflictsDetected: false,
        };
      case 'sequential_chain':
        return {
          output: chainSequential(input.results),
          conflicts: [],
          conflictsDetected: false,
        };
    }
  }

  private checkQuality(qualityScore: number): Result<void, AgentError> {
    if (qualityScore < this.minQualityScore) {
      return err(
        new AgentError('Aggregated result quality below threshold', {
          context: { qualityScore, minQualityScore: this.minQualityScore },
        })
      );
    }
    return ok(undefined);
  }

  private buildResult(
    results: ExpertResult[],
    output: unknown,
    strategy: AggregationStrategy,
    outcome: ConflictOutcome,
    qualityScore: number
  ): AggregatedResult {
    const usage = summarizeTokenUsage(results.map((r) => r.result.metadata));
    const avgConfidence = results.reduce((s, r) => s + (r.confidence ?? 0.5), 0) / results.length;

    return {
      output,
      strategy,
      qualityScore: Math.round(qualityScore * 100) / 100,
      conflicts: outcome.conflicts,
      metadata: {
        resultCount: results.length,
        conflictCount: outcome.conflicts.length,
        averageConfidence: Math.round(avgConfidence * 100) / 100,
        // Measured: ExpertResult carries confidence, and `aggregate` rejects
        // an empty result list before reaching here (#4831).
        confidenceMeasured: true,
        // Only the object-merge branch compares anything; every other
        // strategy returns an empty list without looking (#4854).
        conflictsDetected: outcome.conflictsDetected,
        ...usage,
        aggregatedAt: getTimeProvider().nowIso(),
      },
    };
  }

  /**
   * Merges multiple results into one.
   *
   * Only the object branch performs a comparison — strings are unioned
   * line-by-line, arrays concatenated, and mixed outputs simply collected
   * under `sources`. Each branch reports whether it looked (#4854).
   */
  private mergeResults(results: ExpertResult[]): { output: unknown } & ConflictOutcome {
    if (results.length === 1) {
      // Nothing to compare a lone result against.
      return { output: results[0]?.result.output, conflicts: [], conflictsDetected: false };
    }

    const conflicts: ResultConflict[] = [];
    const outputs = results.map((r) => r.result.output);

    if (areAllStrings(outputs)) {
      return { output: mergeStrings(outputs), conflicts, conflictsDetected: false };
    }

    if (areAllObjects(outputs)) {
      return { ...mergeObjects(results, outputs, this.conflictResolver), conflictsDetected: true };
    }

    if (areAllArrays(outputs)) {
      return { output: mergeArrays(outputs), conflicts, conflictsDetected: false };
    }

    const merged = {
      sources: results.map((r) => ({
        expertId: r.expertId,
        output: r.result.output,
      })),
    };

    return { output: merged, conflicts, conflictsDetected: false };
  }
}

/**
 * Creates a result aggregator.
 */
export function createResultAggregator(options?: AggregatorOptions): ResultAggregator {
  return new ResultAggregator(options);
}

/**
 * Convenience function to aggregate results.
 */
export function aggregateResults(
  input: AggregatorInput,
  options?: AggregatorOptions
): Result<AggregatedResult, AgentError> {
  const aggregator = createResultAggregator(options);
  return aggregator.aggregate(input);
}
