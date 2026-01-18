/**
 * nexus-agents/agents - BaseAgent Memory Operation Helper Functions (Issue #352)
 *
 * Helper functions for memory operations in BaseAgent.
 * Extracted to reduce file size in base-agent.ts.
 *
 * @module agents/base-agent-memory-ops
 */

import type { Result } from '../core/result.js';
import { ok } from '../core/result.js';
import type {
  AgentMemoryState,
  AgentMemoryError,
  TaskLearning,
  ExecutionPattern,
  ErrorResolution,
} from './base-agent-memory-init.js';
import {
  recordTaskLearning,
  recordExecutionPattern,
  recordErrorResolution,
  findErrorResolution,
  getLearningsByType,
  getTopPatterns,
  persistMemoryState,
} from './base-agent-memory-init.js';
import type { IMemoryBackend } from '../context/memory-backend-types.js';
import type { ILogger } from '../core/index.js';

/**
 * Parameters for memory flush operation.
 */
export interface FlushMemoryParams {
  memoryEnabled: boolean;
  memoryBackend: IMemoryBackend | undefined;
  memoryState: AgentMemoryState | null;
  logger: ILogger;
}

/**
 * Flushes memory state to backend if enabled and configured.
 * Returns ok(undefined) if memory is disabled or no state to persist.
 */
export async function flushMemoryState(
  params: FlushMemoryParams
): Promise<Result<void, AgentMemoryError>> {
  const { memoryEnabled, memoryBackend, memoryState, logger } = params;

  if (!memoryEnabled) {
    return ok(undefined);
  }

  if (memoryBackend === undefined || memoryState === null) {
    return ok(undefined);
  }

  return persistMemoryState(memoryBackend, memoryState, logger);
}

/**
 * Parameters for recording a learning.
 */
export interface RecordLearningParams {
  memoryEnabled: boolean;
  memoryState: AgentMemoryState | null;
  learning: Omit<TaskLearning, 'id' | 'learnedAt'>;
}

/**
 * Records a task learning in memory state.
 * Returns updated state or null if memory is disabled.
 */
export function recordLearningToState(params: RecordLearningParams): AgentMemoryState | null {
  const { memoryEnabled, memoryState, learning } = params;

  if (!memoryEnabled || memoryState === null) {
    return memoryState;
  }

  return recordTaskLearning(memoryState, learning);
}

/**
 * Parameters for recording a pattern.
 */
export interface RecordPatternParams {
  memoryEnabled: boolean;
  memoryState: AgentMemoryState | null;
  pattern: Omit<ExecutionPattern, 'id' | 'lastSeen' | 'occurrences'>;
}

/**
 * Records an execution pattern in memory state.
 * Returns updated state or null if memory is disabled.
 */
export function recordPatternToState(params: RecordPatternParams): AgentMemoryState | null {
  const { memoryEnabled, memoryState, pattern } = params;

  if (!memoryEnabled || memoryState === null) {
    return memoryState;
  }

  return recordExecutionPattern(memoryState, pattern);
}

/**
 * Parameters for recording a resolution.
 */
export interface RecordResolutionParams {
  memoryEnabled: boolean;
  memoryState: AgentMemoryState | null;
  resolution: Omit<ErrorResolution, 'resolvedAt'>;
}

/**
 * Records an error resolution in memory state.
 * Returns updated state or null if memory is disabled.
 */
export function recordResolutionToState(params: RecordResolutionParams): AgentMemoryState | null {
  const { memoryEnabled, memoryState, resolution } = params;

  if (!memoryEnabled || memoryState === null) {
    return memoryState;
  }

  return recordErrorResolution(memoryState, resolution);
}

/**
 * Parameters for finding an error resolution.
 */
export interface FindResolutionParams {
  memoryEnabled: boolean;
  memoryState: AgentMemoryState | null;
  errorMessage: string;
}

/**
 * Finds a resolution for a given error from memory.
 * Returns undefined if memory is disabled or no match found.
 */
export function findResolutionFromState(params: FindResolutionParams): ErrorResolution | undefined {
  const { memoryEnabled, memoryState, errorMessage } = params;

  if (!memoryEnabled || memoryState === null) {
    return undefined;
  }

  return findErrorResolution(memoryState, errorMessage);
}

/**
 * Parameters for getting task learnings.
 */
export interface GetLearningsParams {
  memoryEnabled: boolean;
  memoryState: AgentMemoryState | null;
  taskType: string;
}

/**
 * Gets task learnings filtered by type.
 * Returns empty array if memory is disabled.
 */
export function getLearningsFromState(params: GetLearningsParams): readonly TaskLearning[] {
  const { memoryEnabled, memoryState, taskType } = params;

  if (!memoryEnabled || memoryState === null) {
    return [];
  }

  return getLearningsByType(memoryState, taskType);
}

/**
 * Parameters for getting top patterns.
 */
export interface GetTopPatternsParams {
  memoryEnabled: boolean;
  memoryState: AgentMemoryState | null;
  limit: number;
}

/**
 * Gets the top execution patterns by success rate.
 * Returns empty array if memory is disabled.
 */
export function getTopPatternsFromState(params: GetTopPatternsParams): readonly ExecutionPattern[] {
  const { memoryEnabled, memoryState, limit } = params;

  if (!memoryEnabled || memoryState === null) {
    return [];
  }

  return getTopPatterns(memoryState, limit);
}

/**
 * Creates a readonly copy of agent memory state for observability.
 * Returns null if state is not initialized.
 */
export function copyMemoryState(state: AgentMemoryState | null): Readonly<AgentMemoryState> | null {
  return state !== null ? { ...state } : null;
}

/**
 * Context for memory operations that need access to agent memory state.
 */
export interface MemoryOperationContext {
  memoryEnabled: boolean;
  memoryState: AgentMemoryState | null;
}

/**
 * Records a learning and returns the updated memory state.
 */
export function doRecordLearning(
  ctx: MemoryOperationContext,
  learning: Omit<TaskLearning, 'id' | 'learnedAt'>
): AgentMemoryState | null {
  return recordLearningToState({ ...ctx, learning });
}

/**
 * Records a pattern and returns the updated memory state.
 */
export function doRecordPattern(
  ctx: MemoryOperationContext,
  pattern: Omit<ExecutionPattern, 'id' | 'lastSeen' | 'occurrences'>
): AgentMemoryState | null {
  return recordPatternToState({ ...ctx, pattern });
}

/**
 * Records a resolution and returns the updated memory state.
 */
export function doRecordResolution(
  ctx: MemoryOperationContext,
  resolution: Omit<ErrorResolution, 'resolvedAt'>
): AgentMemoryState | null {
  return recordResolutionToState({ ...ctx, resolution });
}

/**
 * Finds a resolution for an error.
 */
export function doFindResolution(
  ctx: MemoryOperationContext,
  errorMessage: string
): ErrorResolution | undefined {
  return findResolutionFromState({ ...ctx, errorMessage });
}

/**
 * Gets task learnings by type.
 */
export function doGetLearnings(
  ctx: MemoryOperationContext,
  taskType: string
): readonly TaskLearning[] {
  return getLearningsFromState({ ...ctx, taskType });
}

/**
 * Gets top execution patterns.
 */
export function doGetTopPatterns(
  ctx: MemoryOperationContext,
  limit: number
): readonly ExecutionPattern[] {
  return getTopPatternsFromState({ ...ctx, limit });
}
