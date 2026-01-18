/**
 * Code Quality Evaluator for Self-Evaluation MVP
 *
 * Evaluates code quality: maintainability, complexity, test coverage.
 *
 * @module self-eval/code-quality-evaluator
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
 * Evaluates code quality: maintainability, complexity, test coverage.
 */
export class CodeQualityEvaluator extends BaseEvaluator {
  constructor(config?: EvaluatorConfig) {
    super('code-quality', config);
  }

  protected async performEvaluation(component: ComponentInfo): Promise<EvaluationResult> {
    // Async for future extension (e.g., external metric fetching)
    await Promise.resolve();

    const metrics: MetricCitation[] = [];
    const concerns: string[] = [];
    let score = 1.0;

    // Check complexity
    score = this.evaluateComplexity(component, metrics, concerns, score);

    // Check file length
    score = this.evaluateFileLength(component, metrics, concerns, score);

    // Check test coverage if available
    score = this.evaluateTestCoverage(component, metrics, concerns, score);

    const recommendation = this.scoreToRecommendation(score);
    const confidence = this.calculateConfidence(metrics.length, concerns.length);

    return this.createResult(component, recommendation, confidence, metrics, concerns);
  }

  /**
   * Evaluates cyclomatic complexity.
   */
  private evaluateComplexity(
    component: ComponentInfo,
    metrics: MetricCitation[],
    concerns: string[],
    score: number
  ): number {
    if (component.complexity > this.thresholds.maxComplexity) {
      metrics.push(
        this.cite('complexity', component.complexity, 'scanner', this.thresholds.maxComplexity)
      );
      concerns.push(
        `High complexity: ${String(component.complexity)} exceeds threshold ${String(this.thresholds.maxComplexity)}`
      );
      return score - 0.3;
    }
    metrics.push(this.cite('complexity', component.complexity, 'scanner'));
    return score;
  }

  /**
   * Evaluates file length against threshold.
   */
  private evaluateFileLength(
    component: ComponentInfo,
    metrics: MetricCitation[],
    concerns: string[],
    score: number
  ): number {
    if (component.lines > this.thresholds.maxLines) {
      metrics.push(this.cite('lines', component.lines, 'scanner', this.thresholds.maxLines));
      concerns.push(
        `File too long: ${String(component.lines)} lines exceeds ${String(this.thresholds.maxLines)}`
      );
      return score - 0.25;
    }
    metrics.push(this.cite('lines', component.lines, 'scanner'));
    return score;
  }

  /**
   * Evaluates test coverage if available.
   */
  private evaluateTestCoverage(
    component: ComponentInfo,
    metrics: MetricCitation[],
    concerns: string[],
    score: number
  ): number {
    if (component.testCoverage !== null) {
      metrics.push(
        this.cite('testCoverage', `${String(component.testCoverage)}%`, 'coverage_report')
      );
      if (component.testCoverage < 50) {
        concerns.push(`Low test coverage: ${String(component.testCoverage)}%`);
        return score - 0.2;
      }
    }

    // Check if it's a test file (tests don't need test coverage)
    if (component.isTest) {
      metrics.push(this.cite('isTest', 'true', 'scanner'));
    }

    return score;
  }

  private scoreToRecommendation(score: number): Recommendation {
    if (score >= 0.8) return 'retain';
    if (score >= 0.5) return 'review';
    if (score >= 0.3) return 'refactor';
    return 'deprecate';
  }

  private calculateConfidence(metricCount: number, concernCount: number): number {
    // More metrics = higher confidence, more concerns = slightly lower
    const base = 0.5;
    const metricBonus = Math.min(0.4, metricCount * 0.1);
    const concernPenalty = Math.min(0.2, concernCount * 0.05);
    return base + metricBonus - concernPenalty;
  }
}
