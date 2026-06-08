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

// Token Budget Tracking (Issue #304, Epic #301)
export {
  TokenBudgetTracker,
  createTokenBudgetTracker,
  TokenBudgetError,
  DEFAULT_TOKEN_BUDGET_CONFIG,
} from './token-budget-tracker.js';

export type {
  ITokenBudgetTracker,
  TokenBudgetConfig,
  TokenUsageRecord,
  BudgetCheckResult,
  BudgetStats,
  BudgetWarning,
  BudgetWarningLevel,
  BudgetEnforcementMode,
} from './token-budget-types.js';

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

// Hindsight Belief Memory (Issue #336, arXiv:2512.12818)
export { HindsightBeliefMemory } from './belief-memory.js';
export { BeliefConfidence, BeliefSourceType } from './belief-core-types.js';

export type {
  Belief,
  BeliefMemoryConfig,
  BeliefMemoryStats,
  BeliefQuery,
  BeliefUpdate,
  Counterfactual,
  HindsightRecord,
  IHindsightBeliefMemory,
} from './belief-types.js';

// MobiMem Memory System (Issue #149, arXiv:2512.15784)
export { MobiMem, createMobiMem, DEFAULT_MOBIMEM_CONFIG } from './mobimem.js';

export type {
  IMobiMem,
  IProfileMemory,
  IExperienceMemory,
  IActionCache,
  MobiMemConfig,
  MobiMemStats,
  ProfileEntry,
  ExperienceEntry,
  ActionCacheEntry,
  ActionStep,
  ExecutionOutcome,
} from './mobimem.js';

// Routing Memory Bridge (Issue #461, #148, #149)
export {
  RoutingMemory,
  createRoutingMemory,
  DEFAULT_ROUTING_MEMORY_CONFIG,
} from './routing-memory.js';

export type {
  IRoutingMemory,
  RoutingMemoryConfig,
  RoutingMemoryStats,
  ModelPerformance,
  ModelPreference,
  ExperiencePattern,
  CachedActionResult,
} from './routing-memory.js';

// Session Journal (Context Exhaustion Prevention)
export {
  createSessionJournal,
  loadJournal,
  summarizeJournal,
  type SessionJournal,
} from './session-journal.js';

export {
  JournalEventTypeSchema,
  JournalEntrySchema,
  type JournalEventType,
  type JournalEntry,
  type JournalSummary,
} from './session-journal-types.js';

// Context Pressure Monitor (Context Exhaustion Prevention)
export {
  createContextPressureMonitor,
  calculateLevel,
  getRecommendedAction,
  shouldAutoCheckpoint,
  type ContextPressureMonitor,
} from './context-pressure-monitor.js';

export {
  DEFAULT_PRESSURE_CONFIG,
  type ContextPressureConfig,
  type PressureLevel,
  type PressureEvent,
  type PressureStats,
} from './context-pressure-types.js';

// ContextRetriever — unified read surface across every shared memory backend.
// Phase 2 of #2792 (closes #2794). Phase 3 (#2795) adds inferTaskCategory +
// summarizeContextForPrompt for entry-point wiring.
export {
  getContextForTask,
  inferTaskCategory,
  summarizeContextForPrompt,
  type ContextRetrieverOptions,
  type UnifiedContext,
} from './context-retriever.js';

// Unified memory cross-ranker (#3236) — collapses the per-backend lists in
// UnifiedContext into one comparable, sorted RankedMemoryItem[].
export {
  rankMemories,
  topRankedWithinBudget,
  type RankedMemoryItem,
  type RankedMemorySource,
  type RankMemoriesOptions,
} from './context-retriever-helpers.js';
