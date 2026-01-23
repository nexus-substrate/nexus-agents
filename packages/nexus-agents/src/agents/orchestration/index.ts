/**
 * Puppeteer Orchestration Module
 *
 * Exports for Puppeteer-style learned orchestration.
 * Implements centralized orchestrator with dynamic agent selection
 * via learned/rule-based policies.
 *
 * @module agents/orchestration
 * (Source: Issue #335, arXiv:2505.19591)
 */

// =============================================================================
// Core Types
// =============================================================================

export type {
  // State types
  PuppeteerState,
  PuppeteerStateMetadata,
  AgentStepOutput,
  // Distribution types
  AgentDistribution,
  // Result types
  PuppeteerStepResult,
  PuppeteerResult,
  PuppeteerTerminationReason,
  // Pattern types
  EmergentPatterns,
  HubAgentInfo,
  CycleInfo,
  // Metric types
  PuppeteerMetrics,
  // Config types
  PuppeteerConfig,
  PolicyMode,
  PuppeteerExecuteOptions,
  // Puppet types
  PuppetDefinition,
  IPuppetAgent,
  ReasoningPattern,
} from './puppeteer-types.js';

export {
  DEFAULT_PUPPETEER_CONFIG,
  DEFAULT_PUPPETS,
  // Schemas
  PolicyModeSchema,
  TerminationReasonSchema,
  ReasoningPatternSchema,
  PuppeteerConfigSchema,
} from './puppeteer-types.js';

// =============================================================================
// Policy Types
// =============================================================================

export type {
  IPolicyEngine,
  ILearnablePolicyEngine,
  PolicyParameters,
  PolicyTrajectoryStep,
  RuleBasedPolicyConfig,
  PolicyErrorCode,
} from './policy-types.js';

export {
  PolicyError,
  DEFAULT_POLICY_PARAMETERS,
  DEFAULT_RULE_BASED_CONFIG,
  // Schemas
  PolicyErrorCodeSchema,
  PolicyParametersSchema,
  RuleBasedPolicyConfigSchema,
} from './policy-types.js';

// =============================================================================
// State Manager
// =============================================================================

export type { IStateManager, StateManagerConfig } from './state-manager.js';

export { StateManager, createStateManager, DEFAULT_STATE_MANAGER_CONFIG } from './state-manager.js';

// =============================================================================
// Policy Engines
// =============================================================================

export { RuleBasedPolicy, createRuleBasedPolicy } from './rule-based-policy.js';
export type { ScoringFeatures, AgentScores } from './rule-based-policy.js';

// =============================================================================
// Policy Feature Extraction
// =============================================================================

export {
  extractFeatures,
  extractKeywords,
  detectStuckState,
  inferLastPattern,
} from './policy-feature-extraction.js';

// =============================================================================
// Policy Scoring
// =============================================================================

export {
  computeCapabilityScore,
  computeRecencyScore,
  computePatternMatchScore,
  computeCostEfficiencyScore,
  computeProgressAdjustment,
  computeAgentScore,
  computeAllAgentScores,
} from './policy-scoring.js';

// =============================================================================
// Policy Distribution
// =============================================================================

export {
  softmax,
  enforceMinProbability,
  generateReasoning,
  scoresToDistribution,
  argmax,
  weightedSample,
  sampleFromDistribution,
} from './policy-distribution.js';

// =============================================================================
// Pattern Tracker
// =============================================================================

export type { IPatternTracker, PatternTrackerConfig } from './pattern-tracker.js';

export {
  PatternTracker,
  createPatternTracker,
  DEFAULT_PATTERN_TRACKER_CONFIG,
  // Utilities
  calculateCompactionScore,
  hasStrongCompaction,
  hasStrongCyclicality,
} from './pattern-tracker.js';

// =============================================================================
// Orchestrator
// =============================================================================

export type { PuppeteerOrchestratorOptions } from './puppeteer-orchestrator.js';

export {
  PuppeteerOrchestrator,
  PuppeteerError,
  createPuppeteerOrchestrator,
} from './puppeteer-orchestrator.js';

// =============================================================================
// Helpers
// =============================================================================

export type { RewardConfig } from './puppeteer-helpers.js';

export {
  generateSessionId,
  computeStepReward,
  computeFinalReward,
  detectTaskCompletion,
  detectConvergence,
  computeMetrics,
  buildPuppeteerResult,
  buildAgentStepOutput,
  buildAgentTask,
  buildStepResult,
  formatOutputString,
  DEFAULT_REWARD_CONFIG,
} from './puppeteer-helpers.js';

// =============================================================================
// Events
// =============================================================================

export type {
  PuppeteerStartedPayload,
  PuppeteerStepCompletedPayload,
  PuppeteerAgentSelectedPayload,
  PuppeteerStateUpdatedPayload,
  PuppeteerPatternDetectedPayload,
  PuppeteerCompletedPayload,
  PuppeteerErrorPayload,
  // Event types
  PuppeteerStartedEvent,
  PuppeteerStepCompletedEvent,
  PuppeteerAgentSelectedEvent,
  PuppeteerStateUpdatedEvent,
  PuppeteerPatternDetectedEvent,
  PuppeteerCompletedEvent,
  PuppeteerErrorEvent,
  PuppeteerTopic,
} from './puppeteer-events.js';

export {
  PuppeteerTopics,
  emitPuppeteerStarted,
  emitPuppeteerStepCompleted,
  emitPuppeteerCompleted,
  emitPuppeteerError,
  emitPuppeteerPatternDetected,
} from './puppeteer-events.js';

// =============================================================================
// Experience Buffer
// =============================================================================

export type {
  ExperienceBufferConfig,
  Episode,
  SampledBatch,
  BufferStats,
} from './experience-buffer.js';

export {
  ExperienceBuffer,
  createExperienceBuffer,
  DEFAULT_EXPERIENCE_BUFFER_CONFIG,
  // Schemas
  ExperienceBufferConfigSchema,
} from './experience-buffer.js';

// =============================================================================
// Trajectory Converter
// =============================================================================

export {
  convertTrajectory,
  convertSingleStep,
  isValidDistribution,
  convertTrajectoryWithValidation,
} from './trajectory-converter.js';

// =============================================================================
// Learning Integration
// =============================================================================

export type { LearningIntegrationConfig } from './learning-integration.js';

export {
  processOrchestrationForLearning,
  supportsLearning,
  createLearningHandler,
  computeEpisodeReward,
  DEFAULT_LEARNING_CONFIG,
} from './learning-integration.js';
