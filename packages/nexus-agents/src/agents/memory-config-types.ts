/**
 * nexus-agents/agents - Memory Configuration Types
 *
 * Configuration types and constants for agent memory integration.
 * Extracted from base-agent-memory-init.ts for file size compliance.
 *
 * @module agents/memory-config-types
 */

import type { IMemoryBackend } from '../context/memory-backend-types.js';
import type { ITypedMemory, RelevanceFilterConfig } from '../context/memory-types.js';
import { DEFAULT_RELEVANCE_CONFIG } from '../context/memory-types.js';

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
