/**
 * nexus-agents/agents - Skills Module
 *
 * Voyager-style skill library for storing, retrieving, and composing
 * executable code skills with automatic curriculum learning.
 *
 * @module agents/skills
 * (Source: arXiv:2305.16291, Issue #150)
 */

// Security Types and Utilities (Issue #374)
export type {
  SkillPermission,
  SkillCapabilities,
  SkillRBAC,
  SkillProvenance,
  SkillAttestation,
  AuthorizationMethod,
  SecurityErrorCode,
  SkillSecurityError,
} from './skill-security.js';

export {
  // Constants
  SKILL_PERMISSIONS,
  DEFAULT_PERMISSIONS,
  MAX_EXECUTION_TIME_MS,
  DEFAULT_EXECUTION_TIME_MS,
  DEFAULT_CAPABILITIES,
  DEFAULT_RBAC,
  // Zod Schemas
  SkillPermissionSchema,
  AgentRoleSchema,
  SkillCapabilitiesSchema,
  SkillRBACSchema,
  SkillProvenanceSchema,
  AuthorizationMethodSchema,
  SkillAttestationSchema,
  SecurityErrorCodeSchema,
  SkillSecurityErrorSchema,
  // Helper Functions
  canExecuteSkill,
  createAttestation,
  validateSkillProvenance,
  checkPermissionBoundary,
  createSecurityError,
  validateCapabilities,
  validateRBAC,
  validateSkillExecution,
} from './skill-security.js';

// Types
export type {
  Skill,
  SkillWithMetrics,
  SkillParameter,
  SkillExample,
  SkillExecution,
  SkillMetrics,
  SkillQuery,
  SkillSearchResult,
  CreateSkillOptions,
  SkillCompositionRequest,
  SkillComposition,
  CompositionStep,
  InputBinding,
  SkillLibraryConfig,
  SkillComplexity,
  SkillExecutionStatus,
  SkillCategory,
  LibraryStatistics,
  SkillStore,
} from './skill-types.js';

export { DEFAULT_SKILL_LIBRARY_CONFIG, COMPLEXITY_ORDER } from './skill-types.js';

// Helpers (for advanced usage)
export type { RecordExecutionOptions } from './skill-helpers.js';

// Skill Library
export { SkillLibrary, createSkillLibrary } from './skill-library.js';

// Skill Composer
export {
  SkillComposer,
  createSkillComposer,
  DEFAULT_COMPOSER_CONFIG,
  type SkillComposerConfig,
  type CompositionValidation,
} from './skill-composer.js';

// Dependency Graph (Issue #374 Phase 2)
export type {
  SkillDependency,
  SkillDependencyType,
  DependencyError,
  DependencyErrorCode,
  ISkillDependencyGraph,
} from './skill-dependency-graph.js';

export {
  // Class
  SkillDependencyGraph,
  // Zod Schemas
  SkillDependencyTypeSchema,
  SkillDependencySchema,
  DependencyErrorCodeSchema,
  DependencyErrorSchema,
  // Helper Functions
  createDependencyError,
  buildDependencyGraph,
  resolveWithFallbacks,
  findMissingDependencies,
  createSkillDependencyGraph,
} from './skill-dependency-graph.js';
