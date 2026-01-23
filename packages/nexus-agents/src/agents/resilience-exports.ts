/**
 * nexus-agents/agents - Resilience Module Exports
 *
 * Re-exports for agent resilience (failure detection and recovery).
 */

// Agent resilience (failure detection and recovery)
export {
  // Types
  type FailureArchetype,
  type FailureSeverity,
  type DetectedFailure,
  type DetectionResult,
  type RecoveryAction,
  type RecoveryStrategy,
  type RecoveryResult,
  type DetectorConfig,
  type DetectionInput,
  type ToolCallRecord,
  type RecoveryManagerConfig,
  type RecoveryContext,
  type RecoveryInstructions,
  type RecoveryResultOptions,
  // Schemas
  FailureArchetypeSchema,
  FailureSeveritySchema,
  DetectedFailureSchema,
  DetectionResultSchema,
  RecoveryActionSchema,
  RecoveryStrategySchema,
  RecoveryResultSchema,
  DetectorConfigSchema,
  // Constants
  DEFAULT_DETECTOR_CONFIG,
  DEFAULT_RECOVERY_STRATEGIES,
  DEFAULT_RECOVERY_CONFIG,
  ARCHETYPE_DESCRIPTIONS,
  // Classes and factories
  FailureDetector,
  createFailureDetector,
  RecoveryManager,
  createRecoveryManager,
  buildRecoveryResult,
} from './resilience/index.js';
