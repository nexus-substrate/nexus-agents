/**
 * nexus-agents/agents - Skill Library Helpers
 *
 * Helper functions for skill library operations.
 *
 * @module agents/skills/skill-helpers
 * (Source: arXiv:2305.16291, Issue #150)
 */

import { getTimeProvider } from '../../core/index.js';
import type {
  Skill,
  SkillExecution,
  SkillExecutionStatus,
  CreateSkillOptions,
  SkillMetrics,
  SkillWithMetrics,
  SkillComplexity,
  LibraryStatistics,
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
    startTime: new Date(getTimeProvider().now()),
    endTime: new Date(getTimeProvider().now()),
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
    updatedAt: new Date(getTimeProvider().now()),
    version: existing.version + 1,
  };
}

/**
 * Creates initial metrics for a new skill.
 */
export function createInitialMetrics(): SkillMetrics {
  return {
    executionCount: 0,
    successCount: 0,
    avgExecutionTimeMs: 0,
    successRate: 0,
  };
}

/**
 * Calculates updated metrics after an execution.
 */
export function calculateUpdatedMetrics(
  current: SkillMetrics,
  execution: SkillExecution
): SkillMetrics {
  const executionTime = execution.endTime.getTime() - execution.startTime.getTime();
  const isSuccess = execution.status === 'success';

  const newCount = current.executionCount + 1;
  const newSuccessCount = current.successCount + (isSuccess ? 1 : 0);
  const newAvgTime =
    (current.avgExecutionTimeMs * current.executionCount + executionTime) / newCount;

  return {
    executionCount: newCount,
    successCount: newSuccessCount,
    avgExecutionTimeMs: newAvgTime,
    successRate: newSuccessCount / newCount,
    lastExecutedAt: execution.endTime,
  };
}

/**
 * Adds metrics to a skill.
 */
export function addMetricsToSkill(
  skill: Skill,
  metrics: SkillMetrics | undefined
): SkillWithMetrics {
  const defaultMetrics: SkillMetrics = {
    executionCount: 0,
    successCount: 0,
    avgExecutionTimeMs: 0,
    successRate: 0,
  };
  return { ...skill, metrics: metrics ?? defaultMetrics };
}

/**
 * Sorts skills by the specified criteria.
 */
export function sortSkillsByCriteria(
  skills: SkillWithMetrics[],
  sortBy: 'name' | 'successRate' | 'executionCount' | 'createdAt',
  sortOrder: 'asc' | 'desc'
): SkillWithMetrics[] {
  const multiplier = sortOrder === 'asc' ? 1 : -1;

  return skills.sort((a, b) => {
    switch (sortBy) {
      case 'name':
        return multiplier * a.name.localeCompare(b.name);
      case 'successRate':
        return multiplier * (a.metrics.successRate - b.metrics.successRate);
      case 'executionCount':
        return multiplier * (a.metrics.executionCount - b.metrics.executionCount);
      case 'createdAt':
        return multiplier * (a.createdAt.getTime() - b.createdAt.getTime());
      default:
        return 0;
    }
  });
}

/**
 * Calculates library statistics from skills and metrics.
 */
export function calculateLibraryStatistics(
  skills: readonly Skill[],
  metrics: readonly SkillMetrics[]
): LibraryStatistics {
  const byCategory = new Map<string, number>();
  const byComplexity = new Map<SkillComplexity, number>();

  for (const skill of skills) {
    byCategory.set(skill.category, (byCategory.get(skill.category) ?? 0) + 1);
    byComplexity.set(skill.complexity, (byComplexity.get(skill.complexity) ?? 0) + 1);
  }

  const totalExecutions = metrics.reduce((sum, m) => sum + m.executionCount, 0);
  const totalSuccesses = metrics.reduce((sum, m) => sum + m.successCount, 0);

  return {
    totalSkills: skills.length,
    totalExecutions,
    overallSuccessRate: totalExecutions > 0 ? totalSuccesses / totalExecutions : 0,
    skillsByCategory: Object.fromEntries(byCategory),
    skillsByComplexity: Object.fromEntries(byComplexity),
  };
}

/**
 * Finds the lowest performing skill ID.
 */
export function findLowestPerformingSkillId(
  metricsMap: Map<string, SkillMetrics>,
  minExecutions: number
): string | undefined {
  let lowestId: string | undefined;
  let lowestScore = Infinity;

  for (const [skillId, metrics] of metricsMap.entries()) {
    if (metrics.executionCount >= minExecutions) {
      if (metrics.successRate < lowestScore) {
        lowestScore = metrics.successRate;
        lowestId = skillId;
      }
    }
  }

  return lowestId;
}
