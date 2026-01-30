/**
 * nexus-agents/workflows - Workflow Evolver Helpers
 *
 * Helper functions for genetic algorithm-based workflow evolution.
 * Extracted from workflow-evolver.ts to maintain file size limits.
 *
 * @module workflows/self-evolving/workflow-evolver-helpers
 * (Source: Issue #330, #339)
 */

import { v4 as uuidv4 } from 'uuid';
import type { WorkflowStep } from '../../core/index.js';
import { getRandomProvider, getTimeProvider } from '../../core/index.js';
import type { WorkflowVersion, WorkflowMutation } from './sew-types.js';
import {
  DEFAULT_FITNESS_METRICS,
  parseVersion,
  formatVersion,
  incrementVersion,
} from './sew-types.js';

/**
 * Tournament selection helper.
 * Selects a winner from a random subset of the population.
 */
export function tournamentSelect(
  population: readonly WorkflowVersion[],
  selectionPressure: number
): WorkflowVersion | null {
  const random = getRandomProvider();
  const tournamentSize = Math.min(3, population.length);
  const contestants: WorkflowVersion[] = [];

  for (let i = 0; i < tournamentSize; i++) {
    const index = random.randomInt(0, population.length);
    const contestant = population[index];
    if (contestant) contestants.push(contestant);
  }

  if (contestants.length === 0) return null;

  // Apply selection pressure (higher pressure = more likely to pick best)
  contestants.sort((a, b) => b.fitnessScore - a.fitnessScore);

  for (const contestant of contestants) {
    if (random.random() < 1 / selectionPressure) {
      return contestant;
    }
  }

  return contestants[0] ?? null;
}

/**
 * Check if two workflows are compatible for crossover (same structure).
 */
export function areWorkflowsCompatible(
  p1Steps: readonly WorkflowStep[],
  p2Steps: readonly WorkflowStep[]
): boolean {
  if (p1Steps.length !== p2Steps.length) return false;
  for (let i = 0; i < p1Steps.length; i++) {
    if (p1Steps[i]?.id !== p2Steps[i]?.id) return false;
  }
  return true;
}

/**
 * Create a child step by combining two parent steps.
 * Randomly selects timeout, retries, and parallel from either parent.
 */
export function createCrossoverStep(step1: WorkflowStep, step2: WorkflowStep): WorkflowStep {
  const random = getRandomProvider();
  const selectedTimeout = random.random() < 0.5 ? step1.timeout : step2.timeout;
  const selectedRetries = random.random() < 0.5 ? step1.retries : step2.retries;
  const selectedParallel = random.random() < 0.5 ? step1.parallel : step2.parallel;

  const childStep: WorkflowStep = {
    id: step1.id,
    agent: step1.agent,
    action: step1.action,
    inputs: step1.inputs,
  };

  if (step1.dependsOn !== undefined) childStep.dependsOn = step1.dependsOn;
  if (step1.condition !== undefined) childStep.condition = step1.condition;
  if (step1.contextBudget !== undefined) childStep.contextBudget = step1.contextBudget;
  if (selectedTimeout !== undefined) childStep.timeout = selectedTimeout;
  if (selectedRetries !== undefined) childStep.retries = selectedRetries;
  if (selectedParallel !== undefined) childStep.parallel = selectedParallel;

  return childStep;
}

/**
 * Create child version from crossover.
 */
export function createChildVersion(
  betterParent: WorkflowVersion,
  childSteps: WorkflowStep[]
): WorkflowVersion {
  const time = getTimeProvider();
  const semVer = parseVersion(betterParent.version);
  const newVersion = incrementVersion(semVer, 'patch');

  return {
    id: uuidv4(),
    version: formatVersion(newVersion),
    workflow: {
      ...betterParent.workflow,
      version: formatVersion(newVersion),
      steps: childSteps,
    },
    fitnessScore: 0,
    metrics: DEFAULT_FITNESS_METRICS,
    parentVersion: betterParent.id,
    appliedMutations: [
      {
        type: 'timeout_adjustment',
        stepId: 'crossover',
        originalValue: 0,
        newValue: 0,
        factor: 1,
      },
    ],
    createdAt: time.now(),
    isActive: false,
  };
}

/**
 * Result type for crossover operations.
 */
export interface CrossoverResult {
  readonly child: WorkflowVersion;
  readonly wasCreated: true;
}

/**
 * Perform crossover between two parent workflows.
 * Returns null if workflows are incompatible.
 */
export function performCrossover(
  parent1: WorkflowVersion,
  parent2: WorkflowVersion
): CrossoverResult | null {
  const p1Steps = parent1.workflow.steps;
  const p2Steps = parent2.workflow.steps;

  if (!areWorkflowsCompatible(p1Steps, p2Steps)) return null;

  const childSteps: WorkflowStep[] = [];
  for (let i = 0; i < p1Steps.length; i++) {
    const step1 = p1Steps[i];
    const step2 = p2Steps[i];
    if (!step1 || !step2) continue;
    childSteps.push(createCrossoverStep(step1, step2));
  }

  const betterParent = parent1.fitnessScore >= parent2.fitnessScore ? parent1 : parent2;
  const child = createChildVersion(betterParent, childSteps);

  return { child, wasCreated: true };
}

/**
 * Statistics for workflow evolution.
 */
export interface EvolutionStats {
  readonly totalVersions: number;
  readonly activeVersion: string | null;
  readonly bestFitness: number;
  readonly avgFitness: number;
  readonly totalOutcomes: number;
}

/**
 * Calculate evolution statistics from versions and outcomes.
 */
export function calculateEvolutionStats(
  versions: readonly WorkflowVersion[],
  activeVersionId: string | null,
  outcomes: Map<string, readonly { success: boolean }[]>
): EvolutionStats {
  const fitnessValues = versions.map((v) => v.fitnessScore).filter((f) => f > 0);

  return {
    totalVersions: versions.length,
    activeVersion: activeVersionId,
    bestFitness: fitnessValues.length > 0 ? Math.max(...fitnessValues) : 0,
    avgFitness:
      fitnessValues.length > 0
        ? fitnessValues.reduce((a, b) => a + b, 0) / fitnessValues.length
        : 0,
    totalOutcomes: Array.from(outcomes.values()).reduce((sum, o) => sum + o.length, 0),
  };
}

/**
 * Build version history descriptions for debugging.
 */
export function buildVersionHistory(
  versionId: string,
  versions: Map<string, WorkflowVersion>,
  describeMutationFn: (mutation: WorkflowMutation) => string
): string[] {
  const descriptions: string[] = [];
  let current = versions.get(versionId);

  while (current !== undefined) {
    const mutationDescs = current.appliedMutations.map(describeMutationFn);
    descriptions.unshift(
      `v${current.version} (fitness: ${current.fitnessScore.toFixed(3)})` +
        (mutationDescs.length > 0 ? `\n  - ${mutationDescs.join('\n  - ')}` : ' (initial)')
    );

    if (current.parentVersion !== null && current.parentVersion !== '') {
      current = versions.get(current.parentVersion);
    } else {
      break;
    }
  }

  return descriptions;
}
