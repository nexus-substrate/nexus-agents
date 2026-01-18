/**
 * nexus-agents/agents - BaseAgent Memory Helper Methods (Issue #348)
 *
 * Helper functions for memory operations in BaseAgent.
 * Extracted to reduce file size in base-agent.ts.
 */

import type { ILogger, Task, TaskResult } from '../core/index.js';
import type { IMemoryBackend } from '../context/memory-backend-types.js';
import type { Result } from '../core/result.js';
import {
  persistMemoryState,
  recordExecutionPattern,
  recordErrorResolution,
  findErrorResolution,
  getLearningsByType,
  getTopPatterns,
  categorizeTaskByKeywords,
  type AgentMemoryState,
  type AgentMemoryError,
  type TaskLearning,
  type ExecutionPattern,
  type ErrorResolution,
} from './base-agent-memory-init.js';

// ============================================================================
// Memory Operation Context
// ============================================================================

/** Context for memory operations within an agent. */
export interface MemoryOperationContext {
  memoryEnabled: boolean;
  memoryBackend: IMemoryBackend | undefined;
  logger: ILogger;
}

// ============================================================================
// Task Memory Persistence
// ============================================================================

/** Parameters for persisting memory after task completion. */
export interface PersistAfterTaskParams {
  task: Task;
  result: TaskResult;
  startTime: number;
  memoryState: AgentMemoryState;
  backend: IMemoryBackend;
  logger: ILogger;
}

/**
 * Persists memory state after successful task completion.
 * Records execution pattern and saves to backend.
 */
export async function persistMemoryAfterTaskCompletion(
  params: PersistAfterTaskParams
): Promise<AgentMemoryState> {
  const { task, startTime, memoryState, backend, logger } = params;
  const durationMs = Date.now() - startTime;

  // Record execution pattern
  const taskType = categorizeTaskByKeywords(task.description.toLowerCase());
  const updatedState = recordExecutionPattern(memoryState, {
    pattern: taskType,
    successRate: 1.0, // Task completed without error
  });

  // Persist to backend
  await persistMemoryState(backend, updatedState, logger);

  logger.debug('Memory persisted after task completion', {
    taskId: task.id,
    durationMs,
  });

  return updatedState;
}

// ============================================================================
// Error Resolution Recording
// ============================================================================

/**
 * Records a failed task error in memory for future reference.
 */
export function recordTaskFailureInMemory(
  memoryState: AgentMemoryState,
  error: unknown
): AgentMemoryState {
  return recordErrorResolution(memoryState, {
    errorPattern: String(error).slice(0, 200),
    resolution: 'Task execution failed - no resolution found',
    successful: false,
  });
}

// ============================================================================
// Memory State Operations (Re-exports with simpler signatures)
// ============================================================================

/** Flushes memory state to the backend. */
export async function flushMemoryToBackend(
  backend: IMemoryBackend,
  state: AgentMemoryState,
  logger: ILogger
): Promise<Result<void, AgentMemoryError>> {
  return persistMemoryState(backend, state, logger);
}

/** Gets a resolution for a given error from memory state. */
export function getErrorResolution(
  state: AgentMemoryState | null,
  errorMessage: string
): ErrorResolution | undefined {
  if (state === null) return undefined;
  return findErrorResolution(state, errorMessage);
}

/** Gets task learnings by type from memory state. */
export function getTaskLearningsByType(
  state: AgentMemoryState | null,
  taskType: string
): readonly TaskLearning[] {
  if (state === null) return [];
  return getLearningsByType(state, taskType);
}

/** Gets top execution patterns from memory state. */
export function getTopExecutionPatterns(
  state: AgentMemoryState | null,
  limit: number = 10
): readonly ExecutionPattern[] {
  if (state === null) return [];
  return getTopPatterns(state, limit);
}
