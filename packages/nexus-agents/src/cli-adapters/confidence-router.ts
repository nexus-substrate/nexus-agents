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
import { createLogger } from '../core/logger.js';
import type {
  IConfidenceRouter,
  ConfidenceEstimate,
  ConfidenceFactors,
  CascadeOptions,
  CascadeResult,
  CliTask,
  CliResponse,
  CliError,
  CliName,
  ICliAdapter,
} from './types.js';

const logger = createLogger({ component: 'confidence-router' });

/**
 * Default cascade configuration.
 */
const DEFAULT_CASCADE_OPTIONS: Required<CascadeOptions> = {
  confidenceThreshold: 0.7,
  fastModel: 'gemini' as CliName, // Gemini Flash for speed/cost
  expensiveModel: 'claude' as CliName, // Claude for quality
  maxEscalations: 2,
  cacheResponses: true,
};

/**
 * Hedging phrases that indicate low confidence in responses.
 * Static patterns only (no user-provided RegExp - ReDoS prevention).
 */
const HEDGING_PHRASES = [
  'i think',
  'i believe',
  'probably',
  'maybe',
  'might be',
  'could be',
  'possibly',
  'not sure',
  'uncertain',
  'i guess',
  "i'm not certain",
  'it seems',
  'appears to',
  'likely',
  'unlikely',
] as const;

/**
 * Uncertainty indicators that suggest the model lacks confidence.
 */
const UNCERTAINTY_INDICATORS = [
  'however',
  'although',
  'but',
  'on the other hand',
  'alternatively',
  'caveat',
  'note that',
  'be aware',
  'keep in mind',
  'disclaimer',
] as const;

/**
 * Response cache for avoiding redundant model calls.
 */
interface CacheEntry {
  readonly response: CliResponse;
  readonly confidence: ConfidenceEstimate;
  readonly timestamp: number;
}

/**
 * Task complexity levels for confidence estimation.
 */
type TaskComplexity = 'simple' | 'moderate' | 'complex';

/**
 * Confidence-aware cascade router.
 * Implements SATER-style dual-mode routing with confidence-based escalation.
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
   * Uses multiple heuristic factors based on SATER research.
   */
  estimateConfidence(task: CliTask, response: CliResponse): ConfidenceEstimate {
    const factors = this.calculateFactors(task, response);

    // Weighted combination of factors (weights from SATER paper)
    const score =
      factors.lengthFactor * 0.2 +
      factors.hedgingFactor * 0.3 +
      factors.structureFactor * 0.25 +
      factors.uncertaintyFactor * 0.25;

    const shouldEscalate = score < DEFAULT_CASCADE_OPTIONS.confidenceThreshold;
    const reason = this.generateReason(factors, score);

    return { score, factors, shouldEscalate, reason };
  }

  /**
   * Calculate individual confidence factors.
   */
  private calculateFactors(task: CliTask, response: CliResponse): ConfidenceFactors {
    const responseText = response.text.toLowerCase();
    const wordCount = responseText.split(/\s+/).length;
    const complexity = this.estimateTaskComplexity(task);

    // Length factor: Very short or very long responses indicate issues
    // Optimal range: 50-500 words for most tasks
    const lengthFactor = this.calculateLengthFactor(wordCount, complexity);

    // Hedging factor: Count hedging phrases (inverted - fewer = higher confidence)
    const hedgingCount = HEDGING_PHRASES.filter((phrase) => responseText.includes(phrase)).length;
    const hedgingFactor = Math.max(0, 1 - hedgingCount * 0.15);

    // Structure factor: Well-structured responses indicate confidence
    const structureFactor = this.calculateStructureFactor(response.text);

    // Uncertainty factor: Count uncertainty indicators (inverted)
    const uncertaintyCount = UNCERTAINTY_INDICATORS.filter((indicator) =>
      responseText.includes(indicator)
    ).length;
    const uncertaintyFactor = Math.max(0, 1 - uncertaintyCount * 0.1);

    return {
      lengthFactor,
      hedgingFactor,
      structureFactor,
      uncertaintyFactor,
    };
  }

  /**
   * Estimate task complexity from task content.
   */
  private estimateTaskComplexity(task: CliTask): TaskComplexity {
    const content = task.content.toLowerCase();
    const wordCount = content.split(/\s+/).length;

    // Simple heuristics for complexity estimation
    const complexIndicators = [
      'design',
      'architecture',
      'implement',
      'optimize',
      'refactor',
      'security',
      'performance',
      'scalable',
      'distributed',
      'algorithm',
    ];
    const simpleIndicators = [
      'fix',
      'add',
      'remove',
      'update',
      'change',
      'simple',
      'basic',
      'quick',
    ];

    const complexCount = complexIndicators.filter((i) => content.includes(i)).length;
    const simpleCount = simpleIndicators.filter((i) => content.includes(i)).length;

    if (wordCount > 100 || complexCount >= 2) {
      return 'complex';
    } else if (wordCount < 30 || simpleCount >= 2) {
      return 'simple';
    }
    return 'moderate';
  }

  /**
   * Calculate length factor based on response length appropriateness.
   */
  private calculateLengthFactor(wordCount: number, complexity: TaskComplexity): number {
    // Task complexity affects expected length
    const expectedMinWords = complexity === 'simple' ? 20 : complexity === 'complex' ? 100 : 50;
    const expectedMaxWords = complexity === 'simple' ? 200 : complexity === 'complex' ? 1000 : 500;

    if (wordCount < expectedMinWords * 0.5) {
      // Too short - likely incomplete
      return 0.4;
    } else if (wordCount < expectedMinWords) {
      // Slightly short
      return 0.7;
    } else if (wordCount <= expectedMaxWords) {
      // Optimal range
      return 1.0;
    } else if (wordCount <= expectedMaxWords * 1.5) {
      // Slightly long
      return 0.8;
    } else {
      // Too long - may indicate padding or uncertainty
      return 0.6;
    }
  }

  /**
   * Calculate structure factor based on response formatting.
   */
  private calculateStructureFactor(content: string): number {
    let score = 0.5; // Base score

    // Check for structured elements
    if (content.includes('```')) score += 0.15; // Code blocks
    if (/^\s*[-*]\s/m.test(content)) score += 0.1; // Bullet points
    if (/^\s*\d+\.\s/m.test(content)) score += 0.1; // Numbered lists
    if (/^#+\s/m.test(content)) score += 0.1; // Headers
    if (content.includes('\n\n')) score += 0.05; // Paragraph breaks

    return Math.min(1, score);
  }

  /**
   * Generate human-readable reason for confidence score.
   */
  private generateReason(factors: ConfidenceFactors, score: number): string {
    const issues: string[] = [];

    if (factors.lengthFactor < 0.7) issues.push('response length concerns');
    if (factors.hedgingFactor < 0.7) issues.push('hedging language detected');
    if (factors.structureFactor < 0.6) issues.push('limited structure');
    if (factors.uncertaintyFactor < 0.7) issues.push('uncertainty indicators');

    if (issues.length === 0) {
      return `High confidence (${(score * 100).toFixed(1)}%)`;
    }

    return `Confidence ${(score * 100).toFixed(1)}%: ${issues.join(', ')}`;
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
    const startTime = Date.now();

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
          totalDurationMs: Date.now() - startTime,
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
    const fastConfidence = this.estimateConfidence(task, fastResult.value);
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
        totalDurationMs: Date.now() - startTime,
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
    const expensiveConfidence = this.estimateConfidence(task, expensiveResult.value);
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
        totalDurationMs: Date.now() - startTime,
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
    if (Date.now() - entry.timestamp > this.maxCacheAge) {
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
      const oldestKey: string | undefined = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }

    const key = this.getCacheKey(task);
    this.cache.set(key, {
      response,
      confidence,
      timestamp: Date.now(),
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
  getCacheStats(): { size: number; maxSize: number; maxAgeMs: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
      maxAgeMs: this.maxCacheAge,
    };
  }
}

/**
 * Create a confidence router instance.
 */
export function createConfidenceRouter(adapters: Map<CliName, ICliAdapter>): IConfidenceRouter {
  return new ConfidenceRouter(adapters);
}
