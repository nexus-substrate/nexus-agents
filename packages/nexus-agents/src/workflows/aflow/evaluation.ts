/**
 * nexus-agents/workflows - AFlow Workflow Evaluation
 *
 * Evaluation functions for scoring generated workflows.
 * Used during MCTS simulation phase to assess workflow quality.
 *
 * @module workflows/aflow/evaluation
 * (Source: Issue #329, arXiv:2410.10762)
 */

import type { WorkflowDefinition } from '../../core/index.js';
import type { EvaluationResult, TaskSpecification } from './aflow-types.js';
import { clamp01 } from '../../utils/math-utils.js';

// Re-export types and constants for backward compatibility
export type { EvaluationWeights } from './evaluation-types.js';
export { DEFAULT_EVALUATION_WEIGHTS } from './evaluation-types.js';

// Import from split modules
import { DEFAULT_EVALUATION_WEIGHTS, type EvaluationWeights } from './evaluation-types.js';
import { evaluateStructure, isViableWorkflow, hasNoCycles } from './evaluation-structure.js';
import {
  evaluateEfficiency,
  calculateRedundancyPenalty,
  estimateExecutionWeight,
} from './evaluation-efficiency.js';
import { evaluateCompleteness, generateFeedback } from './evaluation-completeness.js';

/**
 * Workflow evaluator for AFlow.
 */
export class WorkflowEvaluator {
  private readonly weights: EvaluationWeights;

  constructor(weights: Partial<EvaluationWeights> = {}) {
    this.weights = { ...DEFAULT_EVALUATION_WEIGHTS, ...weights };
  }

  /**
   * Evaluate a workflow against a task specification.
   */
  evaluate(workflow: WorkflowDefinition, task: TaskSpecification): EvaluationResult {
    const structureScore = this.evaluateStructure(workflow);
    const efficiencyScore = this.evaluateEfficiency(workflow, task);
    const completenessScore = this.evaluateCompleteness(workflow, task);
    const redundancyPenalty = this.calculateRedundancyPenalty(workflow);
    const feedback = this.generateFeedback(workflow, task);
    const executionWeight = this.estimateExecutionWeight(workflow);

    const score = this.calculateOverallScore(
      structureScore,
      efficiencyScore,
      completenessScore,
      redundancyPenalty
    );

    return {
      score,
      structureScore,
      efficiencyScore,
      completenessScore,
      redundancyPenalty,
      feedback,
      executionWeight,
    };
  }

  /**
   * Calculate overall score from components.
   */
  private calculateOverallScore(
    structure: number,
    efficiency: number,
    completeness: number,
    redundancy: number
  ): number {
    const raw =
      structure * this.weights.structure +
      efficiency * this.weights.efficiency +
      completeness * this.weights.completeness -
      redundancy * this.weights.redundancyPenalty;

    // Clamp to 0-1
    return clamp01(raw);
  }

  /**
   * Evaluate workflow structural validity.
   */
  evaluateStructure(workflow: WorkflowDefinition): number {
    return evaluateStructure(workflow);
  }

  /**
   * Evaluate workflow efficiency.
   */
  evaluateEfficiency(workflow: WorkflowDefinition, task: TaskSpecification): number {
    return evaluateEfficiency(workflow, task);
  }

  /**
   * Evaluate workflow completeness against task requirements.
   */
  evaluateCompleteness(workflow: WorkflowDefinition, task: TaskSpecification): number {
    return evaluateCompleteness(workflow, task);
  }

  /**
   * Calculate redundancy penalty.
   */
  calculateRedundancyPenalty(workflow: WorkflowDefinition): number {
    return calculateRedundancyPenalty(workflow);
  }

  /**
   * Generate human-readable feedback about the workflow.
   */
  generateFeedback(workflow: WorkflowDefinition, task: TaskSpecification): readonly string[] {
    return generateFeedback(workflow, task);
  }

  /**
   * Estimate execution cost based on step configuration.
   */
  estimateExecutionWeight(workflow: WorkflowDefinition): number {
    return estimateExecutionWeight(workflow);
  }

  /**
   * Quick check if workflow is minimally viable.
   */
  isViable(workflow: WorkflowDefinition, minSteps: number): boolean {
    return isViableWorkflow(workflow, minSteps);
  }

  /**
   * Check if workflow has no dependency cycles.
   * Exposed for feedback generation.
   */
  protected hasNoCycles(workflow: WorkflowDefinition): boolean {
    return hasNoCycles(workflow);
  }
}

/**
 * Create a workflow evaluator with optional weights.
 */
export function createWorkflowEvaluator(weights?: Partial<EvaluationWeights>): WorkflowEvaluator {
  return new WorkflowEvaluator(weights);
}
