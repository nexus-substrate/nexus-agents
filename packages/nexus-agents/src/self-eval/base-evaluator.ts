/**
 * Base Evaluator for Self-Evaluation MVP
 *
 * Abstract base class for all evaluation agents.
 * Provides common evaluation infrastructure.
 *
 * @module self-eval/base-evaluator
 * (Source: Issue #138, Multi-Agent Evaluation research)
 */

import type { ComponentInfo } from './component-scanner.js';
import { createLogger } from '../core/index.js';
import type {
  Recommendation,
  MetricSource,
  MetricCitation,
  EvaluationResult,
  EvaluatorRole,
  EvaluatorConfig,
  EvaluationThresholds,
} from './evaluation-agents-types.js';
import { DEFAULT_THRESHOLDS, DEFAULT_TIMEOUT_MS } from './evaluation-agents-types.js';

/**
 * Base class for evaluation agents.
 */
export abstract class BaseEvaluator {
  protected readonly log;
  protected readonly thresholds: Required<EvaluationThresholds>;
  protected readonly timeoutMs: number;

  constructor(
    protected readonly role: EvaluatorRole,
    config?: EvaluatorConfig
  ) {
    this.log = config?.logger ?? createLogger({ component: `evaluator-${role}` });
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...config?.thresholds };
    this.timeoutMs = config?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /**
   * Evaluate a component and return recommendation.
   */
  async evaluate(component: ComponentInfo): Promise<EvaluationResult> {
    const startTime = Date.now();

    try {
      const result = await Promise.race([this.performEvaluation(component), this.timeout()]);

      this.log.debug('Evaluation complete', {
        component: component.path,
        recommendation: result.recommendation,
        durationMs: Date.now() - startTime,
      });

      return result;
    } catch (error) {
      // On timeout or error, return a "review" recommendation
      return this.createResult(
        component,
        'review',
        0.3,
        [],
        [`Evaluation failed: ${error instanceof Error ? error.message : String(error)}`]
      );
    }
  }

  /**
   * Template method for specific evaluation logic.
   */
  protected abstract performEvaluation(component: ComponentInfo): Promise<EvaluationResult>;

  /**
   * Create a standardized result.
   */
  protected createResult(
    component: ComponentInfo,
    recommendation: Recommendation,
    confidence: number,
    metrics: MetricCitation[],
    concerns: string[]
  ): EvaluationResult {
    return {
      component: component.path,
      recommendation,
      confidence: Math.max(0, Math.min(1, confidence)),
      metrics,
      concerns,
      isRecommendation: true,
      agent: this.role,
      timestamp: new Date(),
    };
  }

  /**
   * Create a metric citation.
   */
  protected cite(
    metric: string,
    value: number | string,
    source: MetricSource,
    threshold?: number | string
  ): MetricCitation {
    return { metric, value, source, ...(threshold !== undefined ? { threshold } : {}) };
  }

  /**
   * Timeout promise.
   */
  private timeout(): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error('Evaluation timeout'));
      }, this.timeoutMs);
    });
  }
}
