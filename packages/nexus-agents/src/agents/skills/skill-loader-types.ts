/**
 * nexus-agents/agents - Skill Loader Types
 *
 * Type definitions and Zod schemas for the deterministic skill loader.
 * The skill loader provides role-based skill assignment with RBAC enforcement
 * and dependency-aware execution ordering.
 *
 * @module agents/skills/skill-loader-types
 * (Source: Issue #374 Phase 3)
 */

import { z } from 'zod';
import type { AgentRole } from '../../core/types/agent.js';
import type { Skill, SkillCategory } from './skill-types.js';

// ============================================================================
// Role Mapping Types
// ============================================================================

/**
 * Maps an agent role to its required and optional skill categories.
 * Defines which skills should be loaded for agents of a specific role.
 */
export interface RoleSkillMapping {
  /** The agent role this mapping applies to */
  readonly role: AgentRole;
  /** Categories that must be loaded for this role */
  readonly requiredCategories: readonly SkillCategory[];
  /** Categories that may be loaded if available */
  readonly optionalCategories?: readonly SkillCategory[];
  /** Maximum number of skills to load for this role (overrides default) */
  readonly maxSkills?: number;
}

/**
 * Configuration for fallback behavior when skills cannot be loaded.
 * - error: Fail the load operation with an error
 * - partial: Load whatever skills are available
 * - empty: Return an empty skill set
 */
export type FallbackBehavior = 'error' | 'partial' | 'empty';

// ============================================================================
// Loader Configuration
// ============================================================================

/**
 * Configuration for the skill loader.
 */
export interface SkillLoaderConfig {
  /** Role-to-skill category mappings */
  readonly mappings: readonly RoleSkillMapping[];
  /** Default maximum skills per agent if not specified in mapping */
  readonly defaultMaxSkills: number;
  /** Whether to enforce RBAC checks during loading */
  readonly enforceRBAC: boolean;
  /** Whether to enforce dependency ordering */
  readonly enforceDependencies: boolean;
  /** Behavior when required skills are missing */
  readonly fallbackBehavior: FallbackBehavior;
}

// ============================================================================
// Loaded Skill Set
// ============================================================================

/**
 * Represents a loaded set of skills for an agent.
 * Includes execution order based on dependencies.
 */
export interface LoadedSkillSet {
  /** ID of the agent this skill set was loaded for */
  readonly agentId: string;
  /** Role of the agent */
  readonly agentRole: AgentRole;
  /** Skills that were successfully loaded */
  readonly skills: readonly Skill[];
  /** Execution order (skill IDs) based on dependency graph */
  readonly executionOrder: readonly string[];
  /** Required skills that could not be loaded */
  readonly missingRequired: readonly string[];
  /** When the skill set was loaded */
  readonly loadedAt: Date;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error codes for skill loader failures.
 */
export type SkillLoaderErrorCode =
  | 'ROLE_NOT_MAPPED'
  | 'REQUIRED_CATEGORY_MISSING'
  | 'RBAC_DENIED'
  | 'DEPENDENCY_ERROR'
  | 'VALIDATION_ERROR'
  | 'EMPTY_RESULT';

/**
 * Skill loader error with code and context.
 */
export interface SkillLoaderError {
  readonly code: SkillLoaderErrorCode;
  readonly message: string;
  readonly context?: Record<string, unknown>;
}

// ============================================================================
// Loader Interface
// ============================================================================

/**
 * Interface for the skill loader.
 */
export interface ISkillLoader {
  /**
   * Loads skills for an agent based on their role.
   * Returns skills in dependency-aware execution order.
   *
   * @param agentId - Unique identifier of the agent
   * @param role - Role of the agent
   * @returns Result with LoadedSkillSet or SkillLoaderError
   */
  loadForAgent(
    agentId: string,
    role: AgentRole
  ): import('../../core/result.js').Result<LoadedSkillSet, SkillLoaderError>;

  /**
   * Loads skills for a specific task based on role and task description.
   * May include additional task-relevant skills beyond role defaults.
   *
   * @param agentId - Unique identifier of the agent
   * @param role - Role of the agent
   * @param taskDescription - Description of the task to execute
   * @returns Result with LoadedSkillSet or SkillLoaderError
   */
  loadForTask(
    agentId: string,
    role: AgentRole,
    taskDescription: string
  ): import('../../core/result.js').Result<LoadedSkillSet, SkillLoaderError>;

  /**
   * Gets all skills available to a specific role.
   * Does not apply per-agent limits or task filtering.
   *
   * @param role - Role to get available skills for
   * @returns Array of skills available to the role
   */
  getAvailableSkills(role: AgentRole): readonly Skill[];

  /**
   * Validates a loaded skill set for consistency.
   *
   * @param set - The loaded skill set to validate
   * @returns Result with void on success or SkillLoaderError on failure
   */
  validateLoadedSet(
    set: LoadedSkillSet
  ): import('../../core/result.js').Result<void, SkillLoaderError>;
}

// ============================================================================
// Zod Schemas
// ============================================================================

/**
 * Zod schema for SkillCategory (mirrors skill-types.ts).
 */
export const SkillCategorySchema = z.enum([
  'file-operations',
  'code-generation',
  'code-analysis',
  'testing',
  'documentation',
  'refactoring',
  'debugging',
  'deployment',
  'general',
]);

/**
 * Zod schema for AgentRole.
 */
export const AgentRoleLoaderSchema = z.enum([
  'tech_lead',
  'code_expert',
  'architecture_expert',
  'security_expert',
  'documentation_expert',
  'testing_expert',
  'thinker',
  'worker',
  'verifier',
  'custom',
]);

/**
 * Zod schema for FallbackBehavior.
 */
export const FallbackBehaviorSchema = z.enum(['error', 'partial', 'empty']);

/**
 * Zod schema for RoleSkillMapping.
 */
export const RoleSkillMappingSchema = z.object({
  role: AgentRoleLoaderSchema,
  requiredCategories: z.array(SkillCategorySchema).min(1).readonly(),
  optionalCategories: z.array(SkillCategorySchema).readonly().optional(),
  maxSkills: z.number().int().positive().optional(),
});

/**
 * Zod schema for SkillLoaderConfig.
 */
export const SkillLoaderConfigSchema = z.object({
  mappings: z.array(RoleSkillMappingSchema).readonly(),
  defaultMaxSkills: z.number().int().positive().default(50),
  enforceRBAC: z.boolean().default(true),
  enforceDependencies: z.boolean().default(true),
  fallbackBehavior: FallbackBehaviorSchema.default('error'),
});

/**
 * Zod schema for LoadedSkillSet.
 */
export const LoadedSkillSetSchema = z.object({
  agentId: z.string().min(1).max(256),
  agentRole: AgentRoleLoaderSchema,
  skills: z.array(z.any()).readonly(), // Skills are validated elsewhere
  executionOrder: z.array(z.string()).readonly(),
  missingRequired: z.array(z.string()).readonly(),
  loadedAt: z.date(),
});

/**
 * Zod schema for SkillLoaderErrorCode.
 */
export const SkillLoaderErrorCodeSchema = z.enum([
  'ROLE_NOT_MAPPED',
  'REQUIRED_CATEGORY_MISSING',
  'RBAC_DENIED',
  'DEPENDENCY_ERROR',
  'VALIDATION_ERROR',
  'EMPTY_RESULT',
]);

/**
 * Zod schema for SkillLoaderError.
 */
export const SkillLoaderErrorSchema = z.object({
  code: SkillLoaderErrorCodeSchema,
  message: z.string().min(1).max(1024),
  context: z.record(z.unknown()).optional(),
});

// ============================================================================
// Default Role Mappings
// ============================================================================

/**
 * Default role-to-skill category mappings.
 * Maps expert roles to their appropriate skill categories.
 */
export const DEFAULT_ROLE_MAPPINGS: readonly RoleSkillMapping[] = [
  {
    role: 'code_expert',
    requiredCategories: ['code-generation', 'testing', 'file-operations'],
    optionalCategories: ['refactoring', 'debugging'],
  },
  {
    role: 'security_expert',
    requiredCategories: ['code-analysis', 'file-operations'],
    optionalCategories: ['testing'],
  },
  {
    role: 'architecture_expert',
    requiredCategories: ['code-analysis', 'documentation'],
    optionalCategories: ['code-generation'],
  },
  {
    role: 'documentation_expert',
    requiredCategories: ['file-operations', 'documentation'],
    optionalCategories: ['code-generation'],
  },
  {
    role: 'testing_expert',
    requiredCategories: ['testing', 'file-operations'],
    optionalCategories: ['code-generation', 'debugging'],
  },
  {
    role: 'tech_lead',
    requiredCategories: ['general'],
    optionalCategories: ['code-generation', 'code-analysis', 'testing', 'documentation'],
    maxSkills: 100, // Tech lead needs broader access
  },
  // TRINITY roles (arXiv:2512.04695)
  {
    role: 'thinker',
    requiredCategories: ['code-analysis', 'documentation'],
    optionalCategories: ['general'],
  },
  {
    role: 'worker',
    requiredCategories: ['code-generation', 'file-operations', 'testing'],
    optionalCategories: ['refactoring', 'debugging'],
  },
  {
    role: 'verifier',
    requiredCategories: ['code-analysis', 'testing'],
    optionalCategories: ['documentation'],
  },
  {
    role: 'custom',
    requiredCategories: ['general'],
    optionalCategories: [
      'code-generation',
      'code-analysis',
      'testing',
      'file-operations',
      'documentation',
    ],
  },
] as const;

/**
 * Default skill loader configuration.
 */
export const DEFAULT_SKILL_LOADER_CONFIG: SkillLoaderConfig = {
  mappings: DEFAULT_ROLE_MAPPINGS,
  defaultMaxSkills: 50,
  enforceRBAC: true,
  enforceDependencies: true,
  fallbackBehavior: 'error',
} as const;
