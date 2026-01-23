/**
 * nexus-agents/agents - Skill Dependency Graph Helpers
 *
 * Helper functions for skill dependency graph operations.
 * Extracted to reduce file complexity and improve testability.
 *
 * @module agents/skills/skill-dependency-graph-helpers
 * (Source: arXiv:2512.23880 CASCADE, Issue #374 Phase 2)
 */

import type { Result } from '../../core/result.js';
import { ok, err } from '../../core/result.js';
import type {
  SkillDependency,
  DependencyError,
  DependencyErrorCode,
  ISkillDependencyGraph,
  TopologicalSortNode,
  KahnContext,
} from './skill-dependency-graph-types.js';
import type { Skill } from './skill-types.js';

// Re-export types for convenience
export type { TopologicalSortNode, KahnContext } from './skill-dependency-graph-types.js';

// ============================================================================
// Error Creation
// ============================================================================

/**
 * Creates a dependency error with the given code and message.
 *
 * @param code - The error code
 * @param message - Human-readable error message
 * @param context - Additional context for debugging
 * @returns A DependencyError
 */
export function createDependencyError(
  code: DependencyErrorCode,
  message: string,
  context?: Record<string, unknown>
): DependencyError {
  // Use conditional inclusion for exactOptionalPropertyTypes compatibility
  return context !== undefined ? { code, message, context } : { code, message };
}

// ============================================================================
// Topological Sort Helpers
// ============================================================================

/**
 * Initializes in-degree map for a subset of nodes.
 *
 * @param skillIds - Set of skill IDs to include
 * @param getNode - Function to get a node by ID
 * @returns Initialized in-degree map
 */
export function initializeInDegrees(
  skillIds: Set<string>,
  getNode: (id: string) => TopologicalSortNode | undefined
): Map<string, number> {
  const inDegree = new Map<string, number>();

  // Initialize all nodes with degree 0
  for (const id of skillIds) {
    inDegree.set(id, 0);
  }

  // Calculate actual in-degrees based on required dependencies
  for (const id of skillIds) {
    const node = getNode(id);
    if (node) {
      for (const [depId, dep] of node.dependencies) {
        if (skillIds.has(depId) && dep.type === 'required') {
          inDegree.set(id, (inDegree.get(id) ?? 0) + 1);
        }
      }
    }
  }

  return inDegree;
}

/**
 * Finds all nodes with zero in-degree (ready to process).
 *
 * @param inDegree - The in-degree map
 * @returns Array of node IDs with zero in-degree
 */
export function findZeroInDegreeNodes(inDegree: Map<string, number>): string[] {
  const result: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) {
      result.push(id);
    }
  }
  return result;
}

/**
 * Processes a single node during Kahn's algorithm traversal.
 * Updates in-degrees of dependents and adds newly ready nodes to queue.
 *
 * @param current - The current node being processed
 * @param skillIds - Set of skill IDs in the subgraph
 * @param context - The Kahn algorithm context
 * @param getNode - Function to get a node by ID
 */
export function processKahnNode(
  current: string,
  skillIds: Set<string>,
  context: KahnContext,
  getNode: (id: string) => TopologicalSortNode | undefined
): void {
  const node = getNode(current);
  if (!node) {
    return;
  }

  for (const dependentId of node.dependents) {
    // Skip nodes not in our subgraph
    if (!skillIds.has(dependentId)) {
      continue;
    }

    const depNode = getNode(dependentId);
    const dep = depNode?.dependencies.get(current);

    // Only process required dependencies
    if (dep?.type !== 'required') {
      continue;
    }

    const newDegree = (context.inDegree.get(dependentId) ?? 0) - 1;
    context.inDegree.set(dependentId, newDegree);

    if (newDegree === 0) {
      context.queue.push(dependentId);
    }
  }
}

/**
 * Performs Kahn's algorithm traversal.
 *
 * @param skillIds - Set of skill IDs in the subgraph
 * @param context - The Kahn algorithm context
 * @param getNode - Function to get a node by ID
 * @returns Result with sorted IDs or cycle error
 */
export function executeKahnTraversal(
  skillIds: Set<string>,
  context: KahnContext,
  getNode: (id: string) => TopologicalSortNode | undefined
): Result<readonly string[], DependencyError> {
  while (context.queue.length > 0) {
    const current = context.queue.shift();
    if (current === undefined) {
      break;
    }

    context.sorted.push(current);
    processKahnNode(current, skillIds, context, getNode);
  }

  // Check for cycle (not all nodes processed)
  if (context.sorted.length !== skillIds.size) {
    const cycleNodes = Array.from(skillIds).filter((id) => !context.sorted.includes(id));
    return err(
      createDependencyError(
        'CIRCULAR_DEPENDENCY',
        `Circular dependency among skills: ${cycleNodes.join(', ')}`,
        { cycleNodes }
      )
    );
  }

  return ok(context.sorted);
}

// ============================================================================
// Graph Resolution Helpers
// ============================================================================

/**
 * Resolves skill dependencies with fallbacks for missing optional dependencies.
 *
 * @param graph - The dependency graph
 * @param skillIds - Skills to resolve
 * @param available - Set of available skill IDs
 * @returns Result with resolved skill IDs or error
 */
export function resolveWithFallbacks(
  graph: ISkillDependencyGraph,
  skillIds: readonly string[],
  available: ReadonlySet<string>
): Result<readonly string[], DependencyError> {
  // Filter to available skills
  const resolvedSkills: string[] = [];

  for (const id of skillIds) {
    if (available.has(id)) {
      resolvedSkills.push(id);
    }
  }

  // Check if any required dependencies are missing
  for (const id of resolvedSkills) {
    const deps = graph.getDependencies(id);
    for (const dep of deps) {
      if (dep.type === 'required' && !available.has(dep.dependsOn)) {
        return err(
          createDependencyError(
            'MISSING_DEPENDENCY',
            `Required dependency '${dep.dependsOn}' for skill '${id}' is not available`,
            { skillId: id, missingDependency: dep.dependsOn }
          )
        );
      }
    }
  }

  // Get execution order for available skills
  if (resolvedSkills.length === 0) {
    return ok([]);
  }

  return graph.getExecutionOrder(resolvedSkills);
}

/**
 * Finds missing dependencies for a set of skills.
 *
 * @param graph - The dependency graph
 * @param skillIds - Skills to check
 * @param available - Set of available skill IDs
 * @returns Array of missing required dependency IDs
 */
export function findMissingDependencies(
  graph: ISkillDependencyGraph,
  skillIds: readonly string[],
  available: ReadonlySet<string>
): readonly string[] {
  const missing = new Set<string>();

  for (const id of skillIds) {
    if (!available.has(id)) {
      continue;
    }

    const deps = graph.getDependencies(id);
    for (const dep of deps) {
      if (dep.type === 'required' && !available.has(dep.dependsOn)) {
        missing.add(dep.dependsOn);
      }
    }
  }

  return Array.from(missing);
}

/**
 * Builds dependency edges from a skill's dependencies list.
 *
 * @param skill - The skill to extract dependencies from
 * @returns Array of SkillDependency edges
 */
export function buildSkillDependencies(skill: Skill): readonly SkillDependency[] {
  return skill.dependencies.map((depId) => ({
    skillId: skill.id,
    dependsOn: depId,
    type: 'required' as const, // Default to required from skill.dependencies
  }));
}
