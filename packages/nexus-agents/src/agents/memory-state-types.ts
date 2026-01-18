/**
 * nexus-agents/agents - Memory State Types
 *
 * Types for agent memory state, learnings, patterns, and error resolutions.
 * Extracted from base-agent-memory-init.ts for file size compliance.
 *
 * @module agents/memory-state-types
 */

import type { ILogger, AgentRole } from '../core/index.js';
import type { AgentMemoryConfig, ResolvedMemoryConfig } from './memory-config-types.js';

// ============================================================================
// Memory State Types
// ============================================================================

/**
 * Serializable agent memory state for persistence.
 */
export interface AgentMemoryState {
  /** Agent ID that owns this state */
  agentId: string;
  /** Agent role for relevance filtering */
  role: AgentRole;
  /** Timestamp of last persistence */
  persistedAt: Date;
  /** Task learnings to persist */
  taskLearnings: TaskLearning[];
  /** Execution patterns observed */
  executionPatterns: ExecutionPattern[];
  /** Error resolutions for future reference */
  errorResolutions: ErrorResolution[];
}

/**
 * A learning captured from task execution.
 */
export interface TaskLearning {
  /** Unique identifier */
  id: string;
  /** Task type or category */
  taskType: string;
  /** What was learned */
  insight: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** When this was learned */
  learnedAt: Date;
  /** Context in which it was learned */
  context?: string;
}

/**
 * An observed execution pattern.
 */
export interface ExecutionPattern {
  /** Pattern identifier */
  id: string;
  /** Pattern description */
  pattern: string;
  /** Success rate when this pattern is applied */
  successRate: number;
  /** Number of times observed */
  occurrences: number;
  /** Last observed timestamp */
  lastSeen: Date;
}

/**
 * Resolution for a previously encountered error.
 */
export interface ErrorResolution {
  /** Error signature or pattern */
  errorPattern: string;
  /** How it was resolved */
  resolution: string;
  /** Whether the resolution was successful */
  successful: boolean;
  /** When this resolution was recorded */
  resolvedAt: Date;
}

// ============================================================================
// Memory Infrastructure
// ============================================================================

/**
 * Memory infrastructure created during initialization.
 */
export interface MemoryInfrastructure {
  config: ResolvedMemoryConfig;
  memoryEnabled: boolean;
  state: AgentMemoryState | null;
}

/**
 * Options for initializing memory infrastructure.
 */
export interface MemoryInitOptions {
  agentId: string;
  role: AgentRole;
  config?: AgentMemoryConfig;
  logger: ILogger;
}

/**
 * Memory operation error.
 */
export class AgentMemoryError extends Error {
  constructor(
    message: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AgentMemoryError';
  }
}

/**
 * Creates initial empty memory state for an agent.
 */
export function createInitialMemoryState(agentId: string, role: AgentRole): AgentMemoryState {
  return {
    agentId,
    role,
    persistedAt: new Date(),
    taskLearnings: [],
    executionPatterns: [],
    errorResolutions: [],
  };
}
