/**
 * Evaluation Agents for Self-Evaluation MVP
 *
 * Three specialized agents that assess components from different perspectives.
 * All outputs are RECOMMENDATIONS for human review, not decisions.
 *
 * @module self-eval/evaluation-agents
 * (Source: Issue #138, Multi-Agent Evaluation research)
 */

import type { ComponentInfo } from './component-scanner.js';
import type { ILogger } from '../core/index.js';
import { createLogger } from '../core/index.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Recommendation types for components.
 */
export type Recommendation = 'retain' | 'refactor' | 'review' | 'deprecate';

/**
 * Source of a metric citation.
 */
export type MetricSource = 'scanner' | 'coverage_report' | 'git_history' | 'static_analysis';

/**
 * Citation of a specific metric as evidence.
 * Per AI/ML approval: all claims must cite objective metrics.
 */
export interface MetricCitation {
  /** Metric name */
  readonly metric: string;
  /** Actual value */
  readonly value: number | string;
  /** Threshold that triggered the concern (if applicable) */
  readonly threshold?: number | string;
  /** Source of this metric */
  readonly source: MetricSource;
}

/**
 * Result from a single evaluator agent.
 * Per AI/ML approval: isRecommendation must always be true.
 */
export interface EvaluationResult {
  /** Component path */
  readonly component: string;
  /** Recommendation for this component */
  readonly recommendation: Recommendation;
  /** Confidence in this recommendation (0-1) */
  readonly confidence: number;
  /** Metric citations supporting this recommendation */
  readonly metrics: readonly MetricCitation[];
  /** Specific concerns identified */
  readonly concerns: readonly string[];
  /** Explicit flag: this is a recommendation, not a decision */
  readonly isRecommendation: true;
  /** Agent that produced this evaluation */
  readonly agent: EvaluatorRole;
  /** Evaluation timestamp */
  readonly timestamp: Date;
}

/**
 * Available evaluator roles.
 */
export type EvaluatorRole = 'code-quality' | 'architecture-fit' | 'practical-value';

/**
 * Configuration for evaluation agents.
 */
export interface EvaluatorConfig {
  /** Timeout per evaluation in ms (default: 30000) */
  readonly timeoutMs?: number;
  /** Logger instance */
  readonly logger?: ILogger;
  /** Thresholds for code quality metrics */
  readonly thresholds?: EvaluationThresholds;
}

/**
 * Configurable thresholds for evaluation.
 */
export interface EvaluationThresholds {
  /** Max complexity before flagging (default: 20) */
  readonly maxComplexity?: number;
  /** Max lines before flagging (default: 400) */
  readonly maxLines?: number;
  /** Min export count to be considered "used" (default: 1) */
  readonly minExports?: number;
  /** Max dependencies before flagging coupling (default: 15) */
  readonly maxDependencies?: number;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_THRESHOLDS: Required<EvaluationThresholds> = {
  maxComplexity: 20,
  maxLines: 400,
  minExports: 1,
  maxDependencies: 15,
} as const;

const DEFAULT_TIMEOUT_MS = 30_000;

// ============================================================================
// Base Evaluator
// ============================================================================

/**
 * Base class for evaluation agents.
 */
abstract class BaseEvaluator {
  protected readonly log: ILogger;
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

// ============================================================================
// Code Quality Evaluator
// ============================================================================

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
    if (component.complexity > this.thresholds.maxComplexity) {
      metrics.push(
        this.cite('complexity', component.complexity, 'scanner', this.thresholds.maxComplexity)
      );
      concerns.push(
        `High complexity: ${String(component.complexity)} exceeds threshold ${String(this.thresholds.maxComplexity)}`
      );
      score -= 0.3;
    } else {
      metrics.push(this.cite('complexity', component.complexity, 'scanner'));
    }

    // Check file length
    if (component.lines > this.thresholds.maxLines) {
      metrics.push(this.cite('lines', component.lines, 'scanner', this.thresholds.maxLines));
      concerns.push(
        `File too long: ${String(component.lines)} lines exceeds ${String(this.thresholds.maxLines)}`
      );
      score -= 0.25;
    } else {
      metrics.push(this.cite('lines', component.lines, 'scanner'));
    }

    // Check test coverage if available
    if (component.testCoverage !== null) {
      metrics.push(
        this.cite('testCoverage', `${String(component.testCoverage)}%`, 'coverage_report')
      );
      if (component.testCoverage < 50) {
        concerns.push(`Low test coverage: ${String(component.testCoverage)}%`);
        score -= 0.2;
      }
    }

    // Check if it's a test file (tests don't need test coverage)
    if (component.isTest) {
      metrics.push(this.cite('isTest', 'true', 'scanner'));
    }

    const recommendation = this.scoreToRecommendation(score);
    const confidence = this.calculateConfidence(metrics.length, concerns.length);

    return this.createResult(component, recommendation, confidence, metrics, concerns);
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

// ============================================================================
// Architecture Fit Evaluator
// ============================================================================

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
    const depCount = component.dependencies.length;
    metrics.push(this.cite('dependencies', depCount, 'scanner'));

    if (depCount > this.thresholds.maxDependencies) {
      metrics.push(
        this.cite('maxDependencies', depCount, 'scanner', this.thresholds.maxDependencies)
      );
      concerns.push(
        `High coupling: ${String(depCount)} dependencies exceeds ${String(this.thresholds.maxDependencies)}`
      );
      score -= 0.25;
    }

    // Check for circular/relative dependency patterns
    const relativeDeps = component.dependencies.filter((d) => d.startsWith('.'));
    const externalDeps = component.dependencies.filter((d) => !d.startsWith('.'));

    metrics.push(this.cite('relativeDependencies', relativeDeps.length, 'scanner'));
    metrics.push(this.cite('externalDependencies', externalDeps.length, 'scanner'));

    // Check export count (interface surface)
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

    // Check for node: imports (good practice)
    const nodeImports = component.dependencies.filter((d) => d.startsWith('node:'));
    if (nodeImports.length > 0) {
      metrics.push(this.cite('nodeProtocolImports', nodeImports.length, 'scanner'));
    }

    const recommendation = this.scoreToRecommendation(score);
    const confidence = 0.6 + Math.min(0.3, metrics.length * 0.05);

    return this.createResult(component, recommendation, confidence, metrics, concerns);
  }

  private scoreToRecommendation(score: number): Recommendation {
    if (score >= 0.75) return 'retain';
    if (score >= 0.5) return 'review';
    if (score >= 0.25) return 'refactor';
    return 'deprecate';
  }
}

// ============================================================================
// Practical Value Evaluator
// ============================================================================

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

    // Check exports as proxy for usage
    metrics.push(this.cite('exports', component.exportCount, 'scanner'));

    if (component.exportCount < this.thresholds.minExports && !component.isTest) {
      concerns.push('No exports: component may not be used');
      score -= 0.4;
    }

    // Check file size vs export ratio (efficiency)
    if (component.exportCount > 0) {
      const linesPerExport = component.lines / component.exportCount;
      metrics.push(this.cite('linesPerExport', Math.round(linesPerExport), 'static_analysis'));

      if (linesPerExport > 100) {
        concerns.push(`Low export density: ${String(Math.round(linesPerExport))} lines per export`);
        score -= 0.15;
      }
    }

    // Check if this is an index/barrel file
    const isIndex = component.name === 'index';
    if (isIndex) {
      metrics.push(this.cite('isIndexFile', 'true', 'scanner'));
      // Index files are typically valuable as entry points
      score += 0.1;
    }

    // Check if test file (tests are valuable)
    if (component.isTest) {
      metrics.push(this.cite('isTest', 'true', 'scanner'));
      // Test files are valuable, don't deprecate
      score = Math.max(score, 0.7);
    }

    // Size-based heuristics
    metrics.push(this.cite('sizeBytes', component.sizeBytes, 'scanner'));

    if (component.sizeBytes < 100 && !isIndex) {
      concerns.push('Very small file: may be trivial or stub');
      score -= 0.1;
    }

    const recommendation = this.scoreToRecommendation(score);
    const confidence = 0.5 + Math.min(0.4, metrics.length * 0.08);

    return this.createResult(component, recommendation, confidence, metrics, concerns);
  }

  private scoreToRecommendation(score: number): Recommendation {
    if (score >= 0.7) return 'retain';
    if (score >= 0.5) return 'review';
    if (score >= 0.3) return 'refactor';
    return 'deprecate';
  }
}

// ============================================================================
// Evaluator Factory
// ============================================================================

/**
 * Create all three evaluator agents.
 */
export function createEvaluators(config?: EvaluatorConfig): {
  codeQuality: CodeQualityEvaluator;
  architectureFit: ArchitectureFitEvaluator;
  practicalValue: PracticalValueEvaluator;
} {
  return {
    codeQuality: new CodeQualityEvaluator(config),
    architectureFit: new ArchitectureFitEvaluator(config),
    practicalValue: new PracticalValueEvaluator(config),
  };
}

/**
 * Run all evaluators on a component and return results.
 */
export async function evaluateComponent(
  component: ComponentInfo,
  config?: EvaluatorConfig
): Promise<readonly EvaluationResult[]> {
  const evaluators = createEvaluators(config);

  const results = await Promise.all([
    evaluators.codeQuality.evaluate(component),
    evaluators.architectureFit.evaluate(component),
    evaluators.practicalValue.evaluate(component),
  ]);

  return results;
}
