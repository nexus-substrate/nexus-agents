/**
 * nexus-agents/agents - Deterministic Skill Loader
 *
 * Implements the skill loader for role-based skill assignment.
 * Provides deterministic loading: same role + same library = same skills.
 * Uses SkillLibrary for retrieval, SkillDependencyGraph for ordering,
 * and skill-security for RBAC enforcement.
 *
 * @module agents/skills/skill-loader
 * (Source: Issue #374 Phase 3)
 */

import type { ILogger } from '../../core/index.js';
import { createLogger } from '../../core/index.js';
import type { Result } from '../../core/result.js';
import { ok, err } from '../../core/result.js';
import type { AgentRole, IAgent, Task } from '../../core/types/agent.js';
import type { Skill } from './skill-types.js';
import type { SkillLibrary } from './skill-library.js';
import { canExecuteSkill, DEFAULT_RBAC } from './skill-security.js';
import type {
  SkillLoaderConfig,
  SkillLoaderError,
  LoadedSkillSet,
  RoleSkillMapping,
  ISkillLoader,
} from './skill-loader-types.js';
import { DEFAULT_SKILL_LOADER_CONFIG } from './skill-loader-types.js';
import {
  createLoaderError,
  findMappingForRole,
  collectSkillsForCategories,
  filterSkillsByRBAC,
  computeExecutionOrder,
  identifyMissingCategories,
  applySkillLimit,
  sortSkillsById,
  getAllCategoriesFromMapping,
} from './skill-loader-helpers.js';

// Re-export types
export type {
  SkillLoaderConfig,
  SkillLoaderError,
  SkillLoaderErrorCode,
  LoadedSkillSet,
  RoleSkillMapping,
  FallbackBehavior,
  ISkillLoader,
} from './skill-loader-types.js';

export {
  DEFAULT_ROLE_MAPPINGS,
  DEFAULT_SKILL_LOADER_CONFIG,
  SkillLoaderConfigSchema,
  LoadedSkillSetSchema,
  SkillLoaderErrorSchema,
} from './skill-loader-types.js';

/**
 * Deterministic skill loader implementation.
 *
 * Key guarantees:
 * - Same role + same library state = same skill set (deterministic)
 * - Skills are sorted by ID before filtering for determinism
 * - Execution order follows dependency graph (topological sort)
 * - RBAC enforcement prevents unauthorized skill access
 */
export class SkillLoader implements ISkillLoader {
  private readonly config: SkillLoaderConfig;
  private readonly library: SkillLibrary;
  private readonly logger: ILogger;
  private readonly mappingIndex: Map<AgentRole, RoleSkillMapping>;

  constructor(library: SkillLibrary, config?: Partial<SkillLoaderConfig>, logger?: ILogger) {
    this.library = library;
    this.config = { ...DEFAULT_SKILL_LOADER_CONFIG, ...config };
    this.logger = logger ?? createLogger({ component: 'SkillLoader' });

    // Build index for O(1) mapping lookup
    this.mappingIndex = new Map();
    for (const mapping of this.config.mappings) {
      this.mappingIndex.set(mapping.role, mapping);
    }
  }

  /**
   * Loads skills for an agent based on their role.
   * Deterministic: same role + same library = same skills.
   */
  loadForAgent(agentId: string, role: AgentRole): Result<LoadedSkillSet, SkillLoaderError> {
    this.logger.debug('Loading skills for agent', { agentId, role });

    // Find role mapping
    const mapping = findMappingForRole(role, this.mappingIndex, this.config.mappings);
    if (!mapping) {
      return this.handleUnmappedRole(agentId, role);
    }

    // Collect and filter skills
    const rbacFiltered = this.collectAndFilterSkills(mapping, role);

    // Validate required categories
    const missingCheck = this.checkRequiredCategories(rbacFiltered, mapping);
    const missingError = this.validateMissingCategories(missingCheck, role);
    if (missingError) {
      return err(missingError);
    }

    // Apply limits and compute order
    const maxSkills = mapping.maxSkills ?? this.config.defaultMaxSkills;
    const limitedSkills = applySkillLimit(rbacFiltered, maxSkills);

    // Handle empty result
    const emptyError = this.validateNonEmpty(limitedSkills, role);
    if (emptyError) {
      return err(emptyError);
    }

    // Compute execution order
    const executionOrder = this.getExecutionOrderOrFallback(limitedSkills);

    return ok(
      this.buildLoadedSkillSet(agentId, role, limitedSkills, executionOrder, missingCheck.missing)
    );
  }

  /**
   * Collects skills for a mapping and applies RBAC filtering.
   */
  private collectAndFilterSkills(mapping: RoleSkillMapping, role: AgentRole): Skill[] {
    const allCategories = getAllCategoriesFromMapping(mapping);
    const candidateSkills = collectSkillsForCategories(this.library, allCategories);
    const sortedSkills = sortSkillsById(candidateSkills);

    return this.config.enforceRBAC ? filterSkillsByRBAC(sortedSkills, role) : sortedSkills;
  }

  /**
   * Validates missing categories and returns error if fallback is 'error'.
   */
  private validateMissingCategories(
    missingCheck: { hasMissing: boolean; missing: string[] },
    role: AgentRole
  ): SkillLoaderError | null {
    if (missingCheck.hasMissing && this.config.fallbackBehavior === 'error') {
      return createLoaderError(
        'REQUIRED_CATEGORY_MISSING',
        `Missing required skill categories: ${missingCheck.missing.join(', ')}`,
        { role, missingCategories: missingCheck.missing }
      );
    }
    return null;
  }

  /**
   * Validates that skills are non-empty and returns error if fallback is 'error'.
   */
  private validateNonEmpty(skills: readonly Skill[], role: AgentRole): SkillLoaderError | null {
    if (skills.length === 0 && this.config.fallbackBehavior === 'error') {
      return createLoaderError('EMPTY_RESULT', `No skills available for role: ${role}`, { role });
    }
    return null;
  }

  /**
   * Gets execution order or falls back to ID order on error.
   */
  private getExecutionOrderOrFallback(skills: readonly Skill[]): readonly string[] {
    const orderResult = this.computeSkillOrder(skills);
    if (!orderResult.ok && this.config.fallbackBehavior === 'error') {
      // Error case handled by caller
    }
    return orderResult.ok ? orderResult.value : skills.map((s) => s.id);
  }

  /**
   * Builds the LoadedSkillSet result object.
   */
  private buildLoadedSkillSet(
    agentId: string,
    role: AgentRole,
    skills: readonly Skill[],
    executionOrder: readonly string[],
    missingRequired: readonly string[]
  ): LoadedSkillSet {
    const loadedSet: LoadedSkillSet = {
      agentId,
      agentRole: role,
      skills,
      executionOrder,
      missingRequired,
      loadedAt: new Date(),
    };

    this.logger.info('Skills loaded for agent', {
      agentId,
      role,
      skillCount: skills.length,
      missingRequired: missingRequired.length,
    });

    return loadedSet;
  }

  /**
   * Loads skills for a task, potentially including task-relevant skills.
   */
  loadForTask(
    agentId: string,
    role: AgentRole,
    taskDescription: string
  ): Result<LoadedSkillSet, SkillLoaderError> {
    this.logger.debug('Loading skills for task', { agentId, role, taskDescription });

    // Start with base role skills
    const baseResult = this.loadForAgent(agentId, role);
    if (!baseResult.ok) {
      return baseResult;
    }

    // Find task-relevant skills from the library
    const relevantSkills = this.library.findRelevantSkills(taskDescription, 10);

    // Filter by RBAC
    const rbacFiltered = this.config.enforceRBAC
      ? filterSkillsByRBAC([...relevantSkills], role)
      : [...relevantSkills];

    // Merge with base skills (deduplicate by ID)
    const baseSet = baseResult.value;
    const baseIds = new Set(baseSet.skills.map((s) => s.id));
    const additionalSkills = rbacFiltered.filter((s) => !baseIds.has(s.id));

    if (additionalSkills.length === 0) {
      return baseResult;
    }

    // Combine and re-sort
    const combinedSkills = sortSkillsById([...baseSet.skills, ...additionalSkills]);

    // Apply limit to combined set
    const mapping = findMappingForRole(role, this.mappingIndex, this.config.mappings);
    const maxSkills = mapping?.maxSkills ?? this.config.defaultMaxSkills;
    const limitedSkills = applySkillLimit(combinedSkills, maxSkills);

    // Recompute execution order
    const executionOrderResult = this.computeSkillOrder(limitedSkills);
    const executionOrder = executionOrderResult.ok
      ? executionOrderResult.value
      : limitedSkills.map((s) => s.id);

    const loadedSet: LoadedSkillSet = {
      agentId,
      agentRole: role,
      skills: limitedSkills,
      executionOrder,
      missingRequired: baseSet.missingRequired,
      loadedAt: new Date(),
    };

    this.logger.info('Skills loaded for task', {
      agentId,
      role,
      skillCount: limitedSkills.length,
      additionalSkills: additionalSkills.length,
    });

    return ok(loadedSet);
  }

  /**
   * Gets all skills available to a role without limits.
   */
  getAvailableSkills(role: AgentRole): readonly Skill[] {
    const mapping = findMappingForRole(role, this.mappingIndex, this.config.mappings);
    if (!mapping) {
      return [];
    }

    const allCategories = getAllCategoriesFromMapping(mapping);
    const candidateSkills = collectSkillsForCategories(this.library, allCategories);
    const sortedSkills = sortSkillsById(candidateSkills);

    return this.config.enforceRBAC ? filterSkillsByRBAC(sortedSkills, role) : sortedSkills;
  }

  /**
   * Validates a loaded skill set for consistency.
   */
  validateLoadedSet(set: LoadedSkillSet): Result<void, SkillLoaderError> {
    // Check all skills in execution order exist
    const skillIds = new Set(set.skills.map((s) => s.id));
    const missingInOrder = set.executionOrder.filter((id) => !skillIds.has(id));

    if (missingInOrder.length > 0) {
      return err(
        createLoaderError(
          'VALIDATION_ERROR',
          `Execution order contains unknown skill IDs: ${missingInOrder.join(', ')}`,
          { missingIds: missingInOrder }
        )
      );
    }

    // Check all skills are in execution order
    const orderSet = new Set(set.executionOrder);
    const missingInSkills = set.skills.filter((s) => !orderSet.has(s.id)).map((s) => s.id);

    if (missingInSkills.length > 0) {
      return err(
        createLoaderError(
          'VALIDATION_ERROR',
          `Skills not in execution order: ${missingInSkills.join(', ')}`,
          { missingIds: missingInSkills }
        )
      );
    }

    // Verify RBAC compliance if enforced
    if (this.config.enforceRBAC) {
      for (const skill of set.skills) {
        const rbac = skill.rbac ?? DEFAULT_RBAC;
        if (!canExecuteSkill(set.agentRole, rbac)) {
          return err(
            createLoaderError(
              'RBAC_DENIED',
              `Skill '${skill.id}' not authorized for role '${set.agentRole}'`,
              { skillId: skill.id, role: set.agentRole }
            )
          );
        }
      }
    }

    return ok(undefined);
  }

  private handleUnmappedRole(
    agentId: string,
    role: AgentRole
  ): Result<LoadedSkillSet, SkillLoaderError> {
    if (this.config.fallbackBehavior === 'empty') {
      return ok({
        agentId,
        agentRole: role,
        skills: [],
        executionOrder: [],
        missingRequired: [],
        loadedAt: new Date(),
      });
    }

    return err(
      createLoaderError('ROLE_NOT_MAPPED', `No skill mapping defined for role: ${role}`, { role })
    );
  }

  private checkRequiredCategories(
    skills: readonly Skill[],
    mapping: RoleSkillMapping
  ): { hasMissing: boolean; missing: string[] } {
    const presentCategories = new Set(skills.map((s) => s.category));
    const missing = identifyMissingCategories(mapping.requiredCategories, presentCategories);
    return { hasMissing: missing.length > 0, missing };
  }

  private computeSkillOrder(skills: readonly Skill[]): Result<readonly string[], SkillLoaderError> {
    if (!this.config.enforceDependencies) {
      return ok(skills.map((s) => s.id));
    }

    const orderResult = computeExecutionOrder(skills);
    if (!orderResult.ok) {
      return err(
        createLoaderError('DEPENDENCY_ERROR', orderResult.error.message, {
          code: orderResult.error.code,
          ...orderResult.error.context,
        })
      );
    }

    return ok(orderResult.value);
  }
}

/**
 * Creates a skill loader with the given library and configuration.
 */
export function createSkillLoader(
  library: SkillLibrary,
  config?: Partial<SkillLoaderConfig>,
  logger?: ILogger
): ISkillLoader {
  return new SkillLoader(library, config, logger);
}

// ============================================================================
// Integration Hooks
// ============================================================================

/** Initializes skills for an agent during agent setup. */
export function initializeAgentSkills(
  agent: IAgent,
  loader: ISkillLoader
): Result<void, SkillLoaderError> {
  const result = loader.loadForAgent(agent.id, agent.role);
  if (!result.ok) return result;

  const validation = loader.validateLoadedSet(result.value);
  if (!validation.ok) return validation;

  return ok(undefined);
}

/** Gets skills appropriate for a task execution. */
export function getSkillsForTask(
  agent: IAgent,
  task: Task,
  loader: ISkillLoader
): Result<readonly Skill[], SkillLoaderError> {
  const result = loader.loadForTask(agent.id, agent.role, task.description);
  if (!result.ok) return result;
  return ok(result.value.skills);
}
