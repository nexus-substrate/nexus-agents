/**
 * nexus-agents/swe-bench - Harness Executor Helpers
 *
 * Utility functions for SWE-bench harness execution:
 * - Command building
 * - Output parsing
 * - Result transformation
 *
 * @module swe-bench/harness-executor-helpers
 * (Source: Issue #257 - SWE-Bench Evaluation)
 */

// Re-export version detection utilities
export {
  getSwebenchVersion,
  getPythonVersion,
  getDockerVersion,
} from './harness-version-detection.js';

// Re-export output parsing utilities
export {
  parseHarnessOutput,
  parseHarnessLogFile,
  parseProgressLine,
  transformTestResult,
  transformInstanceResult,
  transformHarnessOutput,
} from './harness-output-parsing.js';

// Re-export file operations
export {
  buildHarnessArgs,
  buildHarnessCommand,
  validatePredictionsFile,
  ensureOutputDir,
  spawnHarnessProcess,
  calculateEstimatedRemaining,
  createInitialProgress,
  getResultsFilePath,
} from './harness-file-operations.js';
