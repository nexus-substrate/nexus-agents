/**
 * nexus-agents/swe-bench - Harness Executor
 *
 * Executes the SWE-bench evaluation harness and parses results.
 * Integrates with environment-validator for pre-flight checks.
 *
 * @module swe-bench/harness-executor
 * @see https://www.swebench.com/SWE-bench/guides/evaluation/
 * (Source: Issue #257 - SWE-Bench Evaluation)
 */

// Re-export implementation
export { HarnessExecutor } from './harness-executor-impl.js';

// Re-export factory functions
export {
  createHarnessExecutor,
  createValidatedExecutor,
  executeHarness,
} from './harness-executor-factory.js';

// Re-export types for convenience
export type {
  HarnessExecutionConfig,
  HarnessExecutionResult,
  HarnessValidationResult,
  HarnessExecutionProgress,
  HarnessProgressCallback,
  IHarnessExecutor,
} from './harness-executor-types.js';

export {
  HarnessExecutorError,
  DEFAULT_HARNESS_EXECUTION_CONFIG,
} from './harness-executor-types.js';
