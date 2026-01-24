/**
 * nexus-agents/agents - Skill Dependency Graph
 *
 * Manages skill dependencies for execution ordering using topological sort.
 * Implements Kahn's algorithm for execution order and DFS-based cycle detection.
 *
 * @module agents/skills/skill-dependency-graph
 * (Source: arXiv:2512.23880 CASCADE, Issue #374 Phase 2)
 */

import type { Result } from '../../core/result.js';
import { ok, err } from '../../core/result.js';
import type { Skill } from './skill-types.js';
import type {
  SkillDependency,
  DependencyError,
  ISkillDependencyGraph,
  TopologicalSortNode,
  KahnContext,
} from './skill-dependency-graph-types.js';
import {
  createDependencyError,
  initializeInDegrees,
  findZeroInDegreeNodes,
  executeKahnTraversal,
} from './skill-dependency-graph-helpers.js';
import {
  wouldCreateCycle,
  findCyclePath,
  detectCycleDFS,
  findCycleFromNode,
  type NodeLookup,
} from './skill-dependency-graph-cycle.js';

// Re-export types and schemas
export type {
  SkillDependencyType,
  SkillDependency,
  DependencyErrorCode,
  DependencyError,
  ISkillDependencyGraph,
} from './skill-dependency-graph-types.js';
export {
  SkillDependencyTypeSchema,
  SkillDependencySchema,
  DependencyErrorCodeSchema,
  DependencyErrorSchema,
} from './skill-dependency-graph-types.js';
export {
  createDependencyError,
  resolveWithFallbacks,
  findMissingDependencies,
} from './skill-dependency-graph-helpers.js';

/** Internal node representation in the adjacency list. */
interface SkillNode {
  readonly id: string;
  readonly version: number;
  dependencies: Map<string, SkillDependency>;
  dependents: Set<string>;
}

/**
 * Skill dependency graph implementation using adjacency list.
 * Supports topological sorting, cycle detection, and version constraints.
 */
export class SkillDependencyGraph implements ISkillDependencyGraph {
  /** Adjacency list representation */
  private readonly nodes: Map<string, SkillNode> = new Map();

  /** Node lookup function for cycle detection utilities */
  private readonly nodeLookup: NodeLookup = (id: string) => this.nodes.get(id);

  /** Adds a skill node to the graph. */
  addSkill(skillId: string, version: number = 1): void {
    if (this.nodes.has(skillId)) {
      return;
    }
    this.nodes.set(skillId, {
      id: skillId,
      version,
      dependencies: new Map(),
      dependents: new Set(),
    });
  }

  /** Adds a dependency edge between two skills. */
  addDependency(dependency: SkillDependency): Result<void, DependencyError> {
    if (dependency.skillId === dependency.dependsOn) {
      return err(
        createDependencyError(
          'SELF_DEPENDENCY',
          `Skill '${dependency.skillId}' cannot depend on itself`,
          { skillId: dependency.skillId }
        )
      );
    }

    if (!this.nodes.has(dependency.skillId)) {
      this.addSkill(dependency.skillId);
    }
    if (!this.nodes.has(dependency.dependsOn)) {
      this.addSkill(dependency.dependsOn);
    }

    const versionResult = this.checkVersionConstraint(dependency);
    if (!versionResult.ok) {
      return versionResult;
    }

    if (wouldCreateCycle(dependency.skillId, dependency.dependsOn, this.nodeLookup)) {
      const cyclePath = findCyclePath(dependency.skillId, dependency.dependsOn, this.nodeLookup);
      return err(
        createDependencyError(
          'CIRCULAR_DEPENDENCY',
          `Adding dependency would create cycle: ${cyclePath.join(' -> ')}`,
          { skillId: dependency.skillId, dependsOn: dependency.dependsOn, cyclePath }
        )
      );
    }

    const skillNode = this.nodes.get(dependency.skillId);
    const depNode = this.nodes.get(dependency.dependsOn);

    if (skillNode && depNode) {
      skillNode.dependencies.set(dependency.dependsOn, dependency);
      depNode.dependents.add(dependency.skillId);
    }

    return ok(undefined);
  }

  /** Removes a dependency edge between two skills. */
  removeDependency(skillId: string, dependsOn: string): boolean {
    const skillNode = this.nodes.get(skillId);
    const depNode = this.nodes.get(dependsOn);

    if (!skillNode || !depNode) {
      return false;
    }

    const removed = skillNode.dependencies.delete(dependsOn);
    if (removed) {
      depNode.dependents.delete(skillId);
    }

    return removed;
  }

  /** Gets all dependencies for a skill. */
  getDependencies(skillId: string): readonly SkillDependency[] {
    const node = this.nodes.get(skillId);
    return node ? Array.from(node.dependencies.values()) : [];
  }

  /** Gets all skills that depend on a given skill. */
  getDependents(skillId: string): readonly string[] {
    const node = this.nodes.get(skillId);
    return node ? Array.from(node.dependents) : [];
  }

  /** Gets execution order for given skills using Kahn's algorithm. */
  getExecutionOrder(skillIds: readonly string[]): Result<readonly string[], DependencyError> {
    const missingSkills = skillIds.filter((id) => !this.nodes.has(id));
    if (missingSkills.length > 0) {
      return err(
        createDependencyError('SKILL_NOT_FOUND', `Skills not found: ${missingSkills.join(', ')}`, {
          missingSkills,
        })
      );
    }

    const relevantSkills = this.collectRelevantSkills(skillIds);
    return this.topologicalSort(relevantSkills);
  }

  /** Checks if a skill has a circular dependency. */
  hasCircularDependency(skillId: string): boolean {
    if (!this.nodes.has(skillId)) {
      return false;
    }
    return detectCycleDFS(skillId, new Set(), new Set(), this.nodeLookup);
  }

  /** Validates the entire graph for consistency. */
  validateGraph(): Result<void, DependencyError> {
    for (const [skillId, node] of this.nodes) {
      for (const [depId, dep] of node.dependencies) {
        if (!this.nodes.has(depId)) {
          return err(
            createDependencyError(
              'MISSING_DEPENDENCY',
              `Skill '${skillId}' depends on missing skill '${depId}'`,
              { skillId, missingDependency: depId }
            )
          );
        }

        const versionResult = this.checkVersionConstraint(dep);
        if (!versionResult.ok) {
          return versionResult;
        }
      }
    }

    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    for (const skillId of this.nodes.keys()) {
      if (
        !visited.has(skillId) &&
        detectCycleDFS(skillId, visited, recursionStack, this.nodeLookup)
      ) {
        const cyclePath = findCycleFromNode(skillId, this.nodeLookup);
        return err(
          createDependencyError(
            'CIRCULAR_DEPENDENCY',
            `Circular dependency detected: ${cyclePath.join(' -> ')}`,
            { cyclePath }
          )
        );
      }
    }

    return ok(undefined);
  }

  /** Gets the number of skills in the graph. */
  getSkillCount(): number {
    return this.nodes.size;
  }

  /** Checks if a skill exists in the graph. */
  hasSkill(skillId: string): boolean {
    return this.nodes.has(skillId);
  }

  private checkVersionConstraint(dependency: SkillDependency): Result<void, DependencyError> {
    if (dependency.minVersion === undefined) {
      return ok(undefined);
    }

    const depNode = this.nodes.get(dependency.dependsOn);
    if (!depNode) {
      return ok(undefined);
    }

    if (depNode.version < dependency.minVersion) {
      return err(
        createDependencyError(
          'VERSION_MISMATCH',
          `Skill '${dependency.dependsOn}' version ${String(depNode.version)} ` +
            `is less than required ${String(dependency.minVersion)}`,
          {
            skillId: dependency.skillId,
            dependsOn: dependency.dependsOn,
            requiredVersion: dependency.minVersion,
            actualVersion: depNode.version,
          }
        )
      );
    }

    return ok(undefined);
  }

  private collectRelevantSkills(skillIds: readonly string[]): Set<string> {
    const relevant = new Set<string>();
    const queue = [...skillIds];

    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined || relevant.has(current)) continue;

      relevant.add(current);

      const node = this.nodes.get(current);
      if (node) {
        for (const [depId, dep] of node.dependencies) {
          if (dep.type === 'required' && !relevant.has(depId)) {
            queue.push(depId);
          }
        }
      }
    }

    return relevant;
  }

  private topologicalSort(skillIds: Set<string>): Result<readonly string[], DependencyError> {
    const getNode = (id: string): TopologicalSortNode | undefined => {
      const node = this.nodes.get(id);
      if (!node) return undefined;
      return { id: node.id, dependencies: node.dependencies, dependents: node.dependents };
    };

    const inDegree = initializeInDegrees(skillIds, getNode);
    const context: KahnContext = {
      inDegree,
      queue: findZeroInDegreeNodes(inDegree),
      sorted: [],
    };

    return executeKahnTraversal(skillIds, context, getNode);
  }
}

/** Builds a dependency graph from an array of skills. */
export function buildDependencyGraph(skills: readonly Skill[]): ISkillDependencyGraph {
  const graph = new SkillDependencyGraph();

  for (const skill of skills) {
    graph.addSkill(skill.id, skill.version);
  }

  for (const skill of skills) {
    for (const depId of skill.dependencies) {
      graph.addDependency({
        skillId: skill.id,
        dependsOn: depId,
        type: 'required',
      });
    }
  }

  return graph;
}

/** Creates an empty skill dependency graph. */
export function createSkillDependencyGraph(): ISkillDependencyGraph {
  return new SkillDependencyGraph();
}
