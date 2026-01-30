/**
 * Task Complexity Estimator
 *
 * Estimates task complexity for quality-constrained routing decisions.
 * Part of the RouteLLM implementation (arXiv:2406.18510).
 *
 * @module adapters/complexity-estimator
 * (Source: Issue #128, arXiv:2406.18510)
 */

import type { Task, ILogger, TaskType, ClassificationResult } from '../core/index.js';
import { createLogger, createTaskTypeClassifier } from '../core/index.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Complexity level for tasks.
 */
export type ComplexityLevel = 'simple' | 'moderate' | 'complex' | 'expert';

/**
 * Task complexity estimation result.
 */
export interface ComplexityEstimate {
  /** Complexity level */
  readonly level: ComplexityLevel;
  /** Numeric score (0-1) */
  readonly score: number;
  /** Factors contributing to complexity */
  readonly factors: ComplexityFactors;
  /** Task type from classifier */
  readonly taskType: TaskType;
  /** Task type confidence */
  readonly taskTypeConfidence: number;
}

/**
 * Factors used to estimate complexity.
 */
export interface ComplexityFactors {
  /** Length factor (longer = more complex) */
  readonly lengthFactor: number;
  /** Nested structure factor */
  readonly structureFactor: number;
  /** Domain specificity factor */
  readonly domainFactor: number;
  /** Multi-step reasoning factor */
  readonly reasoningFactor: number;
  /** Tool/capability requirements */
  readonly toolFactor: number;
}

// ============================================================================
// Constants
// ============================================================================

/** Complexity thresholds for level classification. */
const COMPLEXITY_THRESHOLDS = {
  simple: 0.25,
  moderate: 0.5,
  complex: 0.75,
} as const;

/** Patterns indicating multi-step reasoning. */
const MULTI_STEP_PATTERNS = [
  /\b(first|then|next|after|finally|step)\b/i,
  /\b(1\.|2\.|3\.|\d+\))/,
  /\b(implement|design|architect|plan)\b/i,
  /\b(analyze|evaluate|compare|contrast)\b/i,
  /\b(debug|troubleshoot|diagnose|fix)\b/i,
] as const;

/** Patterns indicating domain specificity. */
const DOMAIN_PATTERNS = [
  /\b(kubernetes|k8s|docker|terraform)\b/i,
  /\b(react|vue|angular|svelte)\b/i,
  /\b(python|typescript|rust|go)\b/i,
  /\b(api|rest|graphql|grpc)\b/i,
  /\b(security|auth|oauth|jwt)\b/i,
  /\b(database|sql|nosql|mongodb)\b/i,
] as const;

/** Patterns indicating tool requirements. */
const TOOL_PATTERNS = [
  /\b(read|write|edit|create)\s+(file|code|script)/i,
  /\b(run|execute|test|build)\b/i,
  /\b(search|find|grep|locate)\b/i,
  /\b(git|npm|pnpm|yarn)\b/i,
] as const;

/** Weights for computing overall complexity score. */
const FACTOR_WEIGHTS = {
  length: 0.15,
  structure: 0.15,
  domain: 0.2,
  reasoning: 0.3,
  tool: 0.2,
} as const;

// ============================================================================
// Task Complexity Estimator
// ============================================================================

/**
 * Estimates task complexity for routing decisions.
 */
export class TaskComplexityEstimator {
  private readonly classifier = createTaskTypeClassifier();
  private readonly log: ILogger;

  constructor(logger?: ILogger) {
    this.log = logger ?? createLogger({ component: 'complexity-estimator' });
  }

  /**
   * Estimate task complexity.
   */
  estimate(task: Task): ComplexityEstimate {
    const content = this.getTaskContent(task);
    const classification = this.classifier.classify(task);

    const factors = this.computeFactors(content, classification);
    const score = this.computeScore(factors);
    const level = this.scoreToLevel(score);

    this.log.debug('Complexity estimated', { level, score, taskType: classification.type });

    return {
      level,
      score,
      factors,
      taskType: classification.type,
      taskTypeConfidence: classification.confidence,
    };
  }

  private getTaskContent(task: Task): string {
    const parts: string[] = [task.description];
    if (task.context.history) {
      parts.push(...task.context.history.map((h) => h.content));
    }
    return parts.join(' ');
  }

  private computeFactors(content: string, classification: ClassificationResult): ComplexityFactors {
    return {
      lengthFactor: this.computeLengthFactor(content),
      structureFactor: this.computeStructureFactor(content),
      domainFactor: this.computeDomainFactor(content),
      reasoningFactor: this.computeReasoningFactor(content, classification),
      toolFactor: this.computeToolFactor(content),
    };
  }

  private computeLengthFactor(content: string): number {
    const words = content.split(/\s+/).length;
    if (words < 50) return 0.2;
    if (words < 200) return 0.3 + (words - 50) * 0.002;
    if (words < 500) return 0.5 + (words - 200) * 0.001;
    return Math.min(0.9, 0.8 + (words - 500) * 0.0002);
  }

  private computeStructureFactor(content: string): number {
    let score = 0;
    if (/```[\s\S]*```/.test(content)) score += 0.3;
    if (/^\s*\d+\./m.test(content)) score += 0.2;
    if (/^\s{4,}/m.test(content)) score += 0.2;
    const questionCount = (content.match(/\?/g) ?? []).length;
    if (questionCount > 1) score += 0.2;
    return Math.min(1, score);
  }

  private computeDomainFactor(content: string): number {
    let matches = 0;
    for (const pattern of DOMAIN_PATTERNS) {
      if (pattern.test(content)) matches++;
    }
    return Math.min(1, 0.2 + matches * 0.2);
  }

  private computeReasoningFactor(content: string, classification: ClassificationResult): number {
    let score = classification.type === 'reasoning' ? 0.4 : 0.2;
    for (const pattern of MULTI_STEP_PATTERNS) {
      if (pattern.test(content)) score += 0.1;
    }
    return Math.min(1, score);
  }

  private computeToolFactor(content: string): number {
    let matches = 0;
    for (const pattern of TOOL_PATTERNS) {
      if (pattern.test(content)) matches++;
    }
    return Math.min(1, matches * 0.25);
  }

  private computeScore(factors: ComplexityFactors): number {
    return (
      factors.lengthFactor * FACTOR_WEIGHTS.length +
      factors.structureFactor * FACTOR_WEIGHTS.structure +
      factors.domainFactor * FACTOR_WEIGHTS.domain +
      factors.reasoningFactor * FACTOR_WEIGHTS.reasoning +
      factors.toolFactor * FACTOR_WEIGHTS.tool
    );
  }

  private scoreToLevel(score: number): ComplexityLevel {
    if (score < COMPLEXITY_THRESHOLDS.simple) return 'simple';
    if (score < COMPLEXITY_THRESHOLDS.moderate) return 'moderate';
    if (score < COMPLEXITY_THRESHOLDS.complex) return 'complex';
    return 'expert';
  }
}

/**
 * Creates a task complexity estimator.
 */
export function createComplexityEstimator(logger?: ILogger): TaskComplexityEstimator {
  return new TaskComplexityEstimator(logger);
}
