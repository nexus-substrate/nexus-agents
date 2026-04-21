/**
 * nexus-agents/workflows - AFlow Action Generators
 *
 * Generates valid actions for workflow construction during MCTS.
 * Extracts action generation logic from ActionSpace for modularity.
 *
 * @module workflows/aflow/action-generators
 * (Source: Issue #329, arXiv:2410.10762)
 */

import { generateStepId } from '../../utils/index.js';
import type { WorkflowDefinition, AgentRole } from '../../core/index.js';
import type { WorkflowAction, ActionSpaceConfig, TaskSpecification } from './aflow-types.js';

/**
 * Generate add_step actions for available agents.
 */
export function generateAddStepActions(
  workflow: WorkflowDefinition,
  task: TaskSpecification,
  config: ActionSpaceConfig
): WorkflowAction[] {
  const actions: WorkflowAction[] = [];
  const usedAgents = new Set(workflow.steps.map((s) => s.agent));

  // Prioritize required agents that haven't been added
  const requiredAgents = task.constraints?.requiredAgents ?? [];
  const priorityAgents = requiredAgents.filter((a) => !usedAgents.has(a));
  const forbiddenAgents = new Set(task.constraints?.forbiddenAgents ?? []);

  // Add actions for priority agents first
  for (const agent of priorityAgents) {
    if (!forbiddenAgents.has(agent)) {
      actions.push(...createAddStepActionsForAgent(agent, workflow, config));
    }
  }

  // Add actions for other available agents
  for (const agent of config.availableAgents) {
    if (!forbiddenAgents.has(agent) && !priorityAgents.includes(agent)) {
      actions.push(...createAddStepActionsForAgent(agent, workflow, config));
    }
  }

  return actions;
}

/**
 * Create add_step actions for a specific agent.
 */
export function createAddStepActionsForAgent(
  agent: AgentRole,
  workflow: WorkflowDefinition,
  config: ActionSpaceConfig
): WorkflowAction[] {
  return config.availableActions.map((action) => ({
    type: 'add_step',
    newStep: {
      id: generateStepId(),
      agent,
      action,
      inputs: {},
      timeout: config.defaultTimeout,
      retries: config.defaultRetries,
      dependsOn:
        workflow.steps.length > 0 ? [workflow.steps[workflow.steps.length - 1]?.id ?? ''] : [],
    },
  }));
}

/**
 * Generate remove_step actions.
 */
export function generateRemoveStepActions(workflow: WorkflowDefinition): WorkflowAction[] {
  return workflow.steps.map((step) => ({
    type: 'remove_step',
    targetStepId: step.id,
  }));
}

/**
 * Generate modify_step actions.
 */
export function generateModifyStepActions(workflow: WorkflowDefinition): WorkflowAction[] {
  const actions: WorkflowAction[] = [];

  for (const step of workflow.steps) {
    // Timeout modifications
    actions.push(
      {
        type: 'modify_step',
        targetStepId: step.id,
        modifications: { timeout: (step.timeout ?? 60000) * 0.5 },
      },
      {
        type: 'modify_step',
        targetStepId: step.id,
        modifications: { timeout: (step.timeout ?? 60000) * 2 },
      }
    );

    // Retry modifications
    actions.push(
      {
        type: 'modify_step',
        targetStepId: step.id,
        modifications: { retries: Math.max(0, (step.retries ?? 2) - 1) },
      },
      {
        type: 'modify_step',
        targetStepId: step.id,
        modifications: { retries: Math.min(10, (step.retries ?? 2) + 1) },
      }
    );
  }

  return actions;
}

/**
 * Generate dependency-related actions.
 */
export function generateDependencyActions(workflow: WorkflowDefinition): WorkflowAction[] {
  const actions: WorkflowAction[] = [];
  const steps = workflow.steps;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (!step) continue;
    const currentDeps = new Set(step.dependsOn ?? []);

    for (let j = 0; j < steps.length; j++) {
      if (i === j) continue;
      const otherStep = steps[j];
      if (!otherStep) continue;

      if (!currentDeps.has(otherStep.id)) {
        // Can add dependency if not creating a cycle
        if (!wouldCreateCycle(workflow, step.id, otherStep.id)) {
          actions.push({
            type: 'add_dependency',
            targetStepId: step.id,
            sourceStepId: otherStep.id,
          });
        }
      } else {
        // Can remove existing dependency
        actions.push({
          type: 'remove_dependency',
          targetStepId: step.id,
          sourceStepId: otherStep.id,
        });
      }
    }
  }

  return actions;
}

/**
 * Generate parallel execution actions.
 */
export function generateParallelActions(workflow: WorkflowDefinition): WorkflowAction[] {
  const actions: WorkflowAction[] = [];

  for (const step of workflow.steps) {
    actions.push({
      type: 'set_parallel',
      targetStepId: step.id,
      modifications: { parallel: !(step.parallel ?? false) },
    });
  }

  return actions;
}

/**
 * Check if adding a dependency would create a cycle.
 */
export function wouldCreateCycle(
  workflow: WorkflowDefinition,
  targetId: string,
  sourceId: string
): boolean {
  // If target depends on source, check if source transitively depends on target
  const visited = new Set<string>();
  const queue = [sourceId];

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) continue;
    if (current === targetId) return true;
    if (visited.has(current)) continue;
    visited.add(current);

    const step = workflow.steps.find((s) => s.id === current);
    if (step?.dependsOn) {
      queue.push(...step.dependsOn);
    }
  }

  return false;
}
