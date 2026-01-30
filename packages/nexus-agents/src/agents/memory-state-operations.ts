/**
 * nexus-agents/agents - Memory State Operations
 *
 * Functions for manipulating agent memory state (learnings, patterns, errors).
 * Extracted from base-agent-memory-init.ts for file size compliance.
 *
 * @module agents/memory-state-operations
 */

import { getRandomProvider, getTimeProvider } from '../core/index.js';
import type {
  AgentMemoryState,
  TaskLearning,
  ExecutionPattern,
  ErrorResolution,
} from './memory-state-types.js';

/**
 * Records a task learning in memory state.
 */
export function recordTaskLearning(
  state: AgentMemoryState,
  learning: Omit<TaskLearning, 'id' | 'learnedAt'>
): AgentMemoryState {
  const time = getTimeProvider();
  const random = getRandomProvider();
  const newLearning: TaskLearning = {
    ...learning,
    id: `learn_${String(time.now())}_${random.random().toString(36).slice(2, 8)}`,
    learnedAt: new Date(getTimeProvider().now()),
  };

  return {
    ...state,
    taskLearnings: [...state.taskLearnings, newLearning],
  };
}

/**
 * Records or updates an execution pattern in memory state.
 */
export function recordExecutionPattern(
  state: AgentMemoryState,
  pattern: Omit<ExecutionPattern, 'id' | 'lastSeen' | 'occurrences'> & { occurrences?: number }
): AgentMemoryState {
  const existing = state.executionPatterns.find((p) => p.pattern === pattern.pattern);

  if (existing !== undefined) {
    // Update existing pattern
    const updated: ExecutionPattern = {
      ...existing,
      successRate:
        (existing.successRate * existing.occurrences + pattern.successRate) /
        (existing.occurrences + 1),
      occurrences: existing.occurrences + 1,
      lastSeen: new Date(getTimeProvider().now()),
    };

    return {
      ...state,
      executionPatterns: state.executionPatterns.map((p) => (p.id === existing.id ? updated : p)),
    };
  }

  // Create new pattern
  const time = getTimeProvider();
  const random = getRandomProvider();
  const newPattern: ExecutionPattern = {
    id: `pattern_${String(time.now())}_${random.random().toString(36).slice(2, 8)}`,
    pattern: pattern.pattern,
    successRate: pattern.successRate,
    occurrences: pattern.occurrences ?? 1,
    lastSeen: new Date(getTimeProvider().now()),
  };

  return {
    ...state,
    executionPatterns: [...state.executionPatterns, newPattern],
  };
}

/**
 * Records an error resolution in memory state.
 */
export function recordErrorResolution(
  state: AgentMemoryState,
  resolution: Omit<ErrorResolution, 'resolvedAt'>
): AgentMemoryState {
  const newResolution: ErrorResolution = {
    ...resolution,
    resolvedAt: new Date(getTimeProvider().now()),
  };

  // Replace existing resolution for same error pattern if exists
  const existingIndex = state.errorResolutions.findIndex(
    (r) => r.errorPattern === resolution.errorPattern
  );

  if (existingIndex >= 0) {
    const updatedResolutions = [...state.errorResolutions];
    updatedResolutions[existingIndex] = newResolution;
    return {
      ...state,
      errorResolutions: updatedResolutions,
    };
  }

  return {
    ...state,
    errorResolutions: [...state.errorResolutions, newResolution],
  };
}

/**
 * Searches for error resolutions matching a given error.
 */
export function findErrorResolution(
  state: AgentMemoryState,
  errorMessage: string
): ErrorResolution | undefined {
  // Simple substring matching - could be enhanced with fuzzy matching
  return state.errorResolutions.find(
    (r) => r.successful && errorMessage.toLowerCase().includes(r.errorPattern.toLowerCase())
  );
}

/**
 * Gets task learnings by type, sorted by confidence.
 */
export function getLearningsByType(
  state: AgentMemoryState,
  taskType: string
): readonly TaskLearning[] {
  return state.taskLearnings
    .filter((l) => l.taskType === taskType)
    .sort((a, b) => b.confidence - a.confidence);
}

/**
 * Gets the most successful execution patterns.
 */
export function getTopPatterns(
  state: AgentMemoryState,
  limit: number = 10
): readonly ExecutionPattern[] {
  return [...state.executionPatterns].sort((a, b) => b.successRate - a.successRate).slice(0, limit);
}
