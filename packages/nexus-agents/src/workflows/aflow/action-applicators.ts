/**
 * nexus-agents/workflows - AFlow Action Applicators
 *
 * Applies workflow actions to produce new workflow states.
 * Extracts action application logic from ActionSpace for modularity.
 *
 * @module workflows/aflow/action-applicators
 * (Source: Issue #329, arXiv:2410.10762)
 */

import { generateStepId } from '../../utils/index.js';
import type { WorkflowDefinition, WorkflowStep } from '../../core/index.js';
import type { WorkflowAction, StepModifications } from './aflow-types.js';

/**
 * Apply an action to a workflow, returning the new workflow state.
 */
export function applyAction(
  workflow: WorkflowDefinition,
  action: WorkflowAction
): WorkflowDefinition {
  switch (action.type) {
    case 'add_step':
      return applyAddStep(workflow, action);
    case 'remove_step':
      return applyRemoveStep(workflow, action);
    case 'modify_step':
      return applyModifyStep(workflow, action);
    case 'add_dependency':
      return applyAddDependency(workflow, action);
    case 'remove_dependency':
      return applyRemoveDependency(workflow, action);
    case 'set_parallel':
      return applySetParallel(workflow, action);
    case 'terminate':
      return workflow; // No change, just signals end
    default:
      return workflow;
  }
}

/**
 * Apply add_step action.
 */
export function applyAddStep(
  workflow: WorkflowDefinition,
  action: WorkflowAction
): WorkflowDefinition {
  if (!action.newStep) return workflow;

  const newStep: WorkflowStep = {
    id: action.newStep.id ?? generateStepId(),
    agent: action.newStep.agent ?? 'code_expert',
    action: action.newStep.action ?? 'execute',
    inputs: action.newStep.inputs ?? {},
    ...(action.newStep.timeout !== undefined && { timeout: action.newStep.timeout }),
    ...(action.newStep.retries !== undefined && { retries: action.newStep.retries }),
    ...(action.newStep.dependsOn !== undefined && { dependsOn: action.newStep.dependsOn }),
    ...(action.newStep.parallel !== undefined && { parallel: action.newStep.parallel }),
  };

  return {
    ...workflow,
    steps: [...workflow.steps, newStep],
  };
}

/**
 * Apply remove_step action.
 */
export function applyRemoveStep(
  workflow: WorkflowDefinition,
  action: WorkflowAction
): WorkflowDefinition {
  if (action.targetStepId === undefined) return workflow;

  const removedId = action.targetStepId;
  return {
    ...workflow,
    steps: workflow.steps
      .filter((s) => s.id !== removedId)
      .map((s) => {
        const filteredDeps = s.dependsOn?.filter((d) => d !== removedId);
        if (filteredDeps && filteredDeps.length > 0) {
          return { ...s, dependsOn: filteredDeps };
        }
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { dependsOn, ...rest } = s;
        return rest;
      }),
  };
}

/**
 * Apply modify_step action.
 */
export function applyModifyStep(
  workflow: WorkflowDefinition,
  action: WorkflowAction
): WorkflowDefinition {
  if (action.targetStepId === undefined || action.modifications === undefined) {
    return workflow;
  }

  const modifications = action.modifications;
  return {
    ...workflow,
    steps: workflow.steps.map((s) =>
      s.id === action.targetStepId ? applyModifications(s, modifications) : s
    ),
  };
}

/**
 * Apply modifications to a step.
 */
export function applyModifications(step: WorkflowStep, mods: StepModifications): WorkflowStep {
  return {
    ...step,
    ...(mods.timeout !== undefined && { timeout: mods.timeout }),
    ...(mods.retries !== undefined && { retries: mods.retries }),
    ...(mods.parallel !== undefined && { parallel: mods.parallel }),
    ...(mods.agent !== undefined && { agent: mods.agent }),
    ...(mods.action !== undefined && { action: mods.action }),
  };
}

/**
 * Apply add_dependency action.
 */
export function applyAddDependency(
  workflow: WorkflowDefinition,
  action: WorkflowAction
): WorkflowDefinition {
  if (action.targetStepId === undefined || action.sourceStepId === undefined) {
    return workflow;
  }

  const sourceStepId = action.sourceStepId;
  return {
    ...workflow,
    steps: workflow.steps.map((s) => {
      if (s.id !== action.targetStepId) return s;
      const deps = s.dependsOn ?? [];
      if (deps.includes(sourceStepId)) return s;
      return { ...s, dependsOn: [...deps, sourceStepId] };
    }),
  };
}

/**
 * Apply remove_dependency action.
 */
export function applyRemoveDependency(
  workflow: WorkflowDefinition,
  action: WorkflowAction
): WorkflowDefinition {
  if (action.targetStepId === undefined || action.sourceStepId === undefined) {
    return workflow;
  }

  return {
    ...workflow,
    steps: workflow.steps.map((s) => {
      if (s.id !== action.targetStepId) return s;
      const filteredDeps = s.dependsOn?.filter((d) => d !== action.sourceStepId);
      if (filteredDeps && filteredDeps.length > 0) {
        return { ...s, dependsOn: filteredDeps };
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { dependsOn, ...rest } = s;
      return rest;
    }),
  };
}

/**
 * Apply set_parallel action.
 */
export function applySetParallel(
  workflow: WorkflowDefinition,
  action: WorkflowAction
): WorkflowDefinition {
  if (action.targetStepId === undefined || action.modifications === undefined) {
    return workflow;
  }

  const parallelValue = action.modifications.parallel;
  return {
    ...workflow,
    steps: workflow.steps.map((s) => {
      if (s.id !== action.targetStepId) return s;
      if (parallelValue !== undefined) {
        return { ...s, parallel: parallelValue };
      }
      return s;
    }),
  };
}
