/**
 * Self-Development Workflow Module
 *
 * Exports types and utilities for the nexus-agents self-development
 * meta-workflow. This workflow enables the system to analyze issues,
 * plan implementations, achieve consensus, and execute code changes.
 *
 * @module workflows/self-development
 */

// Type exports
export type {
  // Configuration
  SelfDevWorkflowConfig,
  PhaseConfigs,
  AnalyzeConfig,
  ResearchConfig,
  VoteConfig,
  ImplementConfig,
  VerifyConfig,
  PriorityScoringWeights,

  // Phase outputs
  AnalyzedIssue,
  AnalyzeOutput,
  CodebaseFindings,
  AcademicFindings,
  DocFindings,
  HistoryFindings,
  ResearchOutput,
  ImplementationPlan,
  FileChange,
  PlanOutput,
  SelfDevPersona,
  PersonaCritique,
  RefineOutput,
  AgentVote,
  VoteOutput,
  ReviewRequest,
  ImpactAssessment,
  HumanDecision,
  ReviewOutput,
  ImplementOutput,
  FailedFile,
  VerifyCheck,
  VerifyOutput,
  CommitOutput,

  // Workflow state
  WorkflowPhase,
  WorkflowCheckpoint,
  SelfDevWorkflowState,
  SelfDevWorkflowMetrics,
  SelfDevWorkflowResult,

  // Engine interface
  ISelfDevWorkflowEngine,
} from './types.js';

// Constants
export { SELF_DEV_PERSONAS, VOTE_THRESHOLDS } from './types.js';

// Interfaces
export type {
  SelfDevWorkflowDependencies,
  IGitClient,
  IGitHubClient,
  GitHubIssue,
  GitHubPR,
  CreatePROptions,
  WorkflowEvent,
  WorkflowEventListener,
} from './interfaces.js';

// Phase executors (for extension/testing)
export {
  executeAnalyze,
  executeResearch,
  executePlan,
  executeRefine,
  executeVote,
  executeImplement,
  executeVerify,
  executeCommit,
} from './phase-executors.js';

// Metrics
export {
  calculateMetrics,
  validateMetrics,
  metricsPassQualityGates,
  summarizeMetrics,
  formatMetricsReport,
  type MetricsValidation,
  type MetricsSummary,
} from './metrics.js';

// Engine
export { SelfDevWorkflowEngine, createSelfDevWorkflowEngine } from './engine.js';

// Clients
export { createGitHubClient, GhCliGitHubClient, GitHubError } from './github-client.js';
export { createGitClient, GitCliClient, GitError } from './git-client.js';
