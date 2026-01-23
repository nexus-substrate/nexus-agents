/**
 * nexus-agents/agents - Skill Loader Helpers
 *
 * Helper functions for the deterministic skill loader.
 * Separated for maintainability and testability.
 *
 * @module agents/skills/skill-loader-helpers
 * (Source: Issue #374 Phase 3)
 */

import type { AgentRole } from '../../core/types/agent.js';
import type { Result } from '../../core/result.js';
import { ok } from '../../core/result.js';
import type { Skill, SkillCategory, SkillWithMetrics } from './skill-types.js';
import type { SkillLibrary } from './skill-library.js';
import { buildDependencyGraph, type DependencyError } from './skill-dependency-graph.js';
import { canExecuteSkill, DEFAULT_RBAC, type SkillRBAC } from './skill-security.js';
import type {
  SkillLoaderError,
  SkillLoaderErrorCode,
  RoleSkillMapping,
} from './skill-loader-types.js';

// ============================================================================
// Error Creation
// ============================================================================

/**
 * Creates a skill loader error with the given code, message, and optional context.
 */
export function createLoaderError(
  code: SkillLoaderErrorCode,
  message: string,
  context?: Record<string, unknown>
): SkillLoaderError {
  return context !== undefined ? { code, message, context } : { code, message };
}

// ============================================================================
// Role Mapping Functions
// ============================================================================

/**
 * Finds the mapping for a given role.
 * Checks the index first, then falls back to linear search.
 */
export function findMappingForRole(
  role: AgentRole,
  index: Map<AgentRole, RoleSkillMapping>,
  mappings: readonly RoleSkillMapping[]
): RoleSkillMapping | undefined {
  // Try index first (O(1))
  const indexed = index.get(role);
  if (indexed) {
    return indexed;
  }

  // Fall back to linear search in case index is stale
  return mappings.find((m) => m.role === role);
}

// ============================================================================
// Skill Collection Functions
// ============================================================================

/**
 * Collects all skills from the library that match any of the given categories.
 */
export function collectSkillsForCategories(
  library: SkillLibrary,
  categories: readonly SkillCategory[]
): Skill[] {
  const skills: Skill[] = [];
  const seenIds = new Set<string>();

  for (const category of categories) {
    const categorySkills = library.getSkillsByCategory(category);
    for (const skill of categorySkills) {
      if (!seenIds.has(skill.id)) {
        seenIds.add(skill.id);
        // Extract base skill without metrics for the result
        skills.push(stripMetrics(skill));
      }
    }
  }

  return skills;
}

/**
 * Strips metrics from a SkillWithMetrics to get base Skill.
 */
function stripMetrics(skill: SkillWithMetrics): Skill {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { metrics, ...baseSkill } = skill;
  return baseSkill;
}

// ============================================================================
// RBAC Functions
// ============================================================================

/**
 * Filters skills by RBAC rules for a given role.
 */
export function filterSkillsByRBAC(skills: readonly Skill[], role: AgentRole): Skill[] {
  return skills.filter((skill) => {
    const rbac: SkillRBAC = skill.rbac ?? DEFAULT_RBAC;
    return canExecuteSkill(role, rbac);
  });
}

// ============================================================================
// Dependency Ordering Functions
// ============================================================================

/**
 * Computes execution order for skills using topological sort.
 */
export function computeExecutionOrder(
  skills: readonly Skill[]
): Result<readonly string[], DependencyError> {
  if (skills.length === 0) {
    return ok([]);
  }

  const graph = buildDependencyGraph(skills);

  // Validate graph first
  const validation = graph.validateGraph();
  if (!validation.ok) {
    return validation;
  }

  // Get execution order
  const skillIds = skills.map((s) => s.id);
  return graph.getExecutionOrder(skillIds);
}

// ============================================================================
// Category Validation Functions
// ============================================================================

/**
 * Identifies required categories that are missing from the skill set.
 */
export function identifyMissingCategories(
  requiredCategories: readonly SkillCategory[],
  presentCategories: Set<SkillCategory>
): string[] {
  const missing: string[] = [];
  for (const category of requiredCategories) {
    if (!presentCategories.has(category)) {
      missing.push(category);
    }
  }
  return missing;
}

// ============================================================================
// Limit Application Functions
// ============================================================================

/**
 * Applies a maximum skill limit to the skill set.
 * Preserves determinism by assuming input is already sorted.
 */
export function applySkillLimit(skills: readonly Skill[], maxSkills: number): Skill[] {
  if (skills.length <= maxSkills) {
    return [...skills];
  }
  return skills.slice(0, maxSkills);
}

// ============================================================================
// Sorting Functions
// ============================================================================

/**
 * Sorts skills by ID for deterministic ordering.
 * Uses localeCompare for consistent string sorting.
 */
export function sortSkillsById(skills: readonly Skill[]): Skill[] {
  return [...skills].sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Sorts skill IDs for deterministic ordering.
 */
export function sortSkillIds(ids: readonly string[]): string[] {
  return [...ids].sort((a, b) => a.localeCompare(b));
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Checks if a skill set covers all required categories.
 */
export function hasAllRequiredCategories(
  skills: readonly Skill[],
  requiredCategories: readonly SkillCategory[]
): boolean {
  const presentCategories = new Set(skills.map((s) => s.category));
  return requiredCategories.every((cat) => presentCategories.has(cat));
}

/**
 * Gets the categories present in a skill set.
 */
export function getCategoriesFromSkills(skills: readonly Skill[]): Set<SkillCategory> {
  return new Set(skills.map((s) => s.category));
}

/**
 * Counts skills by category.
 */
export function countSkillsByCategory(skills: readonly Skill[]): Map<SkillCategory, number> {
  const counts = new Map<SkillCategory, number>();
  for (const skill of skills) {
    const current = counts.get(skill.category) ?? 0;
    counts.set(skill.category, current + 1);
  }
  return counts;
}

// ============================================================================
// Category Helpers
// ============================================================================

/**
 * Gets all categories from a role mapping (required + optional).
 */
export function getAllCategoriesFromMapping(mapping: RoleSkillMapping): readonly SkillCategory[] {
  const categories = new Set<SkillCategory>(mapping.requiredCategories);
  if (mapping.optionalCategories) {
    for (const cat of mapping.optionalCategories) {
      categories.add(cat);
    }
  }
  return Array.from(categories);
}

// ============================================================================
// Merge Functions
// ============================================================================

/**
 * Merges two skill arrays, removing duplicates by ID.
 * Preserves order from the first array, appending unique skills from the second.
 */
export function mergeSkillSets(base: readonly Skill[], additional: readonly Skill[]): Skill[] {
  const seenIds = new Set(base.map((s) => s.id));
  const result = [...base];

  for (const skill of additional) {
    if (!seenIds.has(skill.id)) {
      seenIds.add(skill.id);
      result.push(skill);
    }
  }

  return result;
}

/**
 * Gets the difference between two skill sets (skills in first but not in second).
 */
export function getSkillSetDifference(first: readonly Skill[], second: readonly Skill[]): Skill[] {
  const secondIds = new Set(second.map((s) => s.id));
  return first.filter((s) => !secondIds.has(s.id));
}

/**
 * Gets the intersection of two skill sets (skills in both).
 */
export function getSkillSetIntersection(
  first: readonly Skill[],
  second: readonly Skill[]
): Skill[] {
  const secondIds = new Set(second.map((s) => s.id));
  return first.filter((s) => secondIds.has(s.id));
}
