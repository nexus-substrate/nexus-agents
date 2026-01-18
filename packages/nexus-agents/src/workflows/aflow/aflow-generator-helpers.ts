/**
 * nexus-agents/workflows - AFlow Generator Helpers
 *
 * Helper functions for AFlow workflow generation including
 * action comparison and initial workflow creation.
 *
 * @module workflows/aflow/aflow-generator-helpers
 * (Source: Issue #329, arXiv:2410.10762)
 */

import type { WorkflowDefinition } from '../../core/index.js';
import type { TaskSpecification, WorkflowAction } from './aflow-types.js';

/**
 * Check if two workflow actions are equal.
 * Used to detect unexplored actions during MCTS expansion.
 */
export function actionsEqual(a: WorkflowAction, b: WorkflowAction): boolean {
  if (a.type !== b.type) return false;
  if (a.targetStepId !== b.targetStepId) return false;
  if (a.sourceStepId !== b.sourceStepId) return false;
  // For add_step, compare by step ID if present
  if (a.type === 'add_step' && b.type === 'add_step') {
    return a.newStep?.id === b.newStep?.id;
  }
  return true;
}

/**
 * Create initial workflow from task specification.
 * Sets up the basic workflow structure with inputs derived from the task.
 */
export function createInitialWorkflow(task: TaskSpecification): WorkflowDefinition {
  return {
    name: `generated-${String(Date.now())}`,
    version: '1.0.0',
    description: `Workflow for: ${task.description}`,
    inputs: task.expectedInputs.map((input) => ({
      name: input,
      type: 'string' as const,
      required: true,
    })),
    steps: [],
    timeout: task.constraints?.maxTotalTimeout ?? 300000,
  };
}
