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
