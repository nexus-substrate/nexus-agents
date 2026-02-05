/**
 * nexus-agents/workflows - AFlow Action Sampling
 *
 * Sampling strategies for action selection during MCTS.
 * Includes uniform sampling and temperature-based probability sampling.
 *
 * @module workflows/aflow/action-sampling
 * (Source: Issue #329, arXiv:2410.10762)
 */

import type { WorkflowAction, ActionType } from './aflow-types.js';

/**
 * Random number generator type for sampling.
 */
export type RandomGenerator = () => number;

/**
 * Create a seeded random number generator for reproducibility.
 */
export function createSeededRandom(seed: number): RandomGenerator {
  let state = seed;
  return () => {
    // Simple LCG (Linear Congruential Generator)
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/**
 * Sample a random action from valid actions using uniform distribution.
 */
export function sampleAction(
  validActions: readonly WorkflowAction[],
  rng: RandomGenerator
): WorkflowAction | null {
  if (validActions.length === 0) return null;
  const index = Math.floor(rng() * validActions.length);
  return validActions[index] ?? null;
}

/**
 * Sample action with temperature-based probability.
 * Higher temperature = more uniform distribution.
 * Lower temperature = prefer higher-scoring actions.
 */
export function sampleWithTemperature(
  actions: readonly WorkflowAction[],
  scores: readonly number[],
  temperature: number,
  rng: RandomGenerator
): WorkflowAction | null {
  if (actions.length === 0 || actions.length !== scores.length) return null;

  // Apply temperature scaling with log-sum-exp trick to prevent overflow.
  // Subtracting maxScore ensures the largest exponent is exp(0) = 1,
  // avoiding Infinity from Math.exp(large_number).
  const maxScore = Math.max(...scores);
  const scaledScores = scores.map((s) => Math.exp((s - maxScore) / temperature));
  const sum = scaledScores.reduce((a, b) => a + b, 0);
  const probabilities = scaledScores.map((s) => s / sum);

  // Sample based on probabilities
  const r = rng();
  let cumulative = 0;
  for (let i = 0; i < actions.length; i++) {
    const prob = probabilities[i];
    if (prob !== undefined) {
      cumulative += prob;
      if (r < cumulative) {
        return actions[i] ?? null;
      }
    }
  }

  return actions[actions.length - 1] ?? null;
}

/**
 * Check if an action is the terminate action.
 */
export function isTerminateAction(action: WorkflowAction): boolean {
  return action.type === 'terminate';
}

/**
 * Describe an action in human-readable form.
 */
export function describeAction(action: WorkflowAction): string {
  const describer = getActionDescriber(action.type);
  return describer(action);
}

/**
 * Get the description function for an action type.
 */
function getActionDescriber(type: ActionType): (action: WorkflowAction) => string {
  const describers: Record<ActionType, (action: WorkflowAction) => string> = {
    add_step: describeAddStep,
    remove_step: (a) => `Remove step: ${a.targetStepId ?? 'unknown'}`,
    modify_step: (a) =>
      `Modify step ${a.targetStepId ?? 'unknown'}: ${JSON.stringify(a.modifications)}`,
    add_dependency: (a) =>
      `Add dependency: ${a.targetStepId ?? 'unknown'} -> ${a.sourceStepId ?? 'unknown'}`,
    remove_dependency: (a) =>
      `Remove dependency: ${a.targetStepId ?? 'unknown'} -> ${a.sourceStepId ?? 'unknown'}`,
    set_parallel: describeSetParallel,
    terminate: () => 'Terminate workflow construction',
  };
  return describers[type];
}

/**
 * Describe an add_step action.
 */
function describeAddStep(action: WorkflowAction): string {
  const agent = action.newStep?.agent ?? 'unknown';
  const stepAction = action.newStep?.action ?? 'unknown';
  return `Add ${agent} step: ${stepAction}`;
}

/**
 * Describe a set_parallel action.
 */
function describeSetParallel(action: WorkflowAction): string {
  const parallelVal = action.modifications?.parallel;
  const parallelStr = parallelVal === undefined ? 'unknown' : String(parallelVal);
  return `Set parallel for ${action.targetStepId ?? 'unknown'}: ${parallelStr}`;
}
