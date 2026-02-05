/**
 * Confidence-aware cascade router implementation.
 * Based on SATER pattern (arXiv:2510.05164) for cost-efficient LLM routing.
 *
 * Routes tasks through fast models first, escalating to expensive models
 * only when confidence is below threshold. Achieves 50%+ cost reduction
 * with comparable accuracy.
 *
 * @module cli-adapters/confidence-router
 * (Source: Issue #99, arXiv:2510.05164 - EMNLP 2025)
 */

import type { Result } from '../core/index.js';
import { createLogger, getTimeProvider } from '../core/index.js';
import type {
  IConfidenceRouter,
  ConfidenceEstimate,
  CascadeOptions,
  CascadeResult,
  CliTask,
  CliResponse,
  CliError,
  CliName,
  ICliAdapter,
} from './types.js';
import {
  type CacheEntry,
  type CacheStats,
  DEFAULT_CASCADE_OPTIONS,
} from './confidence-router-types.js';
import { estimateConfidence } from './confidence-router-helpers.js';

// Re-export types and helpers for backward API compatibility
export type { CacheEntry, CacheStats, TaskComplexity } from './confidence-router-types.js';
export {
  DEFAULT_CASCADE_OPTIONS,
  HEDGING_PHRASES,
  UNCERTAINTY_INDICATORS,
  COMPLEX_TASK_INDICATORS,
  SIMPLE_TASK_INDICATORS,
  CONFIDENCE_WEIGHTS,
  EXPECTED_WORD_COUNTS,
} from './confidence-router-types.js';
export {
  estimateTaskComplexity,
  calculateLengthFactor,
  calculateHedgingFactor,
  calculateStructureFactor,
  calculateUncertaintyFactor,
  calculateFactors,
  calculateConfidenceScore,
  generateConfidenceReason,
  estimateConfidence,
} from './confidence-router-helpers.js';

const logger = createLogger({ component: 'confidence-router' });

// =============================================================================
// Confidence Router Class
// =============================================================================

/**
 * Confidence-aware cascade router.
 * Implements SATER-style dual-mode routing with confidence-based escalation.
 *
 * @deprecated v3.0 - Use CompositeRouter which integrates confidence-based
 * routing via ZeroRouter and PreferenceRouter stages. ConfidenceRouter will be
 * replaced by ConfidenceCascadeStage. See deprecation-pipeline.md for migration.
 */
export class ConfidenceRouter implements IConfidenceRouter {
  private readonly adapters: Map<CliName, ICliAdapter>;
  private readonly cache: Map<string, CacheEntry> = new Map();
  private readonly maxCacheAge = 5 * 60 * 1000; // 5 minutes
  private readonly maxCacheSize = 100;

  constructor(adapters: Map<CliName, ICliAdapter>) {
    this.adapters = adapters;
  }

  /**
   * Estimate confidence in a model's response.
   */
  estimateConfidence(task: CliTask, response: CliResponse): ConfidenceEstimate {
    return estimateConfidence(task, response, DEFAULT_CASCADE_OPTIONS.confidenceThreshold);
  }

  /**
   * Determine if task should escalate based on confidence.
   */
  shouldEscalate(confidence: ConfidenceEstimate, threshold: number): boolean {
    return confidence.score < threshold;
  }

  /**
   * Execute task with cascade routing.
   * Tries fast model first, escalates to expensive model if confidence is low.
   */
  async executeWithCascade(
    task: CliTask,
    options?: CascadeOptions
  ): Promise<Result<CascadeResult, CliError>> {
    const opts = { ...DEFAULT_CASCADE_OPTIONS, ...options };
    const startTime = getTimeProvider().now();

    // Check cache first
    const cacheResult = this.checkCacheHit(task, opts, startTime);
    if (cacheResult !== undefined) return cacheResult;

    // Execute fast model and determine if escalation needed
    return this.executeFastModelWithEscalation(task, opts, startTime);
  }

  /**
   * Check for cache hit and return cached result if valid.
   */
  private checkCacheHit(
    task: CliTask,
    opts: Required<CascadeOptions>,
    startTime: number
  ): Result<CascadeResult, CliError> | undefined {
    if (!opts.cacheResponses) return undefined;

    const cached = this.getCachedResponse(task);
    if (cached && !cached.confidence.shouldEscalate) {
      logger.debug('Cache hit for task');
      return {
        ok: true,
        value: {
          response: cached.response,
          escalated: false,
          escalationCount: 0,
          modelsUsed: [],
          confidenceHistory: [cached.confidence],
          totalDurationMs: getTimeProvider().now() - startTime,
        },
      };
    }
    return undefined;
  }

  /**
   * Execute fast model and escalate if confidence is low.
   */
  private async executeFastModelWithEscalation(
    task: CliTask,
    opts: Required<CascadeOptions>,
    startTime: number
  ): Promise<Result<CascadeResult, CliError>> {
    const modelsUsed: CliName[] = [];
    const confidenceHistory: ConfidenceEstimate[] = [];

    const fastAdapter = this.adapters.get(opts.fastModel);
    if (!fastAdapter) {
      return this.createAdapterNotFoundError(opts.fastModel);
    }

    logger.info('Starting cascade with fast model', { model: opts.fastModel });
    const fastResult = await fastAdapter.execute(task);

    if (!fastResult.ok) {
      logger.warn('Fast model failed, escalating', { error: fastResult.error });
      return this.executeExpensiveModel(task, opts, startTime, [], []);
    }

    modelsUsed.push(opts.fastModel);
    const fastConfidence = estimateConfidence(task, fastResult.value, opts.confidenceThreshold);
    confidenceHistory.push(fastConfidence);

    logger.debug('Fast model confidence', {
      score: fastConfidence.score,
      reason: fastConfidence.reason,
    });

    if (opts.cacheResponses) {
      this.cacheResponse(task, fastResult.value, fastConfidence);
    }

    if (!this.shouldEscalate(fastConfidence, opts.confidenceThreshold)) {
      return this.createSuccessResult(fastResult.value, modelsUsed, confidenceHistory, startTime);
    }

    logger.info('Escalating to expensive model', {
      reason: fastConfidence.reason,
      model: opts.expensiveModel,
    });
    return this.executeExpensiveModel(task, opts, startTime, modelsUsed, confidenceHistory);
  }

  /**
   * Create adapter not found error.
   */
  private createAdapterNotFoundError(model: CliName): Result<CascadeResult, CliError> {
    return {
      ok: false,
      error: {
        code: 'NOT_FOUND',
        message: `Model adapter '${model}' not available`,
        cli: model,
        retryable: true,
      },
    };
  }

  /**
   * Create success result for cascade.
   */
  private createSuccessResult(
    response: CliResponse,
    modelsUsed: CliName[],
    confidenceHistory: ConfidenceEstimate[],
    startTime: number
  ): Result<CascadeResult, CliError> {
    logger.info('Fast model response accepted', { confidence: confidenceHistory[0]?.score });
    return {
      ok: true,
      value: {
        response,
        escalated: false,
        escalationCount: 0,
        modelsUsed,
        confidenceHistory,
        totalDurationMs: getTimeProvider().now() - startTime,
      },
    };
  }

  /**
   * Execute with expensive model after escalation.
   */
  private async executeExpensiveModel(
    task: CliTask,
    opts: Required<CascadeOptions>,
    startTime: number,
    modelsUsed: CliName[],
    confidenceHistory: ConfidenceEstimate[]
  ): Promise<Result<CascadeResult, CliError>> {
    const expensiveAdapter = this.adapters.get(opts.expensiveModel);
    if (!expensiveAdapter) {
      return {
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: `Expensive model adapter '${opts.expensiveModel}' not available`,
          cli: opts.expensiveModel,
          retryable: true,
        },
      };
    }

    const expensiveResult = await expensiveAdapter.execute(task);
    if (!expensiveResult.ok) {
      return expensiveResult;
    }

    modelsUsed.push(opts.expensiveModel);
    const expensiveConfidence = estimateConfidence(
      task,
      expensiveResult.value,
      opts.confidenceThreshold
    );
    confidenceHistory.push(expensiveConfidence);

    // Cache the high-quality response
    if (opts.cacheResponses) {
      this.cacheResponse(task, expensiveResult.value, expensiveConfidence);
    }

    return {
      ok: true,
      value: {
        response: expensiveResult.value,
        escalated: true,
        escalationCount: 1,
        modelsUsed,
        confidenceHistory,
        totalDurationMs: getTimeProvider().now() - startTime,
      },
    };
  }

  /**
   * Generate cache key for a task.
   */
  private getCacheKey(task: CliTask): string {
    // Use task content for caching (truncated for reasonable key size)
    return task.content.slice(0, 200);
  }

  /**
   * Get cached response if available and fresh.
   */
  private getCachedResponse(task: CliTask): CacheEntry | undefined {
    const key = this.getCacheKey(task);
    const entry = this.cache.get(key);

    if (!entry) return undefined;

    // Check age
    if (getTimeProvider().now() - entry.timestamp > this.maxCacheAge) {
      this.cache.delete(key);
      return undefined;
    }

    return entry;
  }

  /**
   * Cache a response.
   */
  private cacheResponse(
    task: CliTask,
    response: CliResponse,
    confidence: ConfidenceEstimate
  ): void {
    // Enforce max cache size (LRU eviction)
    if (this.cache.size >= this.maxCacheSize) {
      const firstKey = this.cache.keys().next();
      if (firstKey.done !== true) {
        this.cache.delete(firstKey.value);
      }
    }

    const key = this.getCacheKey(task);
    this.cache.set(key, {
      response,
      confidence,
      timestamp: getTimeProvider().now(),
    });
  }

  /**
   * Clear the response cache.
   */
  clearCache(): void {
    this.cache.clear();
    logger.debug('Cache cleared');
  }

  /**
   * Get cache statistics.
   */
  getCacheStats(): CacheStats {
    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
      maxAgeMs: this.maxCacheAge,
    };
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a confidence router instance.
 *
 * @deprecated v3.0 - Use createCompositeRouter() instead.
 * See deprecation-pipeline.md for migration guide.
 */
export function createConfidenceRouter(adapters: Map<CliName, ICliAdapter>): IConfidenceRouter {
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- factory for deprecated class
  return new ConfidenceRouter(adapters);
}
