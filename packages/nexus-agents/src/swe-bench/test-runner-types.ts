/**
 * nexus-agents/swe-bench - Test Runner Types
 *
 * Type definitions for running repository test suites.
 *
 * @module swe-bench/test-runner-types
 * (Source: Issue #257 - SWE-Bench Evaluation)
 */

import type { TestStatus, TestCaseResult } from './evaluation-harness-types.js';

/**
 * Configuration for test execution.
 */
export interface TestRunnerConfig {
  /** Working directory (repository root). */
  readonly workDir: string;
  /** Timeout per test in milliseconds. */
  readonly testTimeoutMs: number;
  /** Overall timeout in milliseconds. */
  readonly overallTimeoutMs: number;
  /** Whether to run tests in Docker. */
  readonly useDocker: boolean;
  /** Docker image to use (if useDocker is true). */
  readonly dockerImage?: string;
  /** Environment variables for test execution. */
  readonly env?: Readonly<Record<string, string>>;
  /** Specific test files/patterns to run. */
  readonly testPatterns?: readonly string[];
  /** Whether to capture stdout/stderr. */
  readonly captureOutput: boolean;
  /** Maximum output size in bytes. */
  readonly maxOutputBytes: number;
}

/**
 * Default test runner configuration.
 */
export const DEFAULT_TEST_RUNNER_CONFIG: Omit<TestRunnerConfig, 'workDir'> = {
  testTimeoutMs: 120_000, // 2 minutes per test
  overallTimeoutMs: 600_000, // 10 minutes total
  useDocker: true,
  captureOutput: true,
  maxOutputBytes: 10 * 1024 * 1024, // 10MB
};

/**
 * Result of running a test suite.
 */
export interface TestSuiteResult {
  /** Whether all tests passed. */
  readonly success: boolean;
  /** Overall status. */
  readonly status: TestStatus;
  /** Individual test results. */
  readonly tests: readonly TestCaseResult[];
  /** Number of tests passed. */
  readonly passed: number;
  /** Number of tests failed. */
  readonly failed: number;
  /** Number of tests skipped. */
  readonly skipped: number;
  /** Number of tests that errored. */
  readonly errored: number;
  /** Total test count. */
  readonly total: number;
  /** Total duration in milliseconds. */
  readonly durationMs: number;
  /** Raw output from test runner. */
  readonly output: string;
  /** Error message if suite failed to run. */
  readonly error?: string;
}

/**
 * Supported test frameworks.
 */
export type TestFramework = 'pytest' | 'unittest' | 'nose' | 'tox' | 'unknown';

/**
 * Test framework detection result.
 */
export interface FrameworkDetectionResult {
  /** Detected framework. */
  readonly framework: TestFramework;
  /** Confidence level (0-1). */
  readonly confidence: number;
  /** Configuration files found. */
  readonly configFiles: readonly string[];
  /** Test command to use. */
  readonly testCommand: string;
}

/**
 * Error codes for test runner.
 */
export type TestRunnerErrorCode =
  | 'FRAMEWORK_NOT_DETECTED'
  | 'TEST_TIMEOUT'
  | 'SETUP_FAILED'
  | 'EXECUTION_FAILED'
  | 'PARSE_ERROR'
  | 'DOCKER_ERROR'
  | 'UNKNOWN';

/**
 * Test runner error.
 */
export class TestRunnerError extends Error {
  override readonly cause?: unknown;
  readonly code: TestRunnerErrorCode;

  constructor(message: string, code: TestRunnerErrorCode, cause?: unknown) {
    super(message);
    this.name = 'TestRunnerError';
    this.code = code;
    this.cause = cause;
  }
}

/**
 * Interface for test runner implementations.
 */
export interface ITestRunner {
  /**
   * Detects the test framework used by the repository.
   */
  detectFramework(workDir: string): Promise<FrameworkDetectionResult>;

  /**
   * Runs the test suite.
   */
  run(config: TestRunnerConfig): Promise<TestSuiteResult>;

  /**
   * Runs specific tests by pattern.
   */
  runTests(config: TestRunnerConfig, testPatterns: readonly string[]): Promise<TestSuiteResult>;

  /**
   * Cancels a running test execution.
   */
  cancel(): void;
}
