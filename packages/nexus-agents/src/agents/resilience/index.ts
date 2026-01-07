/**
 * nexus-agents/agents/resilience
 *
 * Agent resilience module implementing failure detection and recovery
 * based on arxiv:2512.07497 "How Do LLMs Fail In Agentic Scenarios?"
 *
 * Provides detection and recovery for four failure archetypes:
 * - Premature action: Guessing schemas instead of inspecting
 * - Over-helpfulness: Substituting missing entities with plausible alternatives
 * - Context pollution: Reasoning corrupted by distractor data
 * - Fragile execution: Malformed tool calls and generation loops
 */

// Type exports
export type {
  FailureArchetype,
  FailureSeverity,
  DetectedFailure,
  DetectionResult,
  RecoveryAction,
  RecoveryStrategy,
  RecoveryResult,
  DetectorConfig,
} from './failure-types.js';

export {
  FailureArchetypeSchema,
  FailureSeveritySchema,
  DetectedFailureSchema,
  DetectionResultSchema,
  RecoveryActionSchema,
  RecoveryStrategySchema,
  RecoveryResultSchema,
  DetectorConfigSchema,
  DEFAULT_DETECTOR_CONFIG,
  DEFAULT_RECOVERY_STRATEGIES,
  ARCHETYPE_DESCRIPTIONS,
} from './failure-types.js';

// Failure detector exports
export type { DetectionInput, ToolCallRecord } from './failure-detector.js';

export { FailureDetector, createFailureDetector } from './failure-detector.js';

// Recovery strategy exports
export type {
  RecoveryManagerConfig,
  RecoveryContext,
  RecoveryInstructions,
  RecoveryResultOptions,
} from './recovery-strategies.js';

export {
  RecoveryManager,
  createRecoveryManager,
  buildRecoveryResult,
  DEFAULT_RECOVERY_CONFIG,
} from './recovery-strategies.js';
