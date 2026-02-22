/**
 * Type definitions for the Task Specialization Matrix.
 *
 * Maps high-level task categories to preferred CLI tools based on
 * model strengths, inspired by StrongDM's Weather Report approach.
 *
 * @module config/task-specialization-types
 * (Source: Issue #858 — Multi-model task specialization)
 */

import { z } from 'zod';
import type { CliNameLiteral } from './model-capabilities-types.js';

/**
 * High-level task categories for CLI specialization routing.
 */
export const TASK_CATEGORIES = [
  'architecture',
  'code_generation',
  'code_review',
  'research',
  'security_review',
  'planning',
  'documentation',
  'testing',
  'devops',
  'exploration',
] as const;

export const TaskCategorySchema = z.enum(TASK_CATEGORIES);
export type TaskCategory = z.infer<typeof TaskCategorySchema>;

/**
 * A single task specialization entry mapping a category to CLI preferences.
 */
export const TaskSpecializationSchema = z.object({
  /** Task category identifier */
  category: TaskCategorySchema,
  /** Primary CLI recommendation */
  primaryCli: z.enum(['claude', 'gemini', 'codex', 'opencode']),
  /** Secondary CLI fallback */
  secondaryCli: z.enum(['claude', 'gemini', 'codex', 'opencode']),
  /** Why this CLI is preferred for this task type */
  reasoning: z.string(),
  /** Keywords that trigger this category detection */
  keywords: z.array(z.string()).min(1),
  /** Bonus score applied when this category matches (0-20) */
  bonus: z.number().min(0).max(20),
});

export type TaskSpecialization = z.infer<typeof TaskSpecializationSchema>;

/**
 * Result of looking up a task's specialization.
 */
export interface SpecializationMatch {
  /** Matched category */
  readonly category: TaskCategory;
  /** Recommended primary CLI */
  readonly primaryCli: CliNameLiteral;
  /** Fallback CLI */
  readonly secondaryCli: CliNameLiteral;
  /** Score bonus for the preferred model */
  readonly bonus: number;
}
