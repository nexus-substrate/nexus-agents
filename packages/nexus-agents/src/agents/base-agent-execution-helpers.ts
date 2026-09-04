/**
 * nexus-agents/agents - BaseAgent Execution Helper Functions (Issue #352)
 *
 * Helper functions for task execution in BaseAgent.
 * Extracted to reduce file size in base-agent.ts.
 *
 * @module agents/base-agent-execution-helpers
 */

import type { ILogger, Task, AgentRole } from '../core/index.js';
import { getTimeProvider } from '../core/index.js';
import type { IContextMemoryBackend } from '../context/memory-backend-types.js';
import type { AgentMemoryState, MemoryPersistenceMode } from './base-agent-memory-init.js';
import {
  persistMemoryState,
  recordExecutionPattern,
  recordErrorResolution,
  categorizeTaskByKeywords,
} from './base-agent-memory-init.js';

/**
 * Parameters for recording a failed task error in memory.
 */
export interface RecordFailedTaskParams {
  memoryEnabled: boolean;
  memoryState: AgentMemoryState | null;
  error: unknown;
}

/**
 * Records a failed task error in memory for future reference.
 * Returns updated memory state or null if memory is disabled.
 */
export function recordFailedTaskError(params: RecordFailedTaskParams): AgentMemoryState | null {
  const { memoryEnabled, memoryState, error } = params;

  if (!memoryEnabled || memoryState === null) {
    return memoryState;
  }

  return recordErrorResolution(memoryState, {
    errorPattern: String(error).slice(0, 200),
    resolution: 'Task execution failed - no resolution found',
    successful: false,
  });
}

/**
 * Parameters for persisting memory after task completion.
 */
export interface PersistMemoryAfterTaskParams {
  memoryEnabled: boolean;
  memoryBackend: IContextMemoryBackend | undefined;
  memoryState: AgentMemoryState | null;
  persistenceMode: MemoryPersistenceMode;
  task: Task;
  startTime: number;
  logger: ILogger;
}

/**
 * Persists memory state after successful task completion.
 * Updates execution pattern and persists to backend.
 */
export async function persistMemoryAfterTask(
  params: PersistMemoryAfterTaskParams
): Promise<AgentMemoryState | null> {
  const { memoryEnabled, memoryBackend, memoryState, persistenceMode, task, startTime, logger } =
    params;

  if (!memoryEnabled || memoryState === null) {
    return memoryState;
  }

  if (persistenceMode !== 'on_task_complete') {
    return memoryState;
  }

  const durationMs = getTimeProvider().now() - startTime;
  const taskType = categorizeTaskType(task.description);

  // Record execution pattern
  const updatedState = recordExecutionPattern(memoryState, {
    pattern: taskType,
  });

  // Persist to backend if available
  if (memoryBackend !== undefined) {
    await persistMemoryState(memoryBackend, updatedState, logger);
  }

  logger.debug('Memory persisted after task completion', {
    taskId: task.id,
    durationMs,
  });

  return updatedState;
}

/**
 * Categorizes a task into a type string for pattern tracking.
 */
export function categorizeTaskType(description: string): string {
  const desc = description.toLowerCase();
  return categorizeTaskByKeywords(desc);
}

/**
 * Parameters for loading memory on initialization.
 */
export interface LoadMemoryOnInitParams {
  memoryBackend: IContextMemoryBackend | undefined;
  agentId: string;
  role: AgentRole;
  logger: ILogger;
}

/**
 * Result of memory initialization loading.
 */
export interface LoadMemoryOnInitResult {
  stateLoaded: boolean;
}

/**
 * Parameters for cleanup with memory persistence.
 */
export interface CleanupWithMemoryParams {
  memoryEnabled: boolean;
  memoryBackend: IContextMemoryBackend | undefined;
  memoryState: AgentMemoryState | null;
  persistenceMode: MemoryPersistenceMode;
  logger: ILogger;
}

/**
 * Persists memory state during cleanup if configured.
 */
export async function persistMemoryOnCleanup(params: CleanupWithMemoryParams): Promise<void> {
  const { memoryEnabled, memoryBackend, memoryState, persistenceMode, logger } = params;

  if (!memoryEnabled || memoryBackend === undefined || memoryState === null) {
    return;
  }

  if (persistenceMode === 'none') {
    return;
  }

  await persistMemoryState(memoryBackend, memoryState, logger);
  logger.debug('Memory state persisted during cleanup');
}
