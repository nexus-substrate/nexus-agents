/**
 * nexus-agents/workflows - Mutation Operators
 *
 * Operators for mutating workflow definitions during evolution.
 * Each operator makes small, targeted changes to workflow parameters.
 *
 * @module workflows/self-evolving/mutation-operators
 * (Source: Issue #330)
 */

import type { WorkflowDefinition, WorkflowStep } from '../../core/index.js';
import type {
  WorkflowMutation,
  TimeoutAdjustment,
  RetryAdjustment,
  StepReorder,
  ParallelizationChange,
  EvolutionConfig,
} from './sew-types.js';
import { findReorderableSteps, findParallelizableSteps } from './sew-types.js';

/**
 * Default timeout value when step has none defined.
 */
const DEFAULT_TIMEOUT_MS = 30000;

/**
 * Default retry count when step has none defined.
 */
const DEFAULT_RETRIES = 0;

/**
 * Minimum timeout value (1 second).
 */
const MIN_TIMEOUT_MS = 1000;

/**
 * Maximum timeout value (10 minutes).
 */
const MAX_TIMEOUT_MS = 600000;

/**
 * Minimum retry count.
 */
const MIN_RETRIES = 0;

/**
 * Maximum retry count.
 */
const MAX_RETRIES = 10;

/**
 * Adjust timeout for a specific step.
 *
 * @param workflow - The workflow to mutate
 * @param stepId - The step to modify
 * @param factor - Adjustment factor (e.g., 1.2 for +20%, 0.8 for -20%)
 * @returns Mutated workflow and mutation record, or null if step not found
 */
export function adjustTimeout(
  workflow: WorkflowDefinition,
  stepId: string,
  factor: number
): { workflow: WorkflowDefinition; mutation: TimeoutAdjustment } | null {
  const stepIndex = workflow.steps.findIndex((s) => s.id === stepId);
  if (stepIndex === -1) return null;

  const step = workflow.steps[stepIndex];
  if (!step) return null;

  const originalValue = step.timeout ?? DEFAULT_TIMEOUT_MS;
  const newValue = Math.round(
    Math.max(MIN_TIMEOUT_MS, Math.min(MAX_TIMEOUT_MS, originalValue * factor))
  );

  // Skip if no effective change
  if (newValue === originalValue) return null;

  const mutatedStep: WorkflowStep = {
    ...step,
    timeout: newValue,
  };

  const mutatedSteps = [...workflow.steps];
  mutatedSteps[stepIndex] = mutatedStep;

  const mutation: TimeoutAdjustment = {
    type: 'timeout_adjustment',
    stepId,
    originalValue,
    newValue,
    factor,
  };

  return {
    workflow: {
      ...workflow,
      steps: mutatedSteps,
    },
    mutation,
  };
}

/**
 * Adjust retry count for a specific step.
 *
 * @param workflow - The workflow to mutate
 * @param stepId - The step to modify
 * @param delta - Change in retry count (e.g., +1 or -1)
 * @returns Mutated workflow and mutation record, or null if step not found
 */
export function adjustRetries(
  workflow: WorkflowDefinition,
  stepId: string,
  delta: number
): { workflow: WorkflowDefinition; mutation: RetryAdjustment } | null {
  const stepIndex = workflow.steps.findIndex((s) => s.id === stepId);
  if (stepIndex === -1) return null;

  const step = workflow.steps[stepIndex];
  if (!step) return null;

  const originalValue = step.retries ?? DEFAULT_RETRIES;
  const newValue = Math.max(MIN_RETRIES, Math.min(MAX_RETRIES, originalValue + delta));

  // Skip if no effective change
  if (newValue === originalValue) return null;

  const mutatedStep: WorkflowStep = {
    ...step,
    retries: newValue,
  };

  const mutatedSteps = [...workflow.steps];
  mutatedSteps[stepIndex] = mutatedStep;

  const mutation: RetryAdjustment = {
    type: 'retry_adjustment',
    stepId,
    originalValue,
    newValue,
    delta,
  };

  return {
    workflow: {
      ...workflow,
      steps: mutatedSteps,
    },
    mutation,
  };
}

/**
 * Reorder independent steps in a workflow.
 *
 * @param workflow - The workflow to mutate
 * @returns Mutated workflow and mutation record, or null if no reorderable steps
 */
export function reorderSteps(
  workflow: WorkflowDefinition
): { workflow: WorkflowDefinition; mutation: StepReorder } | null {
  const reorderablePairs = findReorderableSteps(workflow.steps);
  if (reorderablePairs.length === 0) return null;

  // Pick a random pair
  const pairIndex = Math.floor(Math.random() * reorderablePairs.length);
  const pair = reorderablePairs[pairIndex];
  if (!pair) return null;

  const [stepA, stepB] = pair;
  const fromIndex = workflow.steps.findIndex((s) => s.id === stepA.id);
  const toIndex = workflow.steps.findIndex((s) => s.id === stepB.id);

  if (fromIndex === -1 || toIndex === -1) return null;

  // Swap the steps
  const mutatedSteps = [...workflow.steps];
  const fromStep = mutatedSteps[fromIndex];
  const toStep = mutatedSteps[toIndex];
  if (!fromStep || !toStep) return null;

  mutatedSteps[fromIndex] = toStep;
  mutatedSteps[toIndex] = fromStep;

  const mutation: StepReorder = {
    type: 'step_reorder',
    stepId: stepA.id,
    fromIndex,
    toIndex,
  };

  return {
    workflow: {
      ...workflow,
      steps: mutatedSteps,
    },
    mutation,
  };
}

/**
 * Add parallelization to a group of independent steps.
 *
 * @param workflow - The workflow to mutate
 * @returns Mutated workflow and mutation record, or null if no parallelizable steps
 */
export function addParallelization(
  workflow: WorkflowDefinition
): { workflow: WorkflowDefinition; mutation: ParallelizationChange } | null {
  const parallelGroups = findParallelizableSteps(workflow.steps);
  if (parallelGroups.length === 0) return null;

  // Pick a random group
  const groupIndex = Math.floor(Math.random() * parallelGroups.length);
  const group = parallelGroups[groupIndex];
  if (!group || group.length < 2) return null;

  const stepIds = group.map((s) => s.id);
  const stepIdSet = new Set(stepIds);

  const mutatedSteps = workflow.steps.map((step) =>
    stepIdSet.has(step.id) ? { ...step, parallel: true } : step
  );

  const mutation: ParallelizationChange = {
    type: 'add_parallelization',
    stepIds,
  };

  return {
    workflow: {
      ...workflow,
      steps: mutatedSteps,
    },
    mutation,
  };
}

/**
 * Remove parallelization from steps (convert back to sequential).
 *
 * @param workflow - The workflow to mutate
 * @returns Mutated workflow and mutation record, or null if no parallel steps
 */
export function removeParallelization(
  workflow: WorkflowDefinition
): { workflow: WorkflowDefinition; mutation: ParallelizationChange } | null {
  const parallelSteps = workflow.steps.filter((s) => s.parallel === true);
  if (parallelSteps.length === 0) return null;

  const stepIds = parallelSteps.map((s) => s.id);
  const stepIdSet = new Set(stepIds);

  const mutatedSteps = workflow.steps.map((step) =>
    stepIdSet.has(step.id) ? { ...step, parallel: false } : step
  );

  const mutation: ParallelizationChange = {
    type: 'remove_parallelization',
    stepIds,
  };

  return {
    workflow: {
      ...workflow,
      steps: mutatedSteps,
    },
    mutation,
  };
}

/**
 * Generate a random timeout adjustment factor within config bounds.
 */
export function randomTimeoutFactor(config: EvolutionConfig): number {
  const [min, max] = config.timeoutAdjustmentRange;
  return min + Math.random() * (max - min);
}

/**
 * Generate a random retry adjustment delta within config bounds.
 */
export function randomRetryDelta(config: EvolutionConfig): number {
  const [min, max] = config.retryAdjustmentRange;
  return Math.floor(min + Math.random() * (max - min + 1));
}

/**
 * Apply a random mutation to a workflow.
 *
 * @param workflow - The workflow to mutate
 * @param config - Evolution configuration
 * @returns Mutated workflow and applied mutations, or original if no mutation possible
 */
export function applyRandomMutation(
  workflow: WorkflowDefinition,
  config: EvolutionConfig
): { workflow: WorkflowDefinition; mutations: WorkflowMutation[] } {
  const mutations: WorkflowMutation[] = [];
  let currentWorkflow = workflow;

  // Try each step for possible mutation
  for (const step of workflow.steps) {
    if (Math.random() > config.mutationRate) continue;

    // Choose mutation type randomly
    const mutationType = Math.random();

    if (mutationType < 0.4) {
      // Timeout adjustment (40% chance)
      const factor = randomTimeoutFactor(config);
      const result = adjustTimeout(currentWorkflow, step.id, factor);
      if (result) {
        currentWorkflow = result.workflow;
        mutations.push(result.mutation);
      }
    } else if (mutationType < 0.7) {
      // Retry adjustment (30% chance)
      const delta = randomRetryDelta(config);
      const result = adjustRetries(currentWorkflow, step.id, delta);
      if (result) {
        currentWorkflow = result.workflow;
        mutations.push(result.mutation);
      }
    } else if (mutationType < 0.85) {
      // Add parallelization (15% chance)
      const result = addParallelization(currentWorkflow);
      if (result) {
        currentWorkflow = result.workflow;
        mutations.push(result.mutation);
        break; // Only one parallelization change per mutation round
      }
    } else {
      // Reorder steps (15% chance)
      const result = reorderSteps(currentWorkflow);
      if (result) {
        currentWorkflow = result.workflow;
        mutations.push(result.mutation);
        break; // Only one reorder per mutation round
      }
    }
  }

  return { workflow: currentWorkflow, mutations };
}

/**
 * Apply multiple mutations to create a variant.
 *
 * @param workflow - The base workflow
 * @param config - Evolution configuration
 * @param count - Number of mutation rounds to attempt
 * @returns Mutated workflow and all applied mutations
 */
export function createMutant(
  workflow: WorkflowDefinition,
  config: EvolutionConfig,
  count: number = 1
): { workflow: WorkflowDefinition; mutations: WorkflowMutation[] } {
  let currentWorkflow = workflow;
  const allMutations: WorkflowMutation[] = [];

  for (let i = 0; i < count; i++) {
    const { workflow: mutated, mutations } = applyRandomMutation(currentWorkflow, config);
    currentWorkflow = mutated;
    allMutations.push(...mutations);
  }

  return { workflow: currentWorkflow, mutations: allMutations };
}

/**
 * Describe a mutation in human-readable form.
 */
export function describeMutation(mutation: WorkflowMutation): string {
  switch (mutation.type) {
    case 'timeout_adjustment':
      return `Adjusted timeout for step '${mutation.stepId}': ${String(mutation.originalValue)}ms -> ${String(mutation.newValue)}ms (${(mutation.factor * 100).toFixed(0)}%)`;
    case 'retry_adjustment':
      return `Adjusted retries for step '${mutation.stepId}': ${String(mutation.originalValue)} -> ${String(mutation.newValue)} (${mutation.delta >= 0 ? '+' : ''}${String(mutation.delta)})`;
    case 'step_reorder':
      return `Reordered step '${mutation.stepId}': position ${String(mutation.fromIndex)} -> ${String(mutation.toIndex)}`;
    case 'add_parallelization':
      return `Added parallelization to steps: ${mutation.stepIds.join(', ')}`;
    case 'remove_parallelization':
      return `Removed parallelization from steps: ${mutation.stepIds.join(', ')}`;
  }
}
