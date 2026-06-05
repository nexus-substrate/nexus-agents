/**
 * nexus-agents/cli-adapters - Type Definitions
 *
 * Barrel file re-exporting all CLI adapter types.
 * Split into modules for maintainability:
 * - types-core.ts: Core CLI types (CliName, CliResponse, CliError, etc.)
 * - types-capability.ts: Capability types (ModelInfo, ICliAdapter, etc.)
 * - types-routing.ts: Routing types (Budget, Cascade, Confidence, etc.)
 *
 * (Source: cli-project_plan.md v2.1.0)
 * (Source: docs/research/cli-integration-architecture.md)
 */

// Core types
export type {
  CliName,
  CliTransport,
  TokenUsage,
  CliResponse,
  CliErrorCode,
  CliError,
  VersionStatus,
  HealthStatus,
  CapacityStatus,
  ApiVendor,
  ApiArmId,
  RoutingArmId,
} from './types-core.js';

// Routing arm id helpers (#3422)
export { apiArmId, routingArmDisplaySlot } from './types-core.js';

// Capability types
export type {
  BaseAdapterOptions,
  ModelInfo,
  CapabilityProfile,
  CliTask,
  ExecutionOptions,
  ResolvedExecutionOptions,
  ICliAdapter,
  ICliResponseParser,
  VersionRequirements,
  CliModelInfo,
} from './types-capability.js';

export { CLI_VERSION_REQUIREMENTS, DEFAULT_CAPABILITIES } from './types-capability.js';

// Routing types
export type {
  ConfidenceEstimate,
  ConfidenceFactors,
  CascadeOptions,
  CascadeResult,
  IConfidenceRouter,
  BudgetConstraint,
  SessionBudget,
  BudgetExceededError,
  BudgetWarning,
  BudgetRoutingResult,
  BudgetRouterOptions,
  IBudgetRouter,
} from './types-routing.js';

// Routing Memory types (moved from core/types - Issue #286)
export type {
  IRoutingMemory,
  TaskProfileSummary,
  RoutingDecisionRecord,
  TaskOutcomeRecord,
  PreferenceSignal,
  PreferenceRecord,
  PreferenceFilter,
  ExperienceStep,
  ExperienceRecord,
  ActionRecord,
  RoutingMemoryExport,
  RoutingMemoryStats,
} from './routing-memory-types.js';
export { RoutingMemoryError } from './routing-memory-types.js';
