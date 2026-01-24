/**
 * nexus-agents/agents - Skill Loader Integration Hooks
 *
 * Integration functions for connecting the skill loader with the agent system.
 * These hooks provide convenient wrappers for common skill loading operations
 * during agent initialization and task execution.
 *
 * @module agents/skills/skill-loader-integration
 * (Source: Issue #374 Phase 3)
 */

import type { Result } from '../../core/result.js';
import { ok } from '../../core/result.js';
import type { IAgent, Task } from '../../core/types/agent.js';
import type { Skill } from './skill-types.js';
import type { SkillLoaderError, LoadedSkillSet, ISkillLoader } from './skill-loader-types.js';

/**
 * Initializes skills for an agent during agent setup.
 *
 * Loads the appropriate skills for the agent's role and validates
 * the loaded skill set for consistency. This should be called during
 * agent initialization to ensure skills are ready for task execution.
 *
 * @param agent - The agent to initialize skills for
 * @param loader - The skill loader to use
 * @returns Result with void on success or SkillLoaderError on failure
 *
 * @example
 * ```typescript
 * const agent = createAgent({ id: 'agent-1', role: 'code_expert' });
 * const loader = createSkillLoader(library);
 *
 * const result = initializeAgentSkills(agent, loader);
 * if (!result.ok) {
 *   console.error('Failed to initialize skills:', result.error);
 * }
 * ```
 */
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

/**
 * Gets skills appropriate for a task execution.
 *
 * Loads skills based on the agent's role and the task description,
 * potentially including additional task-relevant skills beyond
 * the agent's default role-based skills.
 *
 * @param agent - The agent that will execute the task
 * @param task - The task to get skills for
 * @param loader - The skill loader to use
 * @returns Result with readonly array of skills or SkillLoaderError on failure
 *
 * @example
 * ```typescript
 * const agent = createAgent({ id: 'agent-1', role: 'code_expert' });
 * const task = { id: 'task-1', description: 'Refactor the user service' };
 * const loader = createSkillLoader(library);
 *
 * const result = getSkillsForTask(agent, task, loader);
 * if (result.ok) {
 *   console.log(`Loaded ${result.value.length} skills for task`);
 * }
 * ```
 */
export function getSkillsForTask(
  agent: IAgent,
  task: Task,
  loader: ISkillLoader
): Result<readonly Skill[], SkillLoaderError> {
  const result = loader.loadForTask(agent.id, agent.role, task.description);
  if (!result.ok) return result;
  return ok(result.value.skills);
}

/**
 * Gets the full loaded skill set for a task execution.
 *
 * Unlike `getSkillsForTask`, this returns the complete `LoadedSkillSet`
 * including execution order and missing required information.
 *
 * @param agent - The agent that will execute the task
 * @param task - The task to get skills for
 * @param loader - The skill loader to use
 * @returns Result with LoadedSkillSet or SkillLoaderError on failure
 */
export function getSkillSetForTask(
  agent: IAgent,
  task: Task,
  loader: ISkillLoader
): Result<LoadedSkillSet, SkillLoaderError> {
  return loader.loadForTask(agent.id, agent.role, task.description);
}
