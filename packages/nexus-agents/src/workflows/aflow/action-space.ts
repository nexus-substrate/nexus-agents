/**
 * nexus-agents/workflows - AFlow Action Space
 *
 * Defines the available actions for workflow construction during MCTS.
 * The action space determines what modifications can be made to workflows.
 *
 * @module workflows/aflow/action-space
 * (Source: Issue #329, arXiv:2410.10762)
 */

import type { WorkflowDefinition } from '../../core/index.js';
import type { WorkflowAction, ActionSpaceConfig, TaskSpecification } from './aflow-types.js';
import { DEFAULT_ACTION_SPACE_CONFIG } from './aflow-types.js';

// Import modular action functions
import {
  generateAddStepActions,
  generateRemoveStepActions,
  generateModifyStepActions,
  generateDependencyActions,
  generateParallelActions,
} from './action-generators.js';
import { applyAction } from './action-applicators.js';
import {
  createSeededRandom,
  sampleAction,
  sampleWithTemperature,
  isTerminateAction,
  describeAction,
  type RandomGenerator,
} from './action-sampling.js';

/**
 * Manages the action space for workflow construction.
 */
export class ActionSpace {
  private readonly config: ActionSpaceConfig;
  private readonly rng: RandomGenerator;

  constructor(config: Partial<ActionSpaceConfig> = {}, seed?: number) {
    this.config = { ...DEFAULT_ACTION_SPACE_CONFIG, ...config };
    this.rng = seed !== undefined ? createSeededRandom(seed) : Math.random.bind(Math);
  }

  /**
   * Get all valid actions from the current workflow state.
   */
  getValidActions(
    workflow: WorkflowDefinition,
    task: TaskSpecification,
    maxSteps: number
  ): readonly WorkflowAction[] {
    const actions: WorkflowAction[] = [];
    const stepCount = workflow.steps.length;

    // Add step action (if below max)
    if (stepCount < maxSteps) {
      actions.push(...generateAddStepActions(workflow, task, this.config));
    }

    // Remove step action (if above min and has steps)
    if (stepCount > 0) {
      actions.push(...generateRemoveStepActions(workflow));
    }

    // Modify step actions
    if (stepCount > 0) {
      actions.push(...generateModifyStepActions(workflow));
    }

    // Add/remove dependency actions
    if (stepCount > 1) {
      actions.push(...generateDependencyActions(workflow));
    }

    // Parallel execution actions
    if (stepCount > 1) {
      actions.push(...generateParallelActions(workflow));
    }

    // Terminate action (always available if min steps met)
    if (stepCount >= 2) {
      actions.push({ type: 'terminate' });
    }

    return actions;
  }

  /**
   * Apply an action to a workflow, returning the new workflow state.
   */
  applyAction(workflow: WorkflowDefinition, action: WorkflowAction): WorkflowDefinition {
    return applyAction(workflow, action);
  }

  /**
   * Sample a random action from valid actions.
   */
  sampleAction(validActions: readonly WorkflowAction[]): WorkflowAction | null {
    return sampleAction(validActions, this.rng);
  }

  /**
   * Sample action with temperature-based probability.
   * Higher temperature = more uniform distribution.
   * Lower temperature = prefer higher-scoring actions.
   */
  sampleWithTemperature(
    actions: readonly WorkflowAction[],
    scores: readonly number[],
    temperature: number
  ): WorkflowAction | null {
    return sampleWithTemperature(actions, scores, temperature, this.rng);
  }

  /**
   * Check if an action is the terminate action.
   */
  isTerminateAction(action: WorkflowAction): boolean {
    return isTerminateAction(action);
  }

  /**
   * Describe an action in human-readable form.
   */
  describeAction(action: WorkflowAction): string {
    return describeAction(action);
  }
}

/**
 * Create an action space with optional configuration.
 */
export function createActionSpace(config?: Partial<ActionSpaceConfig>, seed?: number): ActionSpace {
  return new ActionSpace(config, seed);
}
