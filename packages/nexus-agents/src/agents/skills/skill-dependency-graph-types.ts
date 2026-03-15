/**
 * nexus-agents/agents - Skill Dependency Graph Types
 *
 * Type definitions and Zod schemas for skill dependency graph operations.
 *
 * @module agents/skills/skill-dependency-graph-types
 * (Source: arXiv:2512.23880 CASCADE, Issue #374 Phase 2)
 */

import { z } from 'zod';
import type { Result } from '../../core/result.js';

// ============================================================================
// Dependency Types
// ============================================================================

/**
 * Type of dependency relationship between skills.
 * - required: Skill cannot execute without dependency
 * - optional: Skill can execute without, but benefits from dependency
 * - recommended: Soft dependency, suggestion only
 */
export type SkillDependencyType = 'required' | 'optional' | 'recommended';

/**
 * Represents a dependency edge between two skills.
 */
export interface SkillDependency {
  /** ID of the skill that has the dependency */
  readonly skillId: string;
  /** ID of the skill being depended upon */
  readonly dependsOn: string;
  /** Type of dependency relationship */
  readonly type: SkillDependencyType;
  /** Minimum version of the dependency required (optional) */
  readonly minVersion?: number;
}

/**
 * Error codes for dependency-related failures.
 */
export type DependencyErrorCode =
  | 'CIRCULAR_DEPENDENCY'
  | 'MISSING_DEPENDENCY'
  | 'VERSION_MISMATCH'
  | 'SELF_DEPENDENCY'
  | 'SKILL_NOT_FOUND';

/**
 * Dependency error with code and context.
 */
export interface DependencyError {
  readonly code: DependencyErrorCode;
  readonly message: string;
  readonly context?: Record<string, unknown>;
}

// ============================================================================
// Interface Definition
// ============================================================================

/**
 * Interface for skill dependency graph operations.
 */
export interface ISkillDependencyGraph {
  /** Adds a skill node to the graph */
  addSkill(skillId: string, version?: number): void;
  /** Adds a dependency edge between skills */
  addDependency(dependency: SkillDependency): Result<void, DependencyError>;
  /** Removes a dependency edge */
  removeDependency(skillId: string, dependsOn: string): boolean;
  /** Gets all dependencies for a skill */
  getDependencies(skillId: string): readonly SkillDependency[];
  /** Gets all skills that depend on a given skill */
  getDependents(skillId: string): readonly string[];
  /** Gets execution order using topological sort */
  getExecutionOrder(skillIds: readonly string[]): Result<readonly string[], DependencyError>;
  /** Checks if adding a dependency would create a cycle */
  hasCircularDependency(skillId: string): boolean;
  /** Validates the entire graph for consistency */
  validateGraph(): Result<void, DependencyError>;
  /** Gets the number of skills in the graph */
  getSkillCount(): number;
  /** Checks if a skill exists in the graph */
  hasSkill(skillId: string): boolean;
}

// ============================================================================
// Zod Schemas
// ============================================================================

/**
 * Zod schema for SkillDependencyType.
 */
export const SkillDependencyTypeSchema = z.enum(['required', 'optional', 'recommended']);

/**
 * Zod schema for SkillDependency.
 */
export const SkillDependencySchema = z.object({
  skillId: z.string().min(1).max(256).describe('ID of the skill'),
  dependsOn: z.string().min(1).max(256).describe('ID of the dependency'),
  type: SkillDependencyTypeSchema.describe('Type of dependency'),
  minVersion: z.number().int().nonnegative().optional().describe('Minimum version'),
});

/**
 * Zod schema for DependencyErrorCode.
 */
export const DependencyErrorCodeSchema = z.enum([
  'CIRCULAR_DEPENDENCY',
  'MISSING_DEPENDENCY',
  'VERSION_MISMATCH',
  'SELF_DEPENDENCY',
  'SKILL_NOT_FOUND',
]);

/**
 * Zod schema for DependencyError.
 */
export const DependencyErrorSchema = z.object({
  code: DependencyErrorCodeSchema,
  message: z.string().min(1).max(1024),
  context: z.record(z.string(), z.unknown()).optional(),
});

// ============================================================================
// Internal Types for Topological Sort
// ============================================================================

/**
 * Internal node representation for topological sort operations.
 */
export interface TopologicalSortNode {
  /** Skill identifier */
  readonly id: string;
  /** Outgoing edges (dependencies this skill has) */
  readonly dependencies: ReadonlyMap<string, SkillDependency>;
  /** Incoming edges (skills that depend on this one) */
  readonly dependents: ReadonlySet<string>;
}

/**
 * Context for Kahn's algorithm topological sort.
 */
export interface KahnContext {
  /** In-degree map for each node */
  inDegree: Map<string, number>;
  /** Queue of nodes with zero in-degree */
  queue: string[];
  /** Sorted result */
  sorted: string[];
}
