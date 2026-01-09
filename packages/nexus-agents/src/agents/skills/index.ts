/**
 * nexus-agents/agents - Skills Module
 *
 * Voyager-style skill library for storing, retrieving, and composing
 * executable code skills with automatic curriculum learning.
 *
 * @module agents/skills
 * (Source: arXiv:2305.16291, Issue #150)
 */

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
