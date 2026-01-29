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

// Fail-fast utilities (Issue #455)
export { MissingDependencyError, checkFailFast } from './phases/shared.js';

// Fail-safe analysis (Issue #496)
export { AnalyzeUnavailableError } from './phases/analyze.js';

// Fail-safe research (Issue #502)
export { ResearchUnavailableError } from './phases/research.js';

// Fail-safe planning (Issue #497)
export { PlanUnavailableError } from './phases/plan.js';

// Fail-safe voting (Issue #501)
export { VotingUnavailableError } from './phases/vote.js';

// Fail-safe refinement (Issue #503)
export { RefineUnavailableError } from './phases/refine.js';

// Fail-safe implementation (Issue #504)
export { ImplementUnavailableError } from './phases/implement.js';

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

// Shell execution
export {
  executeShellCommand,
  executePnpmScript,
  runVerificationCheck,
  runAllVerificationChecks,
  ShellError,
  type ShellResult,
  type ShellOptions,
  type VerificationCheckResult,
} from './shell-executor.js';

// Audit trail
export {
  AuditTrail,
  InMemoryAuditStorage,
  createAuditTrail,
  type AuditEvent,
  type AuditSeverity,
  type AuditCategory,
  type IAuditStorage,
} from './audit-trail.js';

// Notifications
export {
  NotificationService,
  ConsoleNotificationHandler,
  WebhookNotificationHandler,
  createNotificationService,
  type Notification,
  type NotificationSeverity,
  type NotificationEventType,
  type INotificationHandler,
  type WebhookConfig,
} from './notifications.js';

// Dependencies Factory (Issue #494)
export {
  createSelfDevDeps,
  hasRealExecution,
  type SelfDevDepsConfig,
  type SelfDevDepsResult,
} from './deps-factory.js';
