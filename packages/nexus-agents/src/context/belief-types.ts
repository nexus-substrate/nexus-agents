/**
 * nexus-agents/context - Hindsight Belief Memory Types
 *
 * Re-exports all belief-related types from split modules for backward compatibility.
 * Import from this module for convenience, or directly from sub-modules for
 * tree-shaking optimization.
 *
 * @module context/belief-types
 * (Source: Issue #336, arXiv:2512.12818 - Hindsight Belief Memory)
 */

// ============================================================================
// Core Types (Belief, Confidence, Source)
// ============================================================================

export {
  BeliefConfidence,
  BeliefConfidenceSchema,
  BeliefSourceType,
  BeliefSourceTypeSchema,
  BeliefSchema,
} from './belief-core-types.js';

export type { Belief } from './belief-core-types.js';

// ============================================================================
// Update Types (Operations, Queries)
// ============================================================================

export {
  BeliefUpdateType,
  BeliefUpdateTypeSchema,
  BeliefUpdateSchema,
  BeliefQuerySchema,
} from './belief-update-types.js';

export type { BeliefUpdate, BeliefQuery } from './belief-update-types.js';

// ============================================================================
// Hindsight Types (Counterfactual, Learning)
// ============================================================================

export { CounterfactualSchema, HindsightRecordSchema } from './belief-hindsight-types.js';

export type { Counterfactual, HindsightRecord } from './belief-hindsight-types.js';

// ============================================================================
// Memory Interface and Configuration
// ============================================================================

export {
  BeliefMemoryStatsSchema,
  BeliefMemoryConfigSchema,
  DEFAULT_BELIEF_CONFIG,
} from './belief-memory-interface.js';

export type {
  IHindsightBeliefMemory,
  BeliefMemoryStats,
  BeliefMemoryConfig,
} from './belief-memory-interface.js';
