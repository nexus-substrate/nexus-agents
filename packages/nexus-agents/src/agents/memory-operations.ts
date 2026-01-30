/**
 * nexus-agents/agents - Memory Operations
 *
 * Core memory operations for agent state persistence and retrieval.
 * Extracted from base-agent-memory-init.ts for file size compliance.
 *
 * @module agents/memory-operations
 */

import { getTimeProvider } from '../core/index.js';
import type { ILogger, AgentRole } from '../core/index.js';
import type {
  IMemoryBackend,
  MemoryMetadata,
  MemoryError,
} from '../context/memory-backend-types.js';
import type { ITypedMemory, TypedMemoryEntry } from '../context/memory-types.js';
import { MemoryImportance } from '../context/memory-backend-types.js';
import type { Result } from '../core/result.js';
import { ok, err } from '../core/result.js';
import type { AgentMemoryState } from './memory-state-types.js';
import { AgentMemoryError, createInitialMemoryState } from './memory-state-types.js';
import { getAgentStateKey } from './memory-keys.js';

/**
 * Persists agent memory state to the backend.
 */
export async function persistMemoryState(
  backend: IMemoryBackend,
  state: AgentMemoryState,
  logger: ILogger
): Promise<Result<void, AgentMemoryError>> {
  const key = getAgentStateKey(state.agentId);
  const metadata: MemoryMetadata = {
    importance: MemoryImportance.HIGH,
    tags: ['agent-state', state.role],
  };

  const updatedState: AgentMemoryState = {
    ...state,
    persistedAt: new Date(getTimeProvider().now()),
  };

  const result = await backend.store(key, updatedState, metadata);
  if (!result.ok) {
    logger.error('Failed to persist agent memory state', result.error, { agentId: state.agentId });
    return err(
      new AgentMemoryError('Failed to persist memory state', { error: result.error.message })
    );
  }

  logger.debug('Persisted agent memory state', {
    agentId: state.agentId,
    learningsCount: state.taskLearnings.length,
    patternsCount: state.executionPatterns.length,
    errorsCount: state.errorResolutions.length,
  });

  return ok(undefined);
}

/**
 * Loads agent memory state from the backend.
 */
export async function loadMemoryState(
  backend: IMemoryBackend,
  agentId: string,
  role: AgentRole,
  logger: ILogger
): Promise<Result<AgentMemoryState, AgentMemoryError>> {
  const key = getAgentStateKey(agentId);
  const result = await backend.retrieve(key);

  if (!result.ok) {
    logger.debug('No existing memory state found, creating fresh state', { agentId });
    return ok(createInitialMemoryState(agentId, role));
  }

  // Validate the loaded state shape
  const loaded = result.value as Partial<AgentMemoryState> | null;
  if (loaded === null || typeof loaded !== 'object') {
    logger.warn('Invalid memory state format, creating fresh state', { agentId });
    return ok(createInitialMemoryState(agentId, role));
  }

  // Reconstruct with defaults for any missing fields
  const state: AgentMemoryState = {
    agentId: loaded.agentId ?? agentId,
    role: loaded.role ?? role,
    persistedAt:
      loaded.persistedAt instanceof Date ? loaded.persistedAt : new Date(getTimeProvider().now()),
    taskLearnings: Array.isArray(loaded.taskLearnings) ? loaded.taskLearnings : [],
    executionPatterns: Array.isArray(loaded.executionPatterns) ? loaded.executionPatterns : [],
    errorResolutions: Array.isArray(loaded.errorResolutions) ? loaded.errorResolutions : [],
  };

  logger.debug('Loaded agent memory state', {
    agentId,
    learningsCount: state.taskLearnings.length,
    patternsCount: state.executionPatterns.length,
    errorsCount: state.errorResolutions.length,
  });

  return ok(state);
}

/**
 * Loads relevant memories from typed memory based on agent role.
 */
export async function loadRelevantTypedMemories(
  typedMemory: ITypedMemory,
  role: AgentRole,
  limit: number,
  logger: ILogger
): Promise<Result<readonly TypedMemoryEntry[], MemoryError>> {
  const result = await typedMemory.filterByRelevance(role, limit);

  if (!result.ok) {
    logger.warn('Failed to load relevant typed memories', { role, error: result.error.message });
    return result;
  }

  logger.debug('Loaded relevant typed memories', {
    role,
    count: result.value.length,
    types: [...new Set(result.value.map((e) => e.type))],
  });

  return result;
}
