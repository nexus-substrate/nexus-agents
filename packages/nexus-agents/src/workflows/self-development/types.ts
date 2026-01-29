/**
 * Self-Development Workflow Types
 *
 * Type definitions for the meta-workflow that enables nexus-agents
 * to analyze issues, plan implementations, achieve consensus, and
 * execute code changes with human oversight.
 *
 * @module workflows/self-development/types
 * (Source: docs/workflows/SELF_DEVELOPMENT_WORKFLOW.md)
 */

// Re-export configuration and early phase types
export type {
  SelfDevWorkflowConfig,
  PhaseConfigs,
  AnalyzeConfig,
  PriorityScoringWeights,
  AnalyzedIssue,
  AnalyzeOutput,
  ResearchConfig,
  CodebaseFindings,
  AcademicFindings,
  DocFindings,
  HistoryFindings,
  ResearchOutput,
  SelfDevPlanConfig,
  SelfDevRefineConfig,
  VoteConfig,
  ImplementConfig,
  VerifyConfig,
} from './self-dev-config-types.js';

// Re-export phase types
export type {
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
} from './self-dev-phase-types.js';
export { SELF_DEV_PERSONAS, VOTE_THRESHOLDS } from './self-dev-phase-types.js';

// Re-export state types
export type {
  WorkflowPhase,
  WorkflowCheckpoint,
  SelfDevWorkflowState,
  SelfDevWorkflowMetrics,
  SelfDevWorkflowResult,
  ISelfDevWorkflowEngine,
} from './self-dev-state-types.js';
