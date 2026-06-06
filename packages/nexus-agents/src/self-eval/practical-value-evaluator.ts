/**
 * Practical Value Evaluator for Self-Evaluation MVP
 *
 * Evaluates practical value: usage, utility, necessity.
 *
 * @module self-eval/practical-value-evaluator
 * (Source: Issue #138, Multi-Agent Evaluation research)
 */

import type { ComponentInfo } from './component-scanner.js';
import type {
  Recommendation,
  MetricCitation,
  EvaluationResult,
  EvaluatorConfig,
} from './evaluation-agents-types.js';
import { BaseEvaluator } from './base-evaluator.js';

/**
 * Evaluates practical value: usage, utility, necessity.
 */
export class PracticalValueEvaluator extends BaseEvaluator {
  constructor(config?: EvaluatorConfig) {
    super('practical-value', config);
  }

  protected async performEvaluation(component: ComponentInfo): Promise<EvaluationResult> {
    // Async for future extension (e.g., usage analytics)
    await Promise.resolve();

    const metrics: MetricCitation[] = [];
    const concerns: string[] = [];
    let score = 1.0;

    // Evaluate exports as proxy for usage
    score = this.evaluateExports(component, metrics, concerns, score);

    // Check special file types (index, test)
    score = this.evaluateSpecialFiles(component, metrics, score);

    // Size-based heuristics
    score = this.evaluateSizeHeuristics(component, metrics, concerns, score);

    const recommendation = this.scoreToRecommendation(score);
    // Confidence rubric (mirrors CodeQualityEvaluator.calculateConfidence): more
    // practical-value metrics observed ⇒ higher confidence, capped at +0.4.
    // Practical value weights evidence presence, so there's no concern penalty.
    const base = 0.5;
    const metricBonus = Math.min(0.4, metrics.length * 0.08);
    const confidence = base + metricBonus;

    return this.createResult(component, recommendation, confidence, metrics, concerns);
  }

  /**
   * Evaluates export count and density as usage indicators.
   */
  private evaluateExports(
    component: ComponentInfo,
    metrics: MetricCitation[],
    concerns: string[],
    score: number
  ): number {
    metrics.push(this.cite('exports', component.exportCount, 'scanner'));

    if (component.exportCount < this.thresholds.minExports && !component.isTest) {
      concerns.push('No exports: component may not be used');
      score -= 0.4;
    }

    if (component.exportCount > 0) {
      const linesPerExport = component.lines / component.exportCount;
      metrics.push(this.cite('linesPerExport', Math.round(linesPerExport), 'static_analysis'));

      if (linesPerExport > 100) {
        concerns.push(`Low export density: ${String(Math.round(linesPerExport))} lines per export`);
        score -= 0.15;
      }
    }

    return score;
  }

  /**
   * Evaluates special file types (index, test) for additional value.
   */
  private evaluateSpecialFiles(
    component: ComponentInfo,
    metrics: MetricCitation[],
    score: number
  ): number {
    const isIndex = component.name === 'index';
    if (isIndex) {
      metrics.push(this.cite('isIndexFile', 'true', 'scanner'));
      score += 0.1;
    }

    if (component.isTest) {
      metrics.push(this.cite('isTest', 'true', 'scanner'));
      score = Math.max(score, 0.7);
    }

    return score;
  }

  /**
   * Evaluates size-based heuristics.
   */
  private evaluateSizeHeuristics(
    component: ComponentInfo,
    metrics: MetricCitation[],
    concerns: string[],
    score: number
  ): number {
    metrics.push(this.cite('sizeBytes', component.sizeBytes, 'scanner'));
    const isIndex = component.name === 'index';

    if (component.sizeBytes < 100 && !isIndex) {
      concerns.push('Very small file: may be trivial or stub');
      score -= 0.1;
    }

    return score;
  }

  private scoreToRecommendation(score: number): Recommendation {
    if (score >= 0.7) return 'retain';
    if (score >= 0.5) return 'review';
    if (score >= 0.3) return 'refactor';
    return 'deprecate';
  }
}
