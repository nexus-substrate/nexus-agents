/**
 * nexus-agents/agents - BaseAgent Memory Initialization (Issue #348)
 *
 * Helper module for initializing memory backend infrastructure in BaseAgent.
 * Extracted to reduce constructor complexity and file size in base-agent.ts.
 *
 * This module re-exports types and functions from split modules for backward
 * compatibility with existing imports.
 *
 * @module agents/base-agent-memory-init
 */

import type { MemoryInfrastructure, MemoryInitOptions } from './memory-state-types.js';
import { createInitialMemoryState } from './memory-state-types.js';
import { resolveMemoryConfig } from './memory-config-types.js';

// ============================================================================
// Re-exports for backward compatibility
// ============================================================================

// Configuration types and constants
export {
  MemoryPersistenceMode,
  type AgentMemoryConfig,
  type ResolvedMemoryConfig,
  DEFAULT_MEMORY_CONFIG,
  resolveMemoryConfig,
  categorizeTaskByKeywords,
} from './memory-config-types.js';

// State types
export {
  type AgentMemoryState,
  type TaskLearning,
  type ExecutionPattern,
  type ErrorResolution,
  type MemoryInfrastructure,
  type MemoryInitOptions,
  AgentMemoryError,
  createInitialMemoryState,
} from './memory-state-types.js';

// Key generation functions
export {
  getAgentStateKey,
  getTaskLearningKey,
  getPatternKey,
  getErrorResolutionKey,
} from './memory-keys.js';

// Memory operations
export {
  persistMemoryState,
  loadMemoryState,
  loadRelevantTypedMemories,
} from './memory-operations.js';

// State manipulation functions
export {
  recordTaskLearning,
  recordExecutionPattern,
  recordErrorResolution,
  findErrorResolution,
  getLearningsByType,
} from './memory-state-operations.js';

// ============================================================================
// Initialization Function
// ============================================================================

/**
 * Initializes memory infrastructure for BaseAgent.
 *
 * This is the main entry point for setting up memory in BaseAgent.
 * It resolves configuration, validates backend availability, and creates
 * initial state.
 */
export function initializeMemoryInfrastructure(options: MemoryInitOptions): MemoryInfrastructure {
  const config = resolveMemoryConfig(options.config);

  // Check if memory should be enabled
  const hasBackend = config.backend !== undefined || config.typedMemory !== undefined;
  const memoryEnabled = config.enabled && hasBackend;

  if (!memoryEnabled) {
    if (config.enabled && !hasBackend) {
      options.logger.warn('Memory enabled but no backend provided', { agentId: options.agentId });
    }
    return {
      config,
      memoryEnabled: false,
      state: null,
    };
  }

  options.logger.info('Memory integration enabled', {
    agentId: options.agentId,
    hasBackend: config.backend !== undefined,
    hasTypedMemory: config.typedMemory !== undefined,
    persistenceMode: config.persistenceMode,
    autoLoadOnInit: config.autoLoadOnInit,
  });

  return {
    config,
    memoryEnabled: true,
    state: createInitialMemoryState(options.agentId, options.role),
  };
}
