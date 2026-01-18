/**
 * Evaluation Agents for Self-Evaluation MVP
 *
 * Three specialized agents that assess components from different perspectives.
 * All outputs are RECOMMENDATIONS for human review, not decisions.
 *
 * This file re-exports the evaluator classes from their individual modules
 * and provides factory functions for creating evaluator instances.
 *
 * @module self-eval/evaluation-agents
 * (Source: Issue #138, Multi-Agent Evaluation research)
 */

import type { ComponentInfo } from './component-scanner.js';
import type { EvaluationResult, EvaluatorConfig } from './evaluation-agents-types.js';

// Re-export types for backward compatibility
export type {
  Recommendation,
  MetricSource,
  MetricCitation,
  EvaluationResult,
  EvaluatorRole,
  EvaluatorConfig,
  EvaluationThresholds,
} from './evaluation-agents-types.js';
export { DEFAULT_THRESHOLDS, DEFAULT_TIMEOUT_MS } from './evaluation-agents-types.js';

// Re-export evaluator classes
export { BaseEvaluator } from './base-evaluator.js';
export { CodeQualityEvaluator } from './code-quality-evaluator.js';
export { ArchitectureFitEvaluator } from './architecture-fit-evaluator.js';
export { PracticalValueEvaluator } from './practical-value-evaluator.js';

// Import for factory functions
import { CodeQualityEvaluator } from './code-quality-evaluator.js';
import { ArchitectureFitEvaluator } from './architecture-fit-evaluator.js';
import { PracticalValueEvaluator } from './practical-value-evaluator.js';

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
