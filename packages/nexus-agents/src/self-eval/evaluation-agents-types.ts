/**
 * Evaluation Agents Types and Constants
 *
 * Type definitions for the multi-agent evaluation system.
 *
 * @module self-eval/evaluation-agents-types
 * (Source: Issue #138, Multi-Agent Evaluation research)
 */

import type { ILogger } from '../core/index.js';
import { SINGLE_LLM_EVAL_TIMEOUT_MS } from '../config/timeouts.js';

// ============================================================================
// Result Types
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

// ============================================================================
// Configuration Types
// ============================================================================

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

/**
 * Default thresholds for evaluation.
 */
export const DEFAULT_THRESHOLDS: Required<EvaluationThresholds> = {
  maxComplexity: 20,
  maxLines: 400,
  minExports: 1,
  maxDependencies: 15,
} as const;

/**
 * Default timeout in milliseconds. Runaway-guard for a single component's
 * LLM-backed evaluation (#3736): was a punitive 30s literal; raised to the
 * central single-llm class guard (300s).
 */
export const DEFAULT_TIMEOUT_MS = SINGLE_LLM_EVAL_TIMEOUT_MS;
