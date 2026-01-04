/**
 * @nexus-agents/agents - Result Aggregator
 *
 * Aggregates results from multiple experts into a final output.
 * Handles merging, conflict detection, and quality scoring.
 */

import type { Result, TaskResult, ILogger } from '@nexus-agents/core';
import { ok, err, AgentError, createLogger } from '@nexus-agents/core';
import type {
  AggregatedResult,
  ResultConflict,
  CollaborationPattern,
  VoteMessage,
  ReviewResponseMessage,
} from './collaboration-types.js';
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

/**
 * Aggregation strategy types.
 */
export type AggregationStrategy = 'merge' | 'select_best' | 'consensus' | 'sequential_chain';

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
 * Input for aggregation.
 */
export interface AggregatorInput {
  pattern: CollaborationPattern;
  results: ExpertResult[];
  votes?: VoteMessage[];
  reviews?: ReviewResponseMessage[];
}

/**
 * Expert result with metadata.
 */
export interface ExpertResult {
  expertId: string;
  result: TaskResult;
  confidence?: number;
  order?: number;
}

/**
 * Conflict resolver function type.
 */
export type ConflictResolver = (
  conflict: ResultConflict,
  result1: ExpertResult,
  result2: ExpertResult
) => 'expert1' | 'expert2' | 'merged';

/**
 * Quality scorer function type.
 */
export type QualityScorer = (results: ExpertResult[], aggregatedOutput: unknown) => number;

/**
 * Aggregates results from multiple experts.
 */
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
    const { output: aggregatedOutput, conflicts } = this.applyStrategy(strategy, input);
    const qualityScore = this.qualityScorer(input.results, aggregatedOutput);

    const qualityCheck = this.checkQuality(qualityScore);
    if (!qualityCheck.ok) return err(qualityCheck.error);

    const result = this.buildResult(
      input.results,
      aggregatedOutput,
      strategy,
      conflicts,
      qualityScore
    );

    this.logger.info('Aggregation complete', {
      strategy,
      qualityScore: result.qualityScore,
      conflictCount: conflicts.length,
    });

    return ok(result);
  }

  private applyStrategy(
    strategy: AggregationStrategy,
    input: AggregatorInput
  ): { output: unknown; conflicts: ResultConflict[] } {
    switch (strategy) {
      case 'merge':
        return this.mergeResults(input.results);
      case 'select_best':
        return { output: selectBest(input.results, input.reviews), conflicts: [] };
      case 'consensus':
        return { output: buildConsensus(input.results, input.votes), conflicts: [] };
      case 'sequential_chain':
        return { output: chainSequential(input.results), conflicts: [] };
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
    conflicts: ResultConflict[],
    qualityScore: number
  ): AggregatedResult {
    const totalTokensUsed = results.reduce((s, r) => s + r.result.metadata.tokensUsed, 0);
    const avgConfidence = results.reduce((s, r) => s + (r.confidence ?? 0.5), 0) / results.length;

    return {
      output,
      strategy,
      qualityScore: Math.round(qualityScore * 100) / 100,
      conflicts,
      metadata: {
        resultCount: results.length,
        conflictCount: conflicts.length,
        averageConfidence: Math.round(avgConfidence * 100) / 100,
        totalTokensUsed,
        aggregatedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Merges multiple results into one.
   */
  private mergeResults(results: ExpertResult[]): { output: unknown; conflicts: ResultConflict[] } {
    if (results.length === 1) {
      return { output: results[0]?.result.output, conflicts: [] };
    }

    const conflicts: ResultConflict[] = [];
    const outputs = results.map((r) => r.result.output);

    if (areAllStrings(outputs)) {
      return { output: mergeStrings(outputs), conflicts };
    }

    if (areAllObjects(outputs)) {
      return mergeObjects(results, outputs, this.conflictResolver);
    }

    if (areAllArrays(outputs)) {
      return { output: mergeArrays(outputs), conflicts };
    }

    const merged = {
      sources: results.map((r) => ({
        expertId: r.expertId,
        output: r.result.output,
      })),
    };

    return { output: merged, conflicts };
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
