/**
 * nexus-agents/agents - Orchestration Module Exports
 *
 * Re-exports for Puppeteer orchestration module.
 * Uses explicit exports to avoid naming conflicts with reasoning module's TerminationReasonSchema.
 *
 * @module agents/orchestration-exports
 * (Source: Issue #335)
 */

// Core Types (excluding TerminationReasonSchema which conflicts with reasoning module)
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
} from './orchestration/index.js';

export {
  DEFAULT_PUPPETEER_CONFIG,
  DEFAULT_PUPPETS,
  // Schemas (renaming to avoid conflict)
  PolicyModeSchema,
  TerminationReasonSchema as PuppeteerTerminationReasonSchema,
  ReasoningPatternSchema as PuppeteerReasoningPatternSchema,
  PuppeteerConfigSchema,
} from './orchestration/index.js';

// Policy Types
export type {
  IPolicyEngine,
  ILearnablePolicyEngine,
  PolicyParameters,
  PolicyTrajectoryStep,
  RuleBasedPolicyConfig,
  PolicyErrorCode,
  LearnablePolicyConfig,
  LearnablePolicyStats,
} from './orchestration/index.js';

export {
  PolicyError,
  DEFAULT_POLICY_PARAMETERS,
  DEFAULT_RULE_BASED_CONFIG,
  PolicyErrorCodeSchema,
  PolicyParametersSchema,
  RuleBasedPolicyConfigSchema,
} from './orchestration/index.js';

// State Manager
export type { IStateManager, StateManagerConfig } from './orchestration/index.js';
export {
  StateManager,
  createStateManager,
  DEFAULT_STATE_MANAGER_CONFIG,
} from './orchestration/index.js';

// Policy Engines
export { RuleBasedPolicy, createRuleBasedPolicy } from './orchestration/index.js';
export type { ScoringFeatures, AgentScores } from './orchestration/index.js';

export {
  LearnablePolicy,
  createLearnablePolicy,
  isLearnablePolicyEngine,
} from './orchestration/index.js';

// Policy Feature Extraction
export {
  extractFeatures,
  extractKeywords as extractOrchestrationKeywords,
  detectStuckState,
  inferLastPattern,
} from './orchestration/index.js';

// Policy Scoring
export {
  computeCapabilityScore,
  computeRecencyScore,
  computePatternMatchScore,
  computeCostEfficiencyScore,
  computeProgressAdjustment,
  computeAgentScore,
  computeAllAgentScores,
} from './orchestration/index.js';

// Policy Distribution
export {
  softmax,
  enforceMinProbability,
  generateReasoning,
  scoresToDistribution,
  argmax,
  weightedSample,
  sampleFromDistribution,
} from './orchestration/index.js';

// Pattern Tracker
export type { IPatternTracker, PatternTrackerConfig } from './orchestration/index.js';
export {
  PatternTracker,
  createPatternTracker,
  DEFAULT_PATTERN_TRACKER_CONFIG,
  calculateCompactionScore,
  hasStrongCompaction,
  hasStrongCyclicality,
} from './orchestration/index.js';

// Error Types
export { PuppeteerError } from './orchestration/index.js';

// Policy Factory
export { createPolicyForMode } from './orchestration/index.js';

// Orchestrator
export type { PuppeteerOrchestratorOptions } from './orchestration/index.js';
export { PuppeteerOrchestrator, createPuppeteerOrchestrator } from './orchestration/index.js';

// Helpers
export type { RewardConfig } from './orchestration/index.js';
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
} from './orchestration/index.js';

// Events
export type {
  PuppeteerStartedPayload,
  PuppeteerStepCompletedPayload,
  PuppeteerAgentSelectedPayload,
  PuppeteerStateUpdatedPayload,
  PuppeteerPatternDetectedPayload,
  PuppeteerCompletedPayload,
  PuppeteerErrorPayload,
  PuppeteerStartedEvent,
  PuppeteerStepCompletedEvent,
  PuppeteerAgentSelectedEvent,
  PuppeteerStateUpdatedEvent,
  PuppeteerPatternDetectedEvent,
  PuppeteerCompletedEvent,
  PuppeteerErrorEvent,
  PuppeteerTopic,
} from './orchestration/index.js';

export {
  PuppeteerTopics,
  emitPuppeteerStarted,
  emitPuppeteerStepCompleted,
  emitPuppeteerCompleted,
  emitPuppeteerError,
  emitPuppeteerPatternDetected,
} from './orchestration/index.js';

// Experience Buffer
export type {
  ExperienceBufferConfig,
  Episode,
  SampledBatch,
  BufferStats,
  SerializedEpisode,
  SerializedBuffer,
  StepWithEpisodeId,
  SampledStepWithProb,
} from './orchestration/index.js';

export {
  ExperienceBuffer,
  createExperienceBuffer,
  DEFAULT_EXPERIENCE_BUFFER_CONFIG,
  ExperienceBufferConfigSchema,
  sampleUniformly,
  sampleWithPriority,
  flattenStepsWithEpisodeIds,
  weightedRandomIndex,
  computePriorities,
  prioritiesToProbabilities,
  computeImportanceWeights,
} from './orchestration/index.js';

// Trajectory Converter
export {
  convertTrajectory,
  convertSingleStep,
  isValidDistribution,
  convertTrajectoryWithValidation,
} from './orchestration/index.js';

// Policy Gradient Helpers
export type { LearnableWeightKey, GradientState } from './orchestration/index.js';
export {
  LEARNABLE_WEIGHTS,
  computeReturns,
  extractFeatureValues,
  computeGradients,
  normalizeWeights,
  applyGradientUpdate,
} from './orchestration/index.js';

// Learning Integration
export type { LearningIntegrationConfig } from './orchestration/index.js';
export {
  processOrchestrationForLearning,
  supportsLearning,
  createLearningHandler,
  computeEpisodeReward,
  DEFAULT_LEARNING_CONFIG,
} from './orchestration/index.js';
