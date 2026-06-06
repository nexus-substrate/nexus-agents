/**
 * Architecture Fit Evaluator for Self-Evaluation MVP
 *
 * Evaluates architecture fit: interface compliance, coupling, patterns.
 *
 * @module self-eval/architecture-fit-evaluator
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
 * Evaluates architecture fit: interface compliance, coupling, patterns.
 */
export class ArchitectureFitEvaluator extends BaseEvaluator {
  constructor(config?: EvaluatorConfig) {
    super('architecture-fit', config);
  }

  protected async performEvaluation(component: ComponentInfo): Promise<EvaluationResult> {
    // Async for future extension (e.g., external analysis tools)
    await Promise.resolve();

    const metrics: MetricCitation[] = [];
    const concerns: string[] = [];
    let score = 1.0;

    // Check dependency count (coupling indicator)
    score = this.evaluateDependencies(component, metrics, concerns, score);

    // Check relative vs external dependencies
    this.categorizeDependencies(component, metrics);

    // Check export count (interface surface)
    score = this.evaluateExports(component, metrics, concerns, score);

    // Check for node: imports (good practice)
    this.checkNodeProtocolImports(component, metrics);

    const recommendation = this.scoreToRecommendation(score);
    // Confidence rubric (mirrors CodeQualityEvaluator.calculateConfidence): more
    // architectural metrics observed ⇒ higher confidence, capped at +0.3. No
    // concern penalty — architecture fit is judged on positive signals here.
    const base = 0.6;
    const metricBonus = Math.min(0.3, metrics.length * 0.05);
    const confidence = base + metricBonus;

    return this.createResult(component, recommendation, confidence, metrics, concerns);
  }

  /**
   * Evaluates dependency count as a coupling indicator.
   */
  private evaluateDependencies(
    component: ComponentInfo,
    metrics: MetricCitation[],
    concerns: string[],
    score: number
  ): number {
    const depCount = component.dependencies.length;
    metrics.push(this.cite('dependencies', depCount, 'scanner'));

    if (depCount > this.thresholds.maxDependencies) {
      metrics.push(
        this.cite('maxDependencies', depCount, 'scanner', this.thresholds.maxDependencies)
      );
      concerns.push(
        `High coupling: ${String(depCount)} dependencies exceeds ${String(this.thresholds.maxDependencies)}`
      );
      return score - 0.25;
    }

    return score;
  }

  /**
   * Categorizes dependencies as relative vs external.
   */
  private categorizeDependencies(component: ComponentInfo, metrics: MetricCitation[]): void {
    const relativeDeps = component.dependencies.filter((d) => d.startsWith('.'));
    const externalDeps = component.dependencies.filter((d) => !d.startsWith('.'));

    metrics.push(this.cite('relativeDependencies', relativeDeps.length, 'scanner'));
    metrics.push(this.cite('externalDependencies', externalDeps.length, 'scanner'));
  }

  /**
   * Evaluates export count as interface surface indicator.
   */
  private evaluateExports(
    component: ComponentInfo,
    metrics: MetricCitation[],
    concerns: string[],
    score: number
  ): number {
    metrics.push(this.cite('exports', component.exportCount, 'scanner'));

    if (component.exportCount === 0 && !component.isTest) {
      concerns.push('No exports: may be dead code or missing public interface');
      score -= 0.3;
    }

    // Large files with many exports might be "god objects"
    if (component.exportCount > 20 && component.lines > 300) {
      concerns.push('Large file with many exports: consider splitting');
      score -= 0.2;
    }

    return score;
  }

  /**
   * Checks for node: protocol imports (good practice indicator).
   */
  private checkNodeProtocolImports(component: ComponentInfo, metrics: MetricCitation[]): void {
    const nodeImports = component.dependencies.filter((d) => d.startsWith('node:'));
    if (nodeImports.length > 0) {
      metrics.push(this.cite('nodeProtocolImports', nodeImports.length, 'scanner'));
    }
  }

  private scoreToRecommendation(score: number): Recommendation {
    if (score >= 0.75) return 'retain';
    if (score >= 0.5) return 'review';
    if (score >= 0.25) return 'refactor';
    return 'deprecate';
  }
}
