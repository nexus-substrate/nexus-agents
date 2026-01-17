/**
 * nexus-agents/workflows - AFlow Action Space
 *
 * Defines the available actions for workflow construction during MCTS.
 * The action space determines what modifications can be made to workflows.
 *
 * @module workflows/aflow/action-space
 * (Source: Issue #329, arXiv:2410.10762)
 */

import { v4 as uuidv4 } from 'uuid';
import type { WorkflowDefinition, WorkflowStep, AgentRole } from '../../core/index.js';
import type {
  WorkflowAction,
  ActionType,
  ActionSpaceConfig,
  TaskSpecification,
  StepModifications,
} from './aflow-types.js';
import { DEFAULT_ACTION_SPACE_CONFIG } from './aflow-types.js';

/**
 * Manages the action space for workflow construction.
 */
export class ActionSpace {
  private readonly config: ActionSpaceConfig;
  private readonly rng: () => number;

  constructor(config: Partial<ActionSpaceConfig> = {}, seed?: number) {
    this.config = { ...DEFAULT_ACTION_SPACE_CONFIG, ...config };
    this.rng = seed !== undefined ? this.createSeededRandom(seed) : Math.random.bind(Math);
  }

  /**
   * Create a seeded random number generator for reproducibility.
   */
  private createSeededRandom(seed: number): () => number {
    let state = seed;
    return () => {
      // Simple LCG (Linear Congruential Generator)
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0x100000000;
    };
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
      actions.push(...this.generateAddStepActions(workflow, task));
    }

    // Remove step action (if above min and has steps)
    if (stepCount > 0) {
      actions.push(...this.generateRemoveStepActions(workflow));
    }

    // Modify step actions
    if (stepCount > 0) {
      actions.push(...this.generateModifyStepActions(workflow));
    }

    // Add/remove dependency actions
    if (stepCount > 1) {
      actions.push(...this.generateDependencyActions(workflow));
    }

    // Parallel execution actions
    if (stepCount > 1) {
      actions.push(...this.generateParallelActions(workflow));
    }

    // Terminate action (always available if min steps met)
    if (stepCount >= 2) {
      actions.push({ type: 'terminate' });
    }

    return actions;
  }

  /**
   * Generate add_step actions for available agents.
   */
  private generateAddStepActions(
    workflow: WorkflowDefinition,
    task: TaskSpecification
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
        actions.push(...this.createAddStepActionsForAgent(agent, workflow));
      }
    }

    // Add actions for other available agents
    for (const agent of this.config.availableAgents) {
      if (!forbiddenAgents.has(agent) && !priorityAgents.includes(agent)) {
        actions.push(...this.createAddStepActionsForAgent(agent, workflow));
      }
    }

    return actions;
  }

  /**
   * Create add_step actions for a specific agent.
   */
  private createAddStepActionsForAgent(
    agent: AgentRole,
    workflow: WorkflowDefinition
  ): WorkflowAction[] {
    return this.config.availableActions.map((action) => ({
      type: 'add_step' as ActionType,
      newStep: {
        id: `step-${uuidv4().slice(0, 8)}`,
        agent,
        action,
        inputs: {},
        timeout: this.config.defaultTimeout,
        retries: this.config.defaultRetries,
        dependsOn:
          workflow.steps.length > 0 ? [workflow.steps[workflow.steps.length - 1]?.id ?? ''] : [],
      },
    }));
  }

  /**
   * Generate remove_step actions.
   */
  private generateRemoveStepActions(workflow: WorkflowDefinition): WorkflowAction[] {
    return workflow.steps.map((step) => ({
      type: 'remove_step' as ActionType,
      targetStepId: step.id,
    }));
  }

  /**
   * Generate modify_step actions.
   */
  private generateModifyStepActions(workflow: WorkflowDefinition): WorkflowAction[] {
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
  private generateDependencyActions(workflow: WorkflowDefinition): WorkflowAction[] {
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
          if (!this.wouldCreateCycle(workflow, step.id, otherStep.id)) {
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
  private generateParallelActions(workflow: WorkflowDefinition): WorkflowAction[] {
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
  private wouldCreateCycle(
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

  /**
   * Apply an action to a workflow, returning the new workflow state.
   */
  applyAction(workflow: WorkflowDefinition, action: WorkflowAction): WorkflowDefinition {
    switch (action.type) {
      case 'add_step':
        return this.applyAddStep(workflow, action);
      case 'remove_step':
        return this.applyRemoveStep(workflow, action);
      case 'modify_step':
        return this.applyModifyStep(workflow, action);
      case 'add_dependency':
        return this.applyAddDependency(workflow, action);
      case 'remove_dependency':
        return this.applyRemoveDependency(workflow, action);
      case 'set_parallel':
        return this.applySetParallel(workflow, action);
      case 'terminate':
        return workflow; // No change, just signals end
      default:
        return workflow;
    }
  }

  /**
   * Apply add_step action.
   */
  private applyAddStep(workflow: WorkflowDefinition, action: WorkflowAction): WorkflowDefinition {
    if (!action.newStep) return workflow;

    const newStep: WorkflowStep = {
      id: action.newStep.id ?? `step-${uuidv4().slice(0, 8)}`,
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
  private applyRemoveStep(
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
          return rest as WorkflowStep;
        }),
    };
  }

  /**
   * Apply modify_step action.
   */
  private applyModifyStep(
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
        s.id === action.targetStepId ? this.applyModifications(s, modifications) : s
      ),
    };
  }

  /**
   * Apply modifications to a step.
   */
  private applyModifications(step: WorkflowStep, mods: StepModifications): WorkflowStep {
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
  private applyAddDependency(
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
  private applyRemoveDependency(
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
        return rest as WorkflowStep;
      }),
    };
  }

  /**
   * Apply set_parallel action.
   */
  private applySetParallel(
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

  /**
   * Sample a random action from valid actions.
   */
  sampleAction(validActions: readonly WorkflowAction[]): WorkflowAction | null {
    if (validActions.length === 0) return null;
    const index = Math.floor(this.rng() * validActions.length);
    return validActions[index] ?? null;
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
    if (actions.length === 0 || actions.length !== scores.length) return null;

    // Apply temperature scaling
    const scaledScores = scores.map((s) => Math.exp(s / temperature));
    const sum = scaledScores.reduce((a, b) => a + b, 0);
    const probabilities = scaledScores.map((s) => s / sum);

    // Sample based on probabilities
    const r = this.rng();
    let cumulative = 0;
    for (let i = 0; i < actions.length; i++) {
      const prob = probabilities[i];
      if (prob !== undefined) {
        cumulative += prob;
      }
      if (r < cumulative) {
        return actions[i] ?? null;
      }
    }

    return actions[actions.length - 1] ?? null;
  }

  /**
   * Check if an action is the terminate action.
   */
  isTerminateAction(action: WorkflowAction): boolean {
    return action.type === 'terminate';
  }

  /**
   * Describe an action in human-readable form.
   */
  describeAction(action: WorkflowAction): string {
    const describer = this.getActionDescriber(action.type);
    return describer(action);
  }

  /**
   * Get the description function for an action type.
   */
  private getActionDescriber(type: ActionType): (action: WorkflowAction) => string {
    const describers: Record<ActionType, (action: WorkflowAction) => string> = {
      add_step: (a) => this.describeAddStep(a),
      remove_step: (a) => `Remove step: ${a.targetStepId ?? 'unknown'}`,
      modify_step: (a) =>
        `Modify step ${a.targetStepId ?? 'unknown'}: ${JSON.stringify(a.modifications)}`,
      add_dependency: (a) =>
        `Add dependency: ${a.targetStepId ?? 'unknown'} -> ${a.sourceStepId ?? 'unknown'}`,
      remove_dependency: (a) =>
        `Remove dependency: ${a.targetStepId ?? 'unknown'} -> ${a.sourceStepId ?? 'unknown'}`,
      set_parallel: (a) => this.describeSetParallel(a),
      terminate: () => 'Terminate workflow construction',
    };
    return describers[type];
  }

  /** Describe an add_step action. */
  private describeAddStep(action: WorkflowAction): string {
    const agent = action.newStep?.agent ?? 'unknown';
    const stepAction = action.newStep?.action ?? 'unknown';
    return `Add ${agent} step: ${stepAction}`;
  }

  /** Describe a set_parallel action. */
  private describeSetParallel(action: WorkflowAction): string {
    const parallelVal = action.modifications?.parallel;
    const parallelStr = parallelVal === undefined ? 'unknown' : String(parallelVal);
    return `Set parallel for ${action.targetStepId ?? 'unknown'}: ${parallelStr}`;
  }
}

/**
 * Create an action space with optional configuration.
 */
export function createActionSpace(config?: Partial<ActionSpaceConfig>, seed?: number): ActionSpace {
  return new ActionSpace(config, seed);
}
