/**
 * nexus-agents/agents - Skill Dependency Graph Cycle Detection
 *
 * DFS-based cycle detection utilities for skill dependency graphs.
 * Extracted to reduce complexity in the main graph implementation.
 *
 * @module agents/skills/skill-dependency-graph-cycle
 * (Source: arXiv:2512.23880 CASCADE, Issue #374 Phase 2)
 */

import type { SkillDependency } from './skill-dependency-graph-types.js';

/**
 * Internal node representation for cycle detection operations.
 */
export interface CycleDetectionNode {
  /** Skill identifier */
  readonly id: string;
  /** Outgoing edges (dependencies this skill has) */
  readonly dependencies: ReadonlyMap<string, SkillDependency>;
}

/**
 * Type for node lookup function used in cycle detection.
 */
export type NodeLookup = (id: string) => CycleDetectionNode | undefined;

/**
 * Checks if there's a path from start to target using DFS.
 *
 * @param start - Starting node ID
 * @param target - Target node ID to find
 * @param visited - Set of already visited nodes
 * @param getNode - Function to retrieve node by ID
 * @returns True if target is reachable from start
 */
export function canReach(
  start: string,
  target: string,
  visited: Set<string>,
  getNode: NodeLookup
): boolean {
  if (start === target) return true;
  if (visited.has(start)) return false;
  visited.add(start);

  const node = getNode(start);
  if (!node) return false;

  for (const depId of node.dependencies.keys()) {
    if (canReach(depId, target, visited, getNode)) return true;
  }
  return false;
}

/**
 * Checks if adding an edge from->to would create a cycle.
 *
 * @param from - Source node ID (the skill with the dependency)
 * @param to - Target node ID (the dependency)
 * @param getNode - Function to retrieve node by ID
 * @returns True if adding this edge would create a cycle
 */
export function wouldCreateCycle(from: string, to: string, getNode: NodeLookup): boolean {
  return canReach(to, from, new Set(), getNode);
}

/**
 * Finds the path that forms a cycle when adding edge from->to.
 *
 * @param from - Source node ID
 * @param to - Target node ID
 * @param getNode - Function to retrieve node by ID
 * @returns Array of node IDs forming the cycle path
 */
export function findCyclePath(from: string, to: string, getNode: NodeLookup): readonly string[] {
  const path: string[] = [from, to];
  const visited = new Set<string>([from]);

  const findPath = (current: string): boolean => {
    if (current === from) return true;

    const node = getNode(current);
    if (!node) return false;

    for (const depId of node.dependencies.keys()) {
      if (!visited.has(depId)) {
        visited.add(depId);
        path.push(depId);
        if (findPath(depId)) return true;
        path.pop();
      } else if (depId === from) {
        return true;
      }
    }
    return false;
  };

  findPath(to);
  return path;
}

/**
 * Detects if a cycle exists starting from a given node using DFS.
 *
 * @param nodeId - Starting node ID
 * @param visited - Global visited set (nodes fully explored)
 * @param stack - Current recursion stack (nodes in current path)
 * @param getNode - Function to retrieve node by ID
 * @returns True if a cycle is detected
 */
export function detectCycleDFS(
  nodeId: string,
  visited: Set<string>,
  stack: Set<string>,
  getNode: NodeLookup
): boolean {
  visited.add(nodeId);
  stack.add(nodeId);

  const node = getNode(nodeId);
  if (node) {
    for (const depId of node.dependencies.keys()) {
      if (!visited.has(depId)) {
        if (detectCycleDFS(depId, visited, stack, getNode)) return true;
      } else if (stack.has(depId)) {
        return true;
      }
    }
  }

  stack.delete(nodeId);
  return false;
}

/**
 * Finds the actual cycle path starting from a given node.
 *
 * @param startId - Starting node ID
 * @param getNode - Function to retrieve node by ID
 * @returns Array of node IDs forming the cycle
 */
export function findCycleFromNode(startId: string, getNode: NodeLookup): readonly string[] {
  const path: string[] = [];
  const visited = new Set<string>();

  const dfs = (nodeId: string): boolean => {
    if (path.includes(nodeId)) {
      const cycleStart = path.indexOf(nodeId);
      path.splice(0, cycleStart);
      path.push(nodeId);
      return true;
    }

    if (visited.has(nodeId)) return false;
    visited.add(nodeId);
    path.push(nodeId);

    const node = getNode(nodeId);
    if (node) {
      for (const depId of node.dependencies.keys()) {
        if (dfs(depId)) return true;
      }
    }

    path.pop();
    return false;
  };

  dfs(startId);
  return path;
}
