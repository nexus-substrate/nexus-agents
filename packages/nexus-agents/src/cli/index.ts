/**
 * nexus-agents/cli - CLI utilities
 *
 * Command implementations for the nexus-agents CLI.
 */

export { doctorCommand, runDoctor, printDoctorResults } from './doctor.js';
export type { DoctorResult, CliCheckResult } from './doctor.js';

export { configInitCommand, runConfigInit, printConfigInitResult } from './config-init.js';
export type { ConfigInitOptions, ConfigInitResult } from './config-init.js';

export { expertListCommand, runExpertList, printExpertListResult } from './expert-list.js';
export type { ExpertListOptions, ExpertListResult, ExpertListFormat } from './expert-list.js';

export {
  workflowRunCommand,
  runWorkflowRun,
  printWorkflowRunResult,
  listWorkflowTemplates,
  printWorkflowTemplates,
} from './workflow-run.js';
export type { WorkflowRunOptions, WorkflowRunResult } from './workflow-run.js';

export { replCommand, startRepl } from './repl.js';

// Self-evaluation
export { evaluateCommand, parseOptions } from './self-eval.js';
export type { EvaluateOptions, EvaluateCommandResult, EvaluationSummary } from './self-eval.js';

// Mode detection
export { detectMode, formatModeDetection, isValidServerMode } from './mode-detector.js';
export type {
  ServerMode,
  ModeDetectionResult,
  DetectionSignals,
  DetectModeOptions,
} from './mode-detector.js';

// PR Review (dogfooding)
export { reviewCommand } from './review-command.js';
export type { ReviewCommandOptions } from './review-command.js';

// PR Review Demo (Issue #258 - Enhanced UX)
export { reviewDemoCommand } from './review-demo-command.js';
export type {
  ReviewDemoOptions,
  SetupStatus,
  PreflightResult,
  ProgressStep,
} from './review-demo-types.js';
export {
  checkSetupStatus,
  runPreflightChecks,
  formatSetupStatus,
  formatPreflightResults,
  formatProgressStep,
  createProgressSteps,
  updateProgress,
  getSetupInstructions,
} from './review-demo-helpers.js';

// Routing Audit (observability)
export { routingAuditCommand, auditRouting } from './routing-audit.js';
export type { RoutingAuditOptions, RoutingAuditResult } from './routing-audit.js';

// Orchestrate Command (standalone CLI mode)
// (Source: Issue #183, 5-0 consensus vote)
export { orchestrateCommand } from './orchestrate-command.js';
export type { OrchestrateOptions } from './orchestrate-command.js';

// Session Persistence (Issue #190)
export {
  sessionCommand,
  sessionList,
  sessionShow,
  sessionExport,
  sessionDelete,
  sessionPrune,
  printSessionList,
  printSessionShow,
  getDefaultDbPath,
} from './session-commands.js';
export type {
  SessionCommandOptions,
  SessionListOptions,
  SessionShowOptions,
  SessionExportOptions,
  SessionDeleteOptions,
  SessionPruneOptions,
} from './session-commands.js';

// Session Storage (Issue #190)
export { SQLiteSessionStorage, createSessionStorage } from './session-storage.js';
export type {
  ISessionStorage,
  SessionStorageConfig,
  StoredSession,
  StoredTask,
  SessionWithTasks,
  SessionSummary,
  SessionMetadata,
  SessionStatus,
  TaskStatus,
} from './session-storage-types.js';
export { SessionStorageError } from './session-storage-types.js';

// System Review (Issue #211, Process Automation Epic #209)
export { systemReviewCommand, runSystemReview, printSystemReviewResult } from './system-review.js';
export type { SystemReviewOptions, SystemReviewResult } from './system-review.js';

// Consensus Vote (Issue #212, Process Automation Epic #209)
export { voteCommand } from './vote-command.js';
export type { VoteCommandOptions, VotingResult } from './vote-types.js';

// Issue Templates (Issue #229, Epic #225)
export {
  issueCommand,
  validateIssue,
  printValidationResult,
  printTemplate,
} from './issue-command.js';
export type { IssueCommandOptions, IssueCommandResult } from './issue-command.js';
export {
  detectIssueType,
  getTemplate,
  validateIssueBody,
  generateTemplateBody,
  formatValidationResult,
  TEMPLATES,
  FEAT_TEMPLATE,
  BUG_TEMPLATE,
  TASK_TEMPLATE,
} from './issue-templates.js';
export type {
  IssueType,
  IssueTemplate,
  IssueValidationResult,
  RequiredSection,
} from './issue-template-types.js';

// Sprint Planning (Issue #230, Epic #225)
export {
  sprintCommand,
  generateProposal,
  printProposal,
  printSprintResult,
} from './sprint-command.js';
export type { SprintCommandOptions, SprintPlanResult, SprintProposal } from './sprint-types.js';
export type { SprintIssue, Priority, GitHubIssueRaw } from './sprint-types.js';

// Research Registry (Issue #237, Epic #225, Epic #261)
export {
  researchCommand,
  isValidResearchSubcommand,
  getResearchStatus,
  findOverlaps,
  paperExists,
  fetchArxivMetadata,
  addResearchPaper,
  loadTechniquesRegistry,
  loadPapersRegistry,
  saveTechniquesRegistry,
  savePapersRegistry,
  formatStatusResult,
  formatOverlapResult,
  // Pure utility functions
  toStatusSummary,
  filterByStatus,
  countByStatus,
  calculateTagOverlap,
  findSharedTags,
  determineRelationship,
} from './research-command.js';
export type { ResearchSubcommand } from './research-command.js';
export type {
  ResearchAddOptions,
  ResearchStatusOptions,
  ResearchOverlapOptions,
  ResearchAddResult,
  ResearchStatusResult,
  ResearchOverlapResult,
  TechniqueEntry,
  TechniqueStatus,
  TechniqueStatusSummary,
  TechniquesRegistry,
  PaperEntry,
  PapersRegistry,
  OverlapMatch,
  ArxivMetadata,
} from './research-types.js';

// Codebase Index (Issue #240)
export { indexCommand, formatIndexResult } from './index-command.js';
export type { IndexSubcommand, IndexCommandOptions, IndexCommandResult } from './index-command.js';

// Validation Dashboard (Issue #273)
export {
  validationDashboardCommand,
  runValidationDashboard,
  formatValidationDashboardResult,
  parseValidationArgs,
  isValidPeriod,
  isValidDashboardFormat,
  VALID_PERIODS,
} from './validation-dashboard-command.js';
export type {
  ValidationDashboardOptions,
  ValidationDashboardResult,
} from './validation-dashboard-types.js';

// Verify Command (Issue #253 - Quick verification)
export { verifyCommand, runVerify, printVerifyResult } from './verify-command.js';
export type { VerifyOptions, VerifyCheck, VerifyResult } from './verify-command.js';
