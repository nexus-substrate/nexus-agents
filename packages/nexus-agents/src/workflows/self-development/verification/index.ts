/**
 * QA Verification Module
 *
 * Exports for the verification engine that runs quality checks
 * before issue closure.
 *
 * (Source: Issue #277 - QA cycle before issue closure)
 */

// Types
export type {
  CheckCategory,
  CheckSeverity,
  CheckDefinition,
  CheckResult,
  CheckIssue,
  VerifyConfig,
  VerifyInput,
  VerifyOutput,
  VerifyFeedback,
  VerifyEventType,
  VerifyEvent,
} from './verify-types.js';

export { CheckDefinitionSchema, VerifyConfigSchema } from './verify-types.js';

// Check Definitions
export {
  TYPECHECK,
  LINT,
  TEST,
  BUILD,
  SECURITY_AUDIT,
  COVERAGE,
  MINIMAL_CHECKS,
  STANDARD_CHECKS,
  FULL_CHECKS,
  createCheck,
  filterChecksByCategory,
  getChecksForFiles,
} from './verify-checks.js';

// Engine
export { VerifyEngine, createVerifyEngine, type IVerifyEngine } from './verify-engine.js';
