/**
 * nexus-agents/agents - Skill Library Helpers
 *
 * Helper functions for skill library operations.
 *
 * @module agents/skills/skill-helpers
 * (Source: arXiv:2305.16291, Issue #150)
 */

import type {
  Skill,
  SkillExecution,
  SkillExecutionStatus,
  CreateSkillOptions,
} from './skill-types.js';

/**
 * Options for recording an execution.
 */
export interface RecordExecutionOptions {
  readonly skillId: string;
  readonly status: SkillExecutionStatus;
  readonly input: Record<string, unknown>;
  readonly output?: string;
  readonly errorMessage?: string;
  readonly context?: string;
}

/**
 * Creates an execution record from options.
 */
export function createExecutionRecord(options: RecordExecutionOptions): SkillExecution {
  return {
    skillId: options.skillId,
    startTime: new Date(),
    endTime: new Date(),
    status: options.status,
    input: options.input,
    ...(options.output !== undefined && { output: options.output }),
    ...(options.errorMessage !== undefined && { errorMessage: options.errorMessage }),
    ...(options.context !== undefined && { context: options.context }),
  };
}

/**
 * Builds core update fields for a skill.
 */
function buildCoreFields(updates: Partial<CreateSkillOptions>): Partial<Skill> {
  return {
    ...(updates.name !== undefined && { name: updates.name }),
    ...(updates.description !== undefined && { description: updates.description }),
    ...(updates.category !== undefined && { category: updates.category }),
    ...(updates.complexity !== undefined && { complexity: updates.complexity }),
    ...(updates.code !== undefined && { code: updates.code }),
  };
}

/**
 * Builds extended update fields for a skill.
 */
function buildExtendedFields(updates: Partial<CreateSkillOptions>): Partial<Skill> {
  return {
    ...(updates.parameters !== undefined && { parameters: updates.parameters }),
    ...(updates.outputType !== undefined && { outputType: updates.outputType }),
    ...(updates.dependencies !== undefined && { dependencies: updates.dependencies }),
    ...(updates.tags !== undefined && { tags: updates.tags }),
    ...(updates.examples !== undefined && { examples: updates.examples }),
  };
}

/**
 * Builds update fields for a skill.
 */
export function buildSkillUpdateFields(updates: Partial<CreateSkillOptions>): Partial<Skill> {
  return {
    ...buildCoreFields(updates),
    ...buildExtendedFields(updates),
  };
}

/**
 * Applies updates to a skill.
 */
export function applySkillUpdates(existing: Skill, updates: Partial<CreateSkillOptions>): Skill {
  return {
    ...existing,
    ...buildSkillUpdateFields(updates),
    updatedAt: new Date(),
    version: existing.version + 1,
  };
}
