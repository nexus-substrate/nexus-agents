/**
 * Core Routing Interfaces
 *
 * Re-exports router interfaces for use by MCP and other layers.
 * Provides a stable abstraction layer over cli-adapters implementations.
 *
 * @module core/routing
 * (Source: Issue #588 - Layer separation)
 */

// Re-export router interfaces from cli-adapters
// This allows MCP tools to depend on core instead of cli-adapters directly
export type { ICompositeRouter } from '../../cli-adapters/composite-router.js';
export type {
  CompositeRoutingDecision,
  CompositeRoutingError,
  CompositeRouterStats,
  CompositeRouterConfig,
} from '../../cli-adapters/composite-router-types.js';

// Re-export CLI types needed for router interfaces
export type {
  CliName,
  CliTask,
  CliResponse,
  CliError,
  ICliAdapter,
} from '../../cli-adapters/types.js';

// Re-export sub-router interfaces
export type { IZeroRouter } from '../../cli-adapters/zero-router.js';
export type { ILatencyTracker } from '../../cli-adapters/latency-tracker.js';
export type { IRoutingMemory } from '../../context/routing-memory.js';

// Re-export factory for creating routers
export { createCompositeRouter } from '../../cli-adapters/composite-router.js';

// Unified Routing Context Store (ADR-0008)
export type {
  IRoutingContextStore,
  RoutingContextStoreConfig,
  RoutingContextError,
  RoutingContextStats,
  // Preference types
  PreferenceDataPoint,
  PreferenceStats,
  QueryFeatures,
  // Performance types
  ModelPerformance,
  ModelPreference,
  ExperiencePattern,
  CachedActionResult,
  // Metrics types
  RoutingDecision,
  TaskOutcome,
  AggregatedModelMetrics,
  RoutingMetricsSummary,
  // Common types
  Timestamp,
  TaskType,
  Domain,
} from './routing-context-store.js';
export { RoutingContextStore, createRoutingContextStore } from './routing-context-store-impl.js';
