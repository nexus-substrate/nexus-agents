/**
 * @nexus-agents/workflows - Execution Planner
 *
 * Creates execution plans with phases based on step dependencies.
 * Uses topological sort to group independent steps into concurrent phases.
 */

import type { Result } from '@nexus-agents/core';
import { ok, err, WorkflowError } from '@nexus-agents/core';
import type { WorkflowStep, WorkflowDefinition } from '@nexus-agents/core';

/**
 * A phase of steps that can be executed concurrently.
 */
export interface ExecutionPhase {
  /** Steps that can run in parallel within this phase */
  steps: WorkflowStep[];
  /** Phase index (0-based) */
  phaseIndex: number;
}

/**
 * Execution plan with ordered phases.
 */
export interface ExecutionPlan {
  /** Ordered phases of execution */
  phases: ExecutionPhase[];
  /** Total number of steps */
  totalSteps: number;
  /** Maximum parallelism (max steps in any phase) */
  maxParallelism: number;
}

/**
 * Graph node for topological sorting.
 */
interface DependencyNode {
  step: WorkflowStep;
  dependencies: Set<string>;
  dependents: Set<string>;
  inDegree: number;
}

/**
 * Builds a dependency graph from workflow steps.
 *
 * @param steps - Workflow steps to analyze
 * @returns Map of step ID to dependency node
 */
function buildDependencyGraph(steps: WorkflowStep[]): Map<string, DependencyNode> {
  const graph = new Map<string, DependencyNode>();

  // Initialize nodes
  for (const step of steps) {
    graph.set(step.id, {
      step,
      dependencies: new Set(step.dependsOn ?? []),
      dependents: new Set(),
      inDegree: step.dependsOn?.length ?? 0,
    });
  }

  // Build reverse dependencies (dependents)
  for (const step of steps) {
    if (step.dependsOn) {
      for (const depId of step.dependsOn) {
        const depNode = graph.get(depId);
        if (depNode) {
          depNode.dependents.add(step.id);
        }
      }
    }
  }

  return graph;
}

/**
 * Validates the dependency graph for cycles and missing dependencies.
 *
 * @param graph - Dependency graph to validate
 * @param stepIds - Set of all step IDs
 * @returns Result with void or WorkflowError
 */
function validateGraph(
  graph: Map<string, DependencyNode>,
  stepIds: Set<string>
): Result<void, WorkflowError> {
  // Check for missing dependencies
  for (const [stepId, node] of graph) {
    for (const depId of node.dependencies) {
      if (!stepIds.has(depId)) {
        return err(
          new WorkflowError(`Step '${stepId}' depends on unknown step '${depId}'`, {
            context: { stepId, missingDependency: depId },
          })
        );
      }
    }
  }

  // Check for cycles using DFS
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function hasCycle(nodeId: string): string[] | null {
    visited.add(nodeId);
    recursionStack.add(nodeId);

    const node = graph.get(nodeId);
    if (!node) return null;

    for (const depId of node.dependents) {
      if (!visited.has(depId)) {
        const cyclePath = hasCycle(depId);
        if (cyclePath) {
          return [nodeId, ...cyclePath];
        }
      } else if (recursionStack.has(depId)) {
        return [nodeId, depId];
      }
    }

    recursionStack.delete(nodeId);
    return null;
  }

  for (const nodeId of graph.keys()) {
    if (!visited.has(nodeId)) {
      const cyclePath = hasCycle(nodeId);
      if (cyclePath) {
        return err(
          new WorkflowError(`Circular dependency detected: ${cyclePath.join(' -> ')}`, {
            context: { cyclePath },
          })
        );
      }
    }
  }

  return ok(undefined);
}

/** Initializes in-degrees map from graph */
function initializeInDegrees(graph: Map<string, DependencyNode>): Map<string, number> {
  const inDegrees = new Map<string, number>();
  for (const [stepId, node] of graph) {
    inDegrees.set(stepId, node.inDegree);
  }
  return inDegrees;
}

/** Finds all steps ready to execute (in-degree 0) */
function findReadySteps(
  remaining: Set<string>,
  inDegrees: Map<string, number>,
  graph: Map<string, DependencyNode>
): WorkflowStep[] {
  const readySteps: WorkflowStep[] = [];
  for (const stepId of remaining) {
    if ((inDegrees.get(stepId) ?? 0) === 0) {
      const node = graph.get(stepId);
      if (node !== undefined) {
        readySteps.push(node.step);
      }
    }
  }
  return readySteps;
}

/** Updates in-degrees after processing steps */
function updateInDegrees(
  processedSteps: WorkflowStep[],
  remaining: Set<string>,
  inDegrees: Map<string, number>,
  graph: Map<string, DependencyNode>
): void {
  for (const step of processedSteps) {
    remaining.delete(step.id);
    const node = graph.get(step.id);
    if (node !== undefined) {
      for (const dependentId of node.dependents) {
        const currentDegree = inDegrees.get(dependentId) ?? 0;
        inDegrees.set(dependentId, currentDegree - 1);
      }
    }
  }
}

/**
 * Performs Kahn's algorithm to create execution phases.
 * Steps with no dependencies form phase 0, their dependents form phase 1, etc.
 *
 * @param graph - Validated dependency graph
 * @returns Array of execution phases
 */
function topologicalSort(graph: Map<string, DependencyNode>): ExecutionPhase[] {
  const phases: ExecutionPhase[] = [];
  const inDegrees = initializeInDegrees(graph);
  const remaining = new Set<string>(graph.keys());
  let phaseIndex = 0;

  while (remaining.size > 0) {
    const readySteps = findReadySteps(remaining, inDegrees, graph);

    if (readySteps.length === 0) {
      break; // Should not happen if validation passed
    }

    phases.push({ steps: readySteps, phaseIndex });
    updateInDegrees(readySteps, remaining, inDegrees, graph);
    phaseIndex++;
  }

  return phases;
}

/**
 * Creates an execution plan from a workflow definition.
 * Groups steps into phases based on dependencies for parallel execution.
 *
 * @param workflow - Workflow definition to analyze
 * @returns Result with ExecutionPlan or WorkflowError
 */
export function createExecutionPlan(
  workflow: WorkflowDefinition
): Result<ExecutionPlan, WorkflowError> {
  const { steps } = workflow;

  // Handle empty workflow
  if (steps.length === 0) {
    return ok({
      phases: [],
      totalSteps: 0,
      maxParallelism: 0,
    });
  }

  // Check for duplicate step IDs
  const stepIds = new Set<string>();
  for (const step of steps) {
    if (stepIds.has(step.id)) {
      return err(
        new WorkflowError(`Duplicate step ID: '${step.id}'`, {
          context: { duplicateId: step.id },
        })
      );
    }
    stepIds.add(step.id);
  }

  // Build and validate dependency graph
  const graph = buildDependencyGraph(steps);
  const validationResult = validateGraph(graph, stepIds);

  if (!validationResult.ok) {
    return err(validationResult.error);
  }

  // Create phases via topological sort
  const phases = topologicalSort(graph);

  // Calculate max parallelism
  const maxParallelism = Math.max(...phases.map((p) => p.steps.length), 0);

  return ok({
    phases,
    totalSteps: steps.length,
    maxParallelism,
  });
}

/**
 * Validates a workflow definition without creating a full plan.
 *
 * @param workflow - Workflow definition to validate
 * @returns Result with void or WorkflowError
 */
export function validateWorkflowDependencies(
  workflow: WorkflowDefinition
): Result<void, WorkflowError> {
  const planResult = createExecutionPlan(workflow);
  if (!planResult.ok) {
    return err(planResult.error);
  }
  return ok(undefined);
}

/**
 * Gets the execution order of steps as a flat array.
 * Steps in the same phase are grouped together.
 *
 * @param plan - Execution plan
 * @returns Ordered array of step IDs
 */
export function getExecutionOrder(plan: ExecutionPlan): string[] {
  const order: string[] = [];
  for (const phase of plan.phases) {
    for (const step of phase.steps) {
      order.push(step.id);
    }
  }
  return order;
}
