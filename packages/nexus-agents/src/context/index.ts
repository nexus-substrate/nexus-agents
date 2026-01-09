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

// Session Memory (Issue #130, arXiv:2303.11366 - Reflexion)
export {
  SessionMemory,
  createSessionMemory,
  SessionMemoryError,
  SessionLearningSchema,
  CompletedTaskSchema,
  ResolvedErrorSchema,
  SessionEpisodeSchema,
} from './session-memory.js';

export type {
  SessionMemoryConfig,
  SessionLearning,
  CompletedTask,
  ResolvedError,
  SessionEpisode,
} from './session-memory.js';

// Graph Memory (Issue #142, arXiv:2308.09687 - MiRIX)
export { GraphMemoryBackend, createGraphMemory, RelationTypes } from './graph-memory.js';

export type {
  IGraphMemory,
  GraphEdge,
  GraphMemoryConfig,
  TraversalOptions,
  TraversalResult,
  RelationType,
  AddRelationshipOptions,
} from './graph-memory.js';

// Adaptive Memory (Issue #143, arXiv:2310.08560)
export {
  AdaptiveMemoryBackend,
  createAdaptiveMemory,
  DEFAULT_SCORING_CONFIG,
} from './adaptive-memory.js';

export type {
  IAdaptiveMemory,
  AdaptiveMemoryConfig,
  ScoringConfig,
  PriorityScore,
  ScoredMemoryEntry,
  PriorityRetrievalOptions,
} from './adaptive-memory.js';

// Agentic Memory (Issue #122, arXiv:2502.12110 - A-MEM)
export {
  AgenticMemoryBackend,
  createAgenticMemory,
  EntityType,
  EvolutionType,
  DEFAULT_EXTRACTION_CONFIG,
  DEFAULT_LINKING_CONFIG,
  DEFAULT_AGENTIC_MEMORY_CONFIG,
} from './agentic-memory.js';

export type {
  IAgenticMemory,
  AgenticMemoryConfig,
  AgenticMemoryEntry,
  AgenticStoreResult,
  MemoryAttributes,
  ExtractionConfig,
  LinkingConfig,
  LinkingOptions,
  LinkSuggestion,
  EvolutionResult,
  EntityReference,
} from './agentic-memory.js';
