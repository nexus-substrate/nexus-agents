/**
 * nexus-agents/agents - BaseAgent Memory Accessor Helpers
 *
 * Helper functions for memory state access in BaseAgent.
 * Extracted to reduce file size in base-agent.ts (Issue #340).
 *
 * @module agents/base-agent-memory-accessors
 */

import type { Result, ILogger } from '../core/index.js';
import type { IMemoryBackend } from '../context/memory-backend-types.js';
import type { TypedMemoryEntry } from '../context/memory-types.js';
import type {
  AgentMemoryState,
  AgentMemoryError,
  TaskLearning,
  ExecutionPattern,
  ErrorResolution,
} from './base-agent-memory-init.js';
import {
  flushMemoryState,
  copyMemoryState,
  doRecordLearning,
  doRecordPattern,
  doRecordResolution,
  doFindResolution,
  doGetLearnings,
  doGetTopPatterns,
  type MemoryOperationContext,
} from './base-agent-memory-ops.js';

/**
 * Context for memory accessor operations.
 */
export interface MemoryAccessorContext {
  memoryEnabled: boolean;
  memoryBackend: IMemoryBackend | undefined;
  memoryState: AgentMemoryState | null;
  logger: ILogger;
}

/**
 * Gets a readonly copy of the memory state.
 */
export function getMemoryStateCopy(
  state: AgentMemoryState | null
): Readonly<AgentMemoryState> | null {
  return copyMemoryState(state);
}

/**
 * Gets relevant memories (identity function, returns as-is).
 */
export function getRelevantMemoriesCopy(
  memories: readonly TypedMemoryEntry[]
): readonly TypedMemoryEntry[] {
  return memories;
}

/**
 * Flushes memory to backend.
 */
export async function flushMemory(
  ctx: MemoryAccessorContext
): Promise<Result<void, AgentMemoryError>> {
  return flushMemoryState({
    memoryEnabled: ctx.memoryEnabled,
    memoryBackend: ctx.memoryBackend,
    memoryState: ctx.memoryState,
    logger: ctx.logger,
  });
}

/**
 * Creates a memory operation context from the accessor context.
 */
export function createMemoryOpContext(ctx: MemoryAccessorContext): MemoryOperationContext {
  return {
    memoryEnabled: ctx.memoryEnabled,
    memoryState: ctx.memoryState,
  };
}

/**
 * Records a task learning and returns updated state.
 */
export function recordLearningToMemory(
  ctx: MemoryOperationContext,
  learning: Omit<TaskLearning, 'id' | 'learnedAt'>
): AgentMemoryState | null {
  return doRecordLearning(ctx, learning);
}

/**
 * Records an execution pattern and returns updated state.
 */
export function recordPatternToMemory(
  ctx: MemoryOperationContext,
  pattern: Omit<ExecutionPattern, 'id' | 'lastSeen' | 'occurrences'>
): AgentMemoryState | null {
  return doRecordPattern(ctx, pattern);
}

/**
 * Records an error resolution and returns updated state.
 */
export function recordResolutionToMemory(
  ctx: MemoryOperationContext,
  resolution: Omit<ErrorResolution, 'resolvedAt'>
): AgentMemoryState | null {
  return doRecordResolution(ctx, resolution);
}

/**
 * Finds a resolution for an error message.
 */
export function findResolution(
  ctx: MemoryOperationContext,
  errorMessage: string
): ErrorResolution | undefined {
  return doFindResolution(ctx, errorMessage);
}

/**
 * Gets task learnings by type.
 */
export function getTaskLearningsByType(
  ctx: MemoryOperationContext,
  taskType: string
): readonly TaskLearning[] {
  return doGetLearnings(ctx, taskType);
}

/**
 * Gets top execution patterns by success rate.
 */
export function getTopPatterns(
  ctx: MemoryOperationContext,
  limit: number
): readonly ExecutionPattern[] {
  return doGetTopPatterns(ctx, limit);
}
