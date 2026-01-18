/**
 * nexus-agents/workflows - AFlow Structure Evaluation
 *
 * Structure validation methods for workflow evaluation.
 * Validates workflow DAG structure, dependencies, and agent roles.
 *
 * @module workflows/aflow/evaluation-structure
 * (Source: Issue #329, arXiv:2410.10762)
 */

import type { WorkflowDefinition } from '../../core/index.js';
import { VALID_AGENT_ROLES } from './evaluation-types.js';

/**
 * Evaluate workflow structural validity.
 * Returns a score between 0 and 1 based on structural checks.
 */
export function evaluateStructure(workflow: WorkflowDefinition): number {
  const checks = [
    hasValidSteps(workflow),
    hasNoCycles(workflow),
    hasValidDependencies(workflow),
    hasUniqueStepIds(workflow),
    hasValidAgentRoles(workflow),
  ];

  const passed = checks.filter(Boolean).length;
  return passed / checks.length;
}

/**
 * Check if workflow has valid steps.
 * Each step must have non-empty id, agent, and action.
 */
export function hasValidSteps(workflow: WorkflowDefinition): boolean {
  return (
    workflow.steps.length >= 1 &&
    workflow.steps.every((s) => s.id.length > 0 && s.agent.length > 0 && s.action.length > 0)
  );
}

/**
 * Check if workflow has no dependency cycles.
 * Uses DFS with recursion stack to detect cycles.
 */
export function hasNoCycles(workflow: WorkflowDefinition): boolean {
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  const hasCycle = (stepId: string): boolean => {
    if (recursionStack.has(stepId)) return true;
    if (visited.has(stepId)) return false;

    visited.add(stepId);
    recursionStack.add(stepId);

    const step = workflow.steps.find((s) => s.id === stepId);
    for (const dep of step?.dependsOn ?? []) {
      if (hasCycle(dep)) return true;
    }

    recursionStack.delete(stepId);
    return false;
  };

  return !workflow.steps.some((s) => hasCycle(s.id));
}

/**
 * Check if all dependencies reference valid steps.
 */
export function hasValidDependencies(workflow: WorkflowDefinition): boolean {
  const stepIds = new Set(workflow.steps.map((s) => s.id));
  return workflow.steps.every((s) => (s.dependsOn ?? []).every((dep) => stepIds.has(dep)));
}

/**
 * Check if all step IDs are unique.
 */
export function hasUniqueStepIds(workflow: WorkflowDefinition): boolean {
  const ids = workflow.steps.map((s) => s.id);
  return ids.length === new Set(ids).size;
}

/**
 * Check if all agent roles are valid.
 */
export function hasValidAgentRoles(workflow: WorkflowDefinition): boolean {
  return workflow.steps.every((s) => VALID_AGENT_ROLES.has(s.agent));
}

/**
 * Quick check if workflow is minimally viable.
 */
export function isViableWorkflow(workflow: WorkflowDefinition, minSteps: number): boolean {
  return (
    workflow.steps.length >= minSteps &&
    hasValidSteps(workflow) &&
    hasNoCycles(workflow) &&
    hasValidDependencies(workflow) &&
    hasUniqueStepIds(workflow)
  );
}
