/**
 * nexus-agents/config - Skills Configuration Schemas
 *
 * Zod schemas for SkillLibrary configuration.
 * Implements the Voyager skill library pattern configuration.
 *
 * @module config/schemas-skills
 * (Source: Issue #491 - Wire SkillLibrary to orchestration)
 */

import { z } from 'zod';

/**
 * SkillLibrary configuration schema.
 *
 * Maps to SkillLibraryConfig in agents/skills/skill-types.ts
 */
export const SkillLibraryConfigSchema = z.object({
  /** Whether skill library is enabled (default: true) */
  enabled: z.boolean().default(true),

  /** Maximum skills to store (default: 1000) */
  maxSkills: z.number().int().positive().default(1000),

  /** Minimum success rate to keep skill (0-1, default: 0.3) */
  minSuccessRateForRetention: z.number().min(0).max(1).default(0.3),

  /** Number of executions before evaluating retention (default: 5) */
  executionsBeforeEvaluation: z.number().int().nonnegative().default(5),

  /** Enable automatic skill pruning (default: true) */
  enablePruning: z.boolean().default(true),

  /** Whether to track detailed execution history (default: true) */
  trackExecutionHistory: z.boolean().default(true),

  /** Maximum execution history entries per skill (default: 100) */
  maxHistoryPerSkill: z.number().int().positive().default(100),
});

export type SkillLibraryConfig = z.infer<typeof SkillLibraryConfigSchema>;

/**
 * Default SkillLibrary configuration values.
 */
export const DEFAULT_SKILL_LIBRARY_CONFIG: SkillLibraryConfig = {
  enabled: true,
  maxSkills: 1000,
  minSuccessRateForRetention: 0.3,
  executionsBeforeEvaluation: 5,
  enablePruning: true,
  trackExecutionHistory: true,
  maxHistoryPerSkill: 100,
};
