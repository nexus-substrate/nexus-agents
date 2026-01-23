/**
 * nexus-agents/agents - Skills Module Exports
 *
 * Re-exports for Voyager-pattern skill library.
 */

// Skill library (Voyager pattern)
export {
  // Types
  type Skill,
  type SkillWithMetrics,
  type SkillParameter,
  type SkillExample,
  type SkillExecution,
  type SkillMetrics,
  type SkillQuery,
  type SkillSearchResult,
  type CreateSkillOptions,
  type SkillCompositionRequest,
  type SkillComposition,
  type CompositionStep,
  type InputBinding,
  type SkillLibraryConfig,
  type SkillComplexity,
  type SkillExecutionStatus,
  type SkillCategory,
  type LibraryStatistics,
  type SkillComposerConfig,
  type CompositionValidation,
  // Constants
  DEFAULT_SKILL_LIBRARY_CONFIG,
  COMPLEXITY_ORDER,
  DEFAULT_COMPOSER_CONFIG,
  // Classes and factories
  SkillLibrary,
  createSkillLibrary,
  SkillComposer,
  createSkillComposer,
} from './skills/index.js';
