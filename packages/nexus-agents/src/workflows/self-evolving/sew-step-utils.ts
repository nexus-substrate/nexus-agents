/**
 * nexus-agents/workflows - SEW Step Utilities
 *
 * Step dependency analysis utilities for Self-Evolving Workflows.
 * Extracted from sew-types.ts to maintain file size limits.
 *
 * @module workflows/self-evolving/sew-step-utils
 * (Source: Issue #339)
 */

import type { WorkflowStep } from '../../core/index.js';

/**
 * Check if two steps have a dependency relationship.
 */
export function stepsAreDependent(
  stepA: WorkflowStep,
  stepB: WorkflowStep,
  allSteps: readonly WorkflowStep[]
): boolean {
  const stepADeps = new Set(stepA.dependsOn ?? []);
  const stepBDeps = new Set(stepB.dependsOn ?? []);

  // Direct dependency
  if (stepADeps.has(stepB.id) || stepBDeps.has(stepA.id)) {
    return true;
  }

  // Transitive dependency check
  const getAllDependencies = (stepId: string, visited: Set<string>): Set<string> => {
    if (visited.has(stepId)) return new Set();
    visited.add(stepId);

    const step = allSteps.find((s) => s.id === stepId);
    if (!step?.dependsOn) return new Set();

    const deps = new Set(step.dependsOn);
    for (const dep of step.dependsOn) {
      const transitiveDeps = getAllDependencies(dep, visited);
      for (const td of transitiveDeps) {
        deps.add(td);
      }
    }
    return deps;
  };

  const allDepsA = getAllDependencies(stepA.id, new Set());
  const allDepsB = getAllDependencies(stepB.id, new Set());

  return allDepsA.has(stepB.id) || allDepsB.has(stepA.id);
}

/**
 * Find steps that can be reordered (independent steps).
 */
export function findReorderableSteps(
  steps: readonly WorkflowStep[]
): readonly [WorkflowStep, WorkflowStep][] {
  const pairs: [WorkflowStep, WorkflowStep][] = [];

  for (let i = 0; i < steps.length; i++) {
    for (let j = i + 1; j < steps.length; j++) {
      const stepA = steps[i];
      const stepB = steps[j];
      if (stepA && stepB && !stepsAreDependent(stepA, stepB, steps)) {
        pairs.push([stepA, stepB]);
      }
    }
  }

  return pairs;
}

/**
 * Find steps that can be parallelized.
 */
export function findParallelizableSteps(steps: readonly WorkflowStep[]): readonly WorkflowStep[][] {
  const groups: WorkflowStep[][] = [];
  const visited = new Set<string>();

  for (const step of steps) {
    if (visited.has(step.id) || step.parallel === true) continue;

    const parallelGroup: WorkflowStep[] = [step];
    visited.add(step.id);

    for (const other of steps) {
      if (visited.has(other.id) || other.parallel === true) continue;
      if (!stepsAreDependent(step, other, steps)) {
        // Check if other can be parallel with all in group
        const canParallelize = parallelGroup.every((g) => !stepsAreDependent(g, other, steps));
        if (canParallelize) {
          parallelGroup.push(other);
          visited.add(other.id);
        }
      }
    }

    if (parallelGroup.length > 1) {
      groups.push(parallelGroup);
    }
  }

  return groups;
}
