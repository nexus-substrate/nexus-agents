/* eslint-disable max-lines */
/**
 * nexus-agents/cli - CLI utilities
 *
 * Command implementations for the nexus-agents CLI.
 */

export { doctorCommand, runDoctor, printDoctorResults } from './doctor.js';
export type { DoctorResult, CliCheckResult } from './doctor.js';

// Hello Command (Issue #423)
export { helloCommand, gatherSystemInfo, printHelloResult } from './hello.js';
export type { HelloResult } from './hello.js';

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
// (Source: Issue #386 - PuppeteerOrchestrator integration)
export { orchestrateCommand } from './orchestrate-command.js';
export type { OrchestrateOptions, OrchestrateEngine } from './orchestrate-command.js';

// Orchestrate Puppeteer Helpers (Issue #386)
export {
  executeWithPuppeteer,
  loadPolicyParameters,
  savePolicyParameters,
  createAgentsFromAdapters,
  createPolicyEngine,
  createOrchestrator,
  buildPuppeteerResult,
} from './orchestrate-puppeteer.js';
export type { PuppeteerOrchestrationResult } from './orchestrate-puppeteer.js';

// CLI Adapter Agent (Issue #386)
export { CliAdapterAgent } from './cli-adapter-agent.js';

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

// Research Registry (Issue #237, Epic #225, Epic #261, Issue #367, Issue #299)
export {
  researchCommand,
  isValidResearchSubcommand,
  getResearchStatus,
  findOverlaps,
  paperExists,
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- Re-exporting for backward compatibility
  fetchArxivMetadata,
  fetchArxivMetadataResult,
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
  // Research Index (Issue #367)
  researchIndexCommand,
  parseResearchIndexArgs,
  getResearchIndexHelp,
  // Registry helpers (Issue #299)
  generateRegistryEntry,
  paperExistsInRegistry,
  addPaperToRegistry,
  getCurrentDate,
} from './research-command.js';
export type {
  ResearchSubcommand,
  ArxivFetchError,
  ArxivFetchErrorCode,
  // Research Index types (Issue #367)
  ResearchIndexOptions,
  ResearchIndexResult,
  ResearchIndexAction,
  // Registry types (Issue #299)
  RegistryError,
  RegistryErrorCode,
  AddPaperOptions,
  AddPaperResult,
} from './research-command.js';
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

// SWE-bench Command (Issue #257 - SWE-Bench Evaluation)
export { sweBenchCommand, parseSweBenchArgs, printSweBenchHelp } from './swe-bench-command.js';
export type { SWEBenchOptions, SWEBenchCommandResult } from './swe-bench-command.js';

// Learning Metrics Dashboard (Issue #284)
export {
  learningMetricsCommand,
  runLearningMetrics,
  gatherLearningMetrics,
  parseLearningMetricsArgs,
  printLearningMetricsHelp,
  DEFAULT_LEARNING_METRICS_OPTIONS,
} from './learning-metrics-command.js';
export type {
  LearningMetricsOptions,
  LearningMetricsResult,
  LearningMetricsContext,
  ModelLearningStats,
  BanditProgress,
  RewardTrend,
  FeedbackLoopStats,
  FeatureImportance,
} from './learning-metrics-command.js';

// Setup Command (Issue #363 - Auto-configure Claude CLI integration)
// Interactive Wizard (Issue #425)
export {
  setupCommand,
  setupCommandAsync,
  runSetup,
  printSetupResult,
  generateMcpSnippet,
  generateRulesContent,
  detectEnvironment,
  runWizard,
} from './setup-command.js';
export type { SetupOptions, SetupResult, SetupCommandOptions } from './setup-command.js';
export type { WizardAnswers, UsageMode } from './setup-command.js';
export type {
  ClaudeCliInfo,
  McpConfigInfo,
  ProjectInfo,
  EnvironmentInfo,
  SetupStep,
} from './setup-types.js';
export {
  detectClaudeCli,
  detectMcpConfig,
  detectProjectType,
  detectProjectInfo,
  getMcpJsonPath,
  getRulesFilePath,
  createRulesFile,
  isInteractive,
  NEXUS_AGENTS_MCP_ENTRY,
  NEXUS_AGENTS_MCP_NPX_ENTRY,
} from './setup-helpers.js';

// Config Command (Issue #360 - CLI Config Management)
export {
  configCommand,
  runConfigCommand,
  printConfigResult,
  handleGet,
  handleSet,
  handleList,
  handleReset,
  handleExport,
  handleImport,
  getConfigCommandHelp,
  ConfigCommandError,
} from './config-command.js';
export type {
  ConfigCommandOptions,
  ConfigResult,
  ConfigGetResult,
  ConfigSetResult,
  ConfigListResult,
  ConfigResetResult,
  ConfigExportResult,
  ConfigImportResult,
  ConfigListEntry,
  ConfigErrorCode,
  ParsedConfigKey,
  ExportedConfigData,
  ImportedConfigData,
} from './config-command-types.js';
export {
  parseConfigKey,
  parseValueFromString,
  getValidCategories,
  getValidKeys,
  createBackup,
  resolveFilePath,
  getDefaultExportPath,
  serializeConfig,
  parseConfigFile,
  formatSource,
  formatValue,
} from './config-command-helpers.js';
export {
  CONFIG_ACTIONS,
  CONFIG_FORMATS,
  isValidConfigAction,
  isValidConfigFormat,
} from './config-command-types.js';

// Hooks (Issue #411 - Claude CLI Hook Integration)
export { hookCommand, printHookHelp } from './hooks/index.js';
export type {
  HookInput,
  HookEventName,
  HookResult,
  HookDecision,
  SessionStartInput,
  SessionEndInput,
  PreToolUseInput,
  PostToolUseInput,
  StopInput,
} from './hooks/hook-types.js';

// Demo Command (Issue #424 - Demo mode for API-free exploration)
export {
  demoCommand,
  runRoutingDemo,
  runExpertListDemo,
  runWorkflowDemo,
  printDemoHelp,
  isValidDemoSubcommand,
} from './demo-command.js';
export type { DemoSubcommand, DemoOptions } from './demo-command.js';

// Fitness Audit (System Mandate LOOP I - CLI Orchestration Fitness Score)
export { fitnessAuditCommand } from './fitness-audit.js';
export type { FitnessAuditOptions } from './fitness-audit.js';

// Release Automation Suite (Issue #637)
// Release Notes (Issue #639)
export {
  releaseNotesCommand,
  runReleaseNotes,
  printReleaseNotesResult,
} from './release-notes-command.js';
export type {
  ReleaseNotesOptions,
  ReleaseNotesResult,
  CategorizedCommit,
  ReleaseNotesCategory,
} from './release-notes-types.js';
export {
  getLatestTag,
  getCommitsBetween,
  parseConventionalCommit,
  groupCommitsByCategory,
  generateChangelogFormat,
  suggestNextVersion,
} from './release-notes-helpers.js';

// Release Validate (Issue #640)
export {
  releaseValidateCommand,
  runReleaseValidate,
  printReleaseValidateResult,
} from './release-validate-command.js';
export type {
  ReleaseValidateOptions,
  ReleaseValidateResult,
  ExpertValidationResult,
  ValidationFinding,
  ValidationSeverity,
} from './release-validate-types.js';

// Release Announce (Issue #641)
export {
  releaseAnnounceCommand,
  runReleaseAnnounce,
  printReleaseAnnounceResult,
} from './release-announce-command.js';
export type {
  ReleaseAnnounceOptions,
  ReleaseAnnounceResult,
  ChannelAnnouncementResult,
  AnnouncementChannel,
} from './release-announce-types.js';

// Bluesky Client (Issue #642 - AT Protocol posting)
export { getBlueskyConfig, createBlueskyPost } from './bluesky-client.js';
export type { BlueskyPostResult, BlueskyConfig } from './bluesky-client.js';

// Scaffold Command (Issue #653 - Scaffold command)
export {
  scaffoldCommand,
  runScaffold,
  printScaffoldResult,
  printScaffoldUsage,
  isValidScaffoldType,
  validateName,
  toPascalCase,
  toCamelCase,
  toScreamingSnake,
} from './scaffold.js';
export type { ScaffoldType, ScaffoldOptions, ScaffoldResult } from './scaffold.js';

// Warm-Up Command (Issue #1023 - LinUCB cold-start seeding)
export { generateSyntheticPriors, runWarmUp, SYNTHETIC_MARKER } from './warm-up.js';
export type { WarmUpResult } from './warm-up.js';

// E2E Evaluation Runner (Issue #1030 — Learning loop validation)
export { runE2EEval, formatE2EEvalResult, E2E_EVAL_MARKER } from './e2e-eval.js';
export type { E2EEvalConfig, E2EEvalResult } from './e2e-eval.js';

// Deep Diagnostics (Issue #1031 — Enhanced doctor --deep)
export { runDeepDiagnostics, formatDeepDiagnostics } from './doctor-deep.js';
export type {
  DeepDiagnostics,
  LearningLoopHealth,
  DataSufficiency,
  RoutingConvergence,
  CliDataStatus,
} from './doctor-deep.js';

// Routing A/B Framework (Issue #1033 — Routing strategy comparison)
export { runRoutingAB, formatABReport, PRESET_VARIANTS } from './routing-ab.js';
export type {
  RoutingVariant,
  ABComparisonReport,
  ABRunConfig,
  VariantSummary,
  AllocationDiffEntry,
} from './routing-ab.js';

// Auth Command (Issue #739 - MCP authentication)
export {
  authCommand,
  runAuthCommand,
  runAuthInit,
  runAuthShow,
  runAuthRotate,
  printAuthResult,
  isValidAuthSubcommand,
} from './auth-command.js';
export type { AuthSubcommand, AuthCommandOptions, AuthCommandResult } from './auth-command.js';
