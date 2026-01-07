/**
 * nexus-agents/context
 *
 * Context management utilities including token counting, context budgeting,
 * and work balancing for multi-agent orchestration.
 *
 * (Source: cli-project_plan.md v2.1.0, Phase 4)
 */

// Token counting
export {
  TokenCounter,
  createTokenCounter,
  TokenCounterProvider,
  TokenCountError,
  type ITokenCounter,
  type TokenCounterConfig,
  type TokenCountResult,
} from './token-counter.js';

// Work balancer
export {
  WorkBalancer,
  createWorkBalancer,
  createTaskProfile,
  capacityStatusToInfo,
  BalancingError,
} from './work-balancer.js';

export type {
  IWorkBalancer,
  TaskProfile,
  CapacityInfo,
  QueuedTask,
  BalancerOptions,
  ScoreBreakdown,
  BalanceResult,
  BalancingErrorCode,
} from './work-balancer.js';

// Memory Backend
export {
  HybridMemoryBackend,
  MemoryImportance,
  MemoryError,
  MemoryMetadataSchema,
  MemoryEntrySchema,
  MemoryImportanceSchema,
  HybridMemoryConfigSchema,
} from './memory-backend.js';

export type {
  IMemoryBackend,
  MemoryMetadata,
  MemoryEntry,
  HybridMemoryConfig,
  ISQLiteDatabase,
  ISQLiteStatement,
} from './memory-backend.js';

// Typed Memory Architecture (Issue #101)
export { TypedMemory, createTypedMemory } from './typed-memory.js';
export { MemoryType, MemoryTypeSchema, DEFAULT_RELEVANCE_CONFIG } from './memory-types.js';
export { CoreMemoryDataSchema, EpisodeDataSchema, SemanticFactSchema } from './memory-types.js';
export {
  ProcedureSchema,
  ProcedureStepSchema,
  ResourceReferenceSchema,
  VaultEntrySchema,
} from './memory-types.js';

export type {
  ITypedMemory,
  ICoreMemory,
  IEpisodicMemory,
  ISemanticMemory,
  IProceduralMemory,
  IResourceMemory,
  IKnowledgeVault,
  TypedMemoryEntry,
  TypedMemoryStats,
  TypedMemoryPruneResult,
  CoreMemoryData,
  EpisodeData,
  SemanticFact,
  Procedure,
  ProcedureStep,
  ResourceReference,
  VaultEntry,
  RelevanceFilterConfig,
} from './memory-types.js';
