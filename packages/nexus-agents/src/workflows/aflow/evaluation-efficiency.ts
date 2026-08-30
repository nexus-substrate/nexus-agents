/**
 * nexus-agents/workflows - AFlow Efficiency Evaluation
 *
 * Efficiency scoring methods for workflow evaluation.
 * Measures parallelism, dependency efficiency, timeout, and step count.
 *
 * @module workflows/aflow/evaluation-efficiency
 * (Source: Issue #329, arXiv:2410.10762)
 */

import type { WorkflowDefinition } from '../../core/index.js';
import type { TaskSpecification } from './aflow-types.js';
import { EXECUTION_WEIGHTS } from './evaluation-types.js';

/**
 * Evaluate workflow efficiency.
 * Returns average of parallelism, dependency, timeout, and step count scores.
 */
export function evaluateEfficiency(workflow: WorkflowDefinition, task: TaskSpecification): number {
  const scores: number[] = [
    calculateParallelismScore(workflow),
    calculateDependencyEfficiency(workflow),
    calculateTimeoutScore(workflow, task),
    calculateStepCountScore(workflow, task),
  ];

  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

/**
 * Calculate parallelism score.
 * More parallel steps = higher efficiency.
 */
export function calculateParallelismScore(workflow: WorkflowDefinition): number {
  if (workflow.steps.length <= 1) return 1;

  const parallelSteps = workflow.steps.filter((s) => s.parallel === true).length;
  const maxParallel = Math.max(1, Math.floor(workflow.steps.length / 2));

  return Math.min(1, parallelSteps / maxParallel);
}

/**
 * Calculate dependency efficiency score.
 * Penalizes too few or too many dependencies.
 */
export function calculateDependencyEfficiency(workflow: WorkflowDefinition): number {
  if (workflow.steps.length <= 1) return 1;

  const totalDeps = workflow.steps.reduce((sum, s) => sum + (s.dependsOn?.length ?? 0), 0);
  const maxReasonableDeps = workflow.steps.length - 1;

  if (totalDeps === 0) return 0.5; // No dependencies at all is suboptimal
  if (totalDeps > maxReasonableDeps * 2) return 0; // Too many dependencies

  return 1 - Math.abs(totalDeps - maxReasonableDeps) / (maxReasonableDeps * 2);
}

/**
 * Calculate timeout appropriateness score.
 * Ensures total timeout is within task constraints.
 */
export function calculateTimeoutScore(
  workflow: WorkflowDefinition,
  task: TaskSpecification
): number {
  const maxTotal = task.constraints?.maxTotalTimeout ?? 300000;
  const totalTimeout = workflow.steps.reduce(
    (sum, s) => sum + (s.timeout ?? EXECUTION_WEIGHTS.defaultTimeoutMs),
    0
  );

  if (totalTimeout > maxTotal) {
    return Math.max(0, 1 - (totalTimeout - maxTotal) / maxTotal);
  }

  // Penalize if way under (might indicate missing steps)
  if (totalTimeout < maxTotal * 0.1) {
    return 0.5;
  }

  return 1;
}

/**
 * Calculate step count efficiency score.
 * Ensures step count matches required capabilities.
 */
export function calculateStepCountScore(
  workflow: WorkflowDefinition,
  task: TaskSpecification
): number {
  const stepCount = workflow.steps.length;
  const requiredCount = task.constraints?.requiredAgents?.length ?? 2;

  // Penalize if too few steps for required capabilities
  if (stepCount < requiredCount) {
    return stepCount / requiredCount;
  }

  // Penalize if way too many steps
  if (stepCount > requiredCount * 3) {
    return Math.max(0, 1 - (stepCount - requiredCount * 3) / (requiredCount * 3));
  }

  return 1;
}

/**
 * Calculate redundancy penalty for the workflow.
 * Penalizes duplicate agent-action combos and same-agent sequences.
 */
export function calculateRedundancyPenalty(workflow: WorkflowDefinition): number {
  const penalties: number[] = [];

  // Duplicate agent-action combinations
  const combos = workflow.steps.map((s) => `${s.agent}:${s.action}`);
  const uniqueCombos = new Set(combos);
  if (combos.length > uniqueCombos.size) {
    penalties.push((combos.length - uniqueCombos.size) / combos.length);
  }

  // Sequential steps with same agent (could be combined)
  let sameAgentSequence = 0;
  for (let i = 1; i < workflow.steps.length; i++) {
    const currentStep = workflow.steps[i];
    const prevStep = workflow.steps[i - 1];
    if (currentStep?.agent === prevStep?.agent && currentStep && prevStep) {
      sameAgentSequence++;
    }
  }
  if (workflow.steps.length > 1) {
    penalties.push(sameAgentSequence / (workflow.steps.length - 1));
  }

  return penalties.length > 0 ? penalties.reduce((a, b) => a + b, 0) / penalties.length : 0;
}

/**
 * Relative execution weight of a workflow — a DIMENSIONLESS score, not money.
 *
 * Was called `estimateCost` and fed a result field called `estimatedCost`
 * (#5198). It sums a step count, a retry count and a duration in milliseconds
 * against arbitrary weights, so the result has no unit at all: 100 per step, 50
 * per retry, and milliseconds scaled by 0.001. Nothing here is a rate and no
 * token is involved.
 *
 * The old name made it indistinguishable at a call site from the token→USD
 * paths consolidated under #5122. Comparing it against a budget or a
 * `maxCostUsd` would be meaningless, and the type system could not object —
 * both are `number`. That is the same shape as #5186, where a ceiling was
 * compared against a figure computed at the wrong rate; here the figure has no
 * rate at all.
 *
 * Use it only to rank workflows against each other.
 */
export function estimateExecutionWeight(workflow: WorkflowDefinition): number {
  let weight = 0;
  for (const step of workflow.steps) {
    weight += EXECUTION_WEIGHTS.perStep;
    weight += (step.retries ?? 0) * EXECUTION_WEIGHTS.perRetry;
    weight += (step.timeout ?? EXECUTION_WEIGHTS.defaultTimeoutMs) * EXECUTION_WEIGHTS.perTimeoutMs;
  }

  return Math.round(weight);
}
