/**
 * nexus-agents/agents - BaseAgent Memory Initialization (Issue #348)
 *
 * Helper module for initializing memory backend infrastructure in BaseAgent.
 * Extracted to reduce constructor complexity and file size in base-agent.ts.
 *
 * @module agents/base-agent-memory-init
 */

import type { ILogger, AgentRole } from '../core/index.js';
import type {
  IMemoryBackend,
  MemoryMetadata,
  MemoryError,
} from '../context/memory-backend-types.js';
import type {
  ITypedMemory,
  TypedMemoryEntry,
  RelevanceFilterConfig,
} from '../context/memory-types.js';
import { DEFAULT_RELEVANCE_CONFIG } from '../context/memory-types.js';
import type { Result } from '../core/result.js';
import { ok, err } from '../core/result.js';
import { MemoryImportance } from '../context/memory-backend-types.js';

// ============================================================================
// Task Categorization Helper
// ============================================================================

/** Keyword-to-category mapping for task classification. */
const TASK_CATEGORY_KEYWORDS: ReadonlyArray<readonly [string[], string]> = [
  [['test'], 'testing'],
  [['review', 'analyze'], 'review'],
  [['implement', 'create', 'build'], 'implementation'],
  [['fix', 'bug'], 'bugfix'],
  [['document', 'doc'], 'documentation'],
  [['refactor'], 'refactoring'],
];

/**
 * Categorizes a task description into a type string.
 * Uses keyword matching against a predefined lookup table.
 */
export function categorizeTaskByKeywords(description: string): string {
  for (const [keywords, category] of TASK_CATEGORY_KEYWORDS) {
    if (keywords.some((kw) => description.includes(kw))) {
      return category;
    }
  }
  return 'general';
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Memory persistence mode for automatic state saving.
 */
export const MemoryPersistenceMode = {
  /** No automatic persistence */
  NONE: 'none',
  /** Persist on task completion */
  ON_TASK_COMPLETE: 'on_task_complete',
  /** Persist on explicit flush calls only */
  MANUAL: 'manual',
} as const;

export type MemoryPersistenceMode =
  (typeof MemoryPersistenceMode)[keyof typeof MemoryPersistenceMode];

/**
 * Configuration for memory integration in BaseAgent (Issue #348).
 */
export interface AgentMemoryConfig {
  /** Whether memory integration is enabled. Default: false (opt-in). */
  enabled?: boolean;
  /** Memory backend for general storage. */
  backend?: IMemoryBackend;
  /** Typed memory for MIRIX-style 6-type architecture. */
  typedMemory?: ITypedMemory;
  /** Relevance filter configuration for role-based retrieval. */
  relevanceConfig?: RelevanceFilterConfig;
  /** Automatic persistence mode. Default: 'on_task_complete'. */
  persistenceMode?: MemoryPersistenceMode;
  /** Maximum entries to load on agent initialization. Default: 50. */
  maxInitialLoadEntries?: number;
  /** Whether to automatically load relevant memories on init. Default: true. */
  autoLoadOnInit?: boolean;
}

/**
 * Resolved memory configuration with all values defined.
 */
export interface ResolvedMemoryConfig {
  enabled: boolean;
  backend: IMemoryBackend | undefined;
  typedMemory: ITypedMemory | undefined;
  relevanceConfig: RelevanceFilterConfig;
  persistenceMode: MemoryPersistenceMode;
  maxInitialLoadEntries: number;
  autoLoadOnInit: boolean;
}

/**
 * Default memory configuration values.
 */
export const DEFAULT_MEMORY_CONFIG: ResolvedMemoryConfig = {
  enabled: false,
  backend: undefined,
  typedMemory: undefined,
  relevanceConfig: DEFAULT_RELEVANCE_CONFIG,
  persistenceMode: MemoryPersistenceMode.ON_TASK_COMPLETE,
  maxInitialLoadEntries: 50,
  autoLoadOnInit: true,
};

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

// ============================================================================
// Resolution and Initialization
// ============================================================================

/**
 * Resolves memory configuration with defaults.
 */
export function resolveMemoryConfig(config?: AgentMemoryConfig): ResolvedMemoryConfig {
  if (config === undefined) {
    return { ...DEFAULT_MEMORY_CONFIG };
  }

  return {
    enabled: config.enabled ?? DEFAULT_MEMORY_CONFIG.enabled,
    backend: config.backend ?? DEFAULT_MEMORY_CONFIG.backend,
    typedMemory: config.typedMemory ?? DEFAULT_MEMORY_CONFIG.typedMemory,
    relevanceConfig: config.relevanceConfig ?? DEFAULT_MEMORY_CONFIG.relevanceConfig,
    persistenceMode: config.persistenceMode ?? DEFAULT_MEMORY_CONFIG.persistenceMode,
    maxInitialLoadEntries:
      config.maxInitialLoadEntries ?? DEFAULT_MEMORY_CONFIG.maxInitialLoadEntries,
    autoLoadOnInit: config.autoLoadOnInit ?? DEFAULT_MEMORY_CONFIG.autoLoadOnInit,
  };
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

/**
 * Initializes memory infrastructure for BaseAgent.
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

// ============================================================================
// Memory Operations
// ============================================================================

/**
 * Generates a memory key for agent state persistence.
 */
export function getAgentStateKey(agentId: string): string {
  return `agent:state:${agentId}`;
}

/**
 * Generates a memory key for task learnings.
 */
export function getTaskLearningKey(agentId: string, learningId: string): string {
  return `agent:learning:${agentId}:${learningId}`;
}

/**
 * Generates a memory key for execution patterns.
 */
export function getPatternKey(agentId: string, patternId: string): string {
  return `agent:pattern:${agentId}:${patternId}`;
}

/**
 * Generates a memory key for error resolutions.
 */
export function getErrorResolutionKey(agentId: string, errorPattern: string): string {
  const sanitized = errorPattern.replace(/[^a-zA-Z0-9-]/g, '_').slice(0, 64);
  return `agent:error:${agentId}:${sanitized}`;
}

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
    persistedAt: new Date(),
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
    persistedAt: loaded.persistedAt instanceof Date ? loaded.persistedAt : new Date(),
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

/**
 * Records a task learning in memory state.
 */
export function recordTaskLearning(
  state: AgentMemoryState,
  learning: Omit<TaskLearning, 'id' | 'learnedAt'>
): AgentMemoryState {
  const newLearning: TaskLearning = {
    ...learning,
    id: `learn_${String(Date.now())}_${Math.random().toString(36).slice(2, 8)}`,
    learnedAt: new Date(),
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
      lastSeen: new Date(),
    };

    return {
      ...state,
      executionPatterns: state.executionPatterns.map((p) => (p.id === existing.id ? updated : p)),
    };
  }

  // Create new pattern
  const newPattern: ExecutionPattern = {
    id: `pattern_${String(Date.now())}_${Math.random().toString(36).slice(2, 8)}`,
    pattern: pattern.pattern,
    successRate: pattern.successRate,
    occurrences: pattern.occurrences ?? 1,
    lastSeen: new Date(),
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
    resolvedAt: new Date(),
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
