/**
 * nexus-agents/workflows - Dependency Graph
 *
 * Builds and validates step dependency graphs for workflow definitions.
 * Detects circular dependencies using Kahn's algorithm for topological sort.
 */

import { type Result, ok, err, ParseError } from '../core/index.js';
import type { WorkflowDefinition, WorkflowStep } from '../core/index.js';

/**
 * Represents a node in the dependency graph.
 */
interface GraphNode {
  /** Step ID */
  id: string;
  /** IDs of steps this node depends on */
  dependencies: Set<string>;
  /** IDs of steps that depend on this node */
  dependents: Set<string>;
}

/**
 * Dependency graph for workflow steps.
 */
export class DependencyGraph {
  private readonly nodes: Map<string, GraphNode> = new Map();

  /**
   * Adds a step to the graph.
   * @param step - The workflow step to add
   */
  addStep(step: WorkflowStep): void {
    const node: GraphNode = {
      id: step.id,
      dependencies: new Set(step.dependsOn ?? []),
      dependents: new Set(),
    };
    this.nodes.set(step.id, node);
  }

  /**
   * Builds the reverse dependency links (dependents).
   */
  buildReverseLinks(): void {
    for (const node of this.nodes.values()) {
      for (const depId of node.dependencies) {
        const depNode = this.nodes.get(depId);
        if (depNode) {
          depNode.dependents.add(node.id);
        }
      }
    }
  }

  /**
   * Gets all step IDs in the graph.
   */
  getStepIds(): string[] {
    return Array.from(this.nodes.keys());
  }

  /**
   * Gets a node by step ID.
   */
  getNode(id: string): GraphNode | undefined {
    return this.nodes.get(id);
  }

  /**
   * Validates that all dependency references exist.
   * @returns Result with void or ParseError containing missing references
   */
  validateReferences(): Result<void, ParseError> {
    const missingRefs: Array<{ stepId: string; missingDep: string }> = [];

    for (const [stepId, node] of this.nodes) {
      for (const depId of node.dependencies) {
        if (!this.nodes.has(depId)) {
          missingRefs.push({ stepId, missingDep: depId });
        }
      }
    }

    if (missingRefs.length > 0) {
      const messages = missingRefs.map(
        (ref) => `Step '${ref.stepId}' depends on non-existent step '${ref.missingDep}'`
      );
      return err(new ParseError(`Missing step references: ${messages.join('; ')}`));
    }

    return ok(undefined);
  }

  /**
   * Validates that all step IDs are unique.
   * @param steps - Array of workflow steps
   * @returns Result with void or ParseError for duplicates
   */
  static validateUniqueIds(steps: WorkflowStep[]): Result<void, ParseError> {
    const seen = new Set<string>();
    const duplicates: string[] = [];

    for (const step of steps) {
      if (seen.has(step.id)) {
        duplicates.push(step.id);
      }
      seen.add(step.id);
    }

    if (duplicates.length > 0) {
      return err(new ParseError(`Duplicate step IDs: ${duplicates.join(', ')}`));
    }

    return ok(undefined);
  }

  /**
   * Initializes in-degree map for Kahn's algorithm.
   */
  private initializeInDegrees(): Map<string, number> {
    const inDegree = new Map<string, number>();
    for (const [id, node] of this.nodes) {
      inDegree.set(id, node.dependencies.size);
    }
    return inDegree;
  }

  /**
   * Gets initial queue of nodes with zero dependencies.
   */
  private getInitialQueue(inDegree: Map<string, number>): string[] {
    const queue: string[] = [];
    for (const [id, degree] of inDegree) {
      if (degree === 0) queue.push(id);
    }
    return queue;
  }

  /**
   * Processes a single node in Kahn's algorithm.
   */
  private processNode(current: string, inDegree: Map<string, number>, queue: string[]): void {
    const node = this.nodes.get(current);
    if (node === undefined) return;
    for (const dependentId of node.dependents) {
      const newDegree = (inDegree.get(dependentId) ?? 0) - 1;
      inDegree.set(dependentId, newDegree);
      if (newDegree === 0) queue.push(dependentId);
    }
  }

  /**
   * Detects circular dependencies using Kahn's algorithm.
   * @returns Result with topologically sorted step IDs or ParseError for cycles
   */
  detectCycles(): Result<string[], ParseError> {
    const inDegree = this.initializeInDegrees();
    const queue = this.getInitialQueue(inDegree);
    const sorted: string[] = [];

    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined) break;
      sorted.push(current);
      this.processNode(current, inDegree, queue);
    }

    if (sorted.length !== this.nodes.size) {
      return this.createCycleError(sorted);
    }

    return ok(sorted);
  }

  /**
   * Creates error for detected cycle.
   */
  private createCycleError(sorted: string[]): Result<never, ParseError> {
    const cycleNodes = Array.from(this.nodes.keys()).filter((id) => !sorted.includes(id));
    const cyclePath = this.findCyclePath(cycleNodes);
    const firstNode = cyclePath[0] ?? 'unknown';
    return err(
      new ParseError(`Circular dependency detected: ${cyclePath.join(' -> ')} -> ${firstNode}`)
    );
  }

  /**
   * Finds a cycle path starting from one of the cycle nodes.
   * Uses DFS to trace back through dependencies.
   * @param cycleNodes - Nodes known to be in cycles
   * @returns Array of step IDs forming a cycle
   */
  private findCyclePath(cycleNodes: string[]): string[] {
    const firstNode = cycleNodes[0];
    if (firstNode === undefined) {
      return [];
    }

    const startNode: string = firstNode;
    const visited = new Set<string>();
    const path: string[] = [];

    const dfs = (nodeId: string): boolean => {
      if (path.includes(nodeId)) {
        // Found the cycle, trim to just the cycle
        const cycleStart = path.indexOf(nodeId);
        path.splice(0, cycleStart);
        return true;
      }

      if (visited.has(nodeId)) {
        return false;
      }

      visited.add(nodeId);
      path.push(nodeId);

      const node = this.nodes.get(nodeId);
      if (node) {
        for (const depId of node.dependencies) {
          if (cycleNodes.includes(depId)) {
            if (dfs(depId)) {
              return true;
            }
          }
        }
      }

      path.pop();
      return false;
    };

    dfs(startNode);
    return path.length > 0 ? path : cycleNodes.slice(0, 3);
  }

  /**
   * Gets the execution order (topologically sorted step IDs).
   * @returns Result with sorted step IDs or ParseError
   */
  getExecutionOrder(): Result<string[], ParseError> {
    return this.detectCycles();
  }
}

/**
 * Builds a dependency graph from a workflow definition.
 * @param workflow - The workflow definition
 * @returns The constructed dependency graph
 */
export function buildDependencyGraph(workflow: WorkflowDefinition): DependencyGraph {
  const graph = new DependencyGraph();

  for (const step of workflow.steps) {
    graph.addStep(step);
  }

  graph.buildReverseLinks();
  return graph;
}

/**
 * Validates the dependency graph of a workflow.
 * Checks for:
 * - Duplicate step IDs
 * - Missing step references
 * - Circular dependencies
 *
 * @param workflow - The workflow definition to validate
 * @returns Result with void or ParseError
 */
export function validateDependencyGraph(workflow: WorkflowDefinition): Result<void, ParseError> {
  // Check for duplicate step IDs
  const uniqueResult = DependencyGraph.validateUniqueIds(workflow.steps);
  if (!uniqueResult.ok) {
    return uniqueResult;
  }

  // Build the graph
  const graph = buildDependencyGraph(workflow);

  // Check for missing references
  const refResult = graph.validateReferences();
  if (!refResult.ok) {
    return refResult;
  }

  // Check for cycles
  const cycleResult = graph.detectCycles();
  if (!cycleResult.ok) {
    return err(cycleResult.error);
  }

  return ok(undefined);
}

/**
 * Gets the topologically sorted execution order for a workflow.
 * Used for parsing validation (returns ParseError).
 * For execution planning, use createExecutionPlan from execution-planner.
 *
 * @param workflow - The workflow definition
 * @returns Result with sorted step IDs or ParseError
 */
export function getTopologicalOrder(workflow: WorkflowDefinition): Result<string[], ParseError> {
  const graph = buildDependencyGraph(workflow);

  const refResult = graph.validateReferences();
  if (!refResult.ok) {
    return err(refResult.error);
  }

  return graph.getExecutionOrder();
}
