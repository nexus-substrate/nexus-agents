/**
 * nexus-agents/swe-bench - Test Runner
 *
 * Executes repository test suites for SWE-bench evaluation.
 * Supports pytest (primary), unittest, and nose frameworks.
 *
 * @module swe-bench/test-runner
 * (Source: Issue #257 - SWE-Bench Evaluation)
 */

import { exec, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { ILogger } from '../core/logger.js';
import { createLogger } from '../core/logger.js';
import type {
  ITestRunner,
  TestRunnerConfig,
  TestSuiteResult,
  FrameworkDetectionResult,
  TestFramework,
} from './test-runner-types.js';
import { DEFAULT_TEST_RUNNER_CONFIG } from './test-runner-types.js';
import { parseTestResults, parseStdoutResults } from './test-runner-parser.js';
import {
  executeInDocker,
  type DockerExecutionState,
  type ExecuteInDockerOptions,
} from './test-runner-docker.js';

const execAsync = promisify(exec);

/** Framework detection configuration files. */
const FRAMEWORK_CONFIG_FILES: Record<TestFramework, readonly string[]> = {
  pytest: ['pytest.ini', 'pyproject.toml', 'setup.cfg', 'conftest.py', 'tox.ini'],
  unittest: ['setup.py', 'setup.cfg'],
  nose: ['setup.cfg', '.noserc', 'nose.cfg'],
  tox: ['tox.ini'],
  unknown: [],
};

/** Test commands by framework. */
const FRAMEWORK_COMMANDS: Record<TestFramework, string> = {
  pytest: 'python -m pytest',
  unittest: 'python -m unittest discover',
  nose: 'python -m nose',
  tox: 'tox',
  unknown: 'python -m pytest', // Default fallback
};

/**
 * Runs repository test suites for SWE-bench evaluation.
 *
 * Features:
 * - Automatic framework detection (pytest, unittest, nose)
 * - Docker isolation support
 * - Timeout handling
 * - Output parsing for detailed results
 */
export class TestRunner implements ITestRunner {
  private readonly logger: ILogger;
  private readonly dockerState: DockerExecutionState = {
    currentProcess: null,
    isCancelled: false,
  };

  constructor(logger?: ILogger) {
    this.logger = logger ?? createLogger({ component: 'test-runner' });
  }

  /**
   * Detects the test framework used by the repository.
   */
  async detectFramework(workDir: string): Promise<FrameworkDetectionResult> {
    this.logger.debug('Detecting test framework', { workDir });

    const results = await this.checkFrameworkFiles(workDir);

    // Sort by confidence and return highest
    results.sort((a, b) => b.confidence - a.confidence);

    const best = results[0];
    if (best !== undefined && best.confidence > 0) {
      return best;
    }

    // Default to pytest
    return {
      framework: 'pytest',
      confidence: 0.5,
      configFiles: [],
      testCommand: FRAMEWORK_COMMANDS.pytest,
    };
  }

  /**
   * Runs the full test suite.
   */
  async run(config: TestRunnerConfig): Promise<TestSuiteResult> {
    const effectiveConfig = { ...DEFAULT_TEST_RUNNER_CONFIG, ...config };

    this.logger.info('Running test suite', {
      workDir: effectiveConfig.workDir,
      useDocker: effectiveConfig.useDocker,
    });

    this.dockerState.isCancelled = false;

    // Detect framework if not specified
    const framework = await this.detectFramework(effectiveConfig.workDir);
    this.logger.debug('Using test framework', { framework: framework.framework });

    // Build test command
    const testCommand = this.buildTestCommand(framework, effectiveConfig);

    // Execute tests
    return this.executeTests(testCommand, effectiveConfig);
  }

  /**
   * Runs specific tests by pattern.
   */
  async runTests(
    config: TestRunnerConfig,
    testPatterns: readonly string[]
  ): Promise<TestSuiteResult> {
    const configWithPatterns: TestRunnerConfig = {
      ...config,
      testPatterns,
    };
    return this.run(configWithPatterns);
  }

  /**
   * Cancels a running test execution.
   */
  cancel(): void {
    this.logger.info('Cancelling test execution');
    this.dockerState.isCancelled = true;

    const proc: ChildProcess | null = this.dockerState.currentProcess;
    if (proc !== null) {
      proc.kill('SIGTERM');
    }
  }

  /**
   * Checks for framework configuration files.
   */
  private async checkFrameworkFiles(workDir: string): Promise<FrameworkDetectionResult[]> {
    const results: FrameworkDetectionResult[] = [];

    for (const [framework, configFiles] of Object.entries(FRAMEWORK_CONFIG_FILES)) {
      if (framework === 'unknown') continue;

      const foundFiles = await this.findConfigFiles(workDir, configFiles);
      if (foundFiles.length > 0) {
        const confidence = this.calculateConfidence(framework as TestFramework, foundFiles);
        results.push({
          framework: framework as TestFramework,
          confidence,
          configFiles: foundFiles,
          testCommand: FRAMEWORK_COMMANDS[framework as TestFramework],
        });
      }
    }

    return results;
  }

  /**
   * Finds configuration files in the working directory.
   */
  private async findConfigFiles(
    workDir: string,
    configFiles: readonly string[]
  ): Promise<string[]> {
    const found: string[] = [];

    for (const file of configFiles) {
      const filePath = path.join(workDir, file);
      try {
        await fs.access(filePath);
        found.push(file);
      } catch {
        // File doesn't exist
      }
    }

    return found;
  }

  /**
   * Calculates confidence based on found files.
   */
  private calculateConfidence(framework: TestFramework, foundFiles: string[]): number {
    let confidence = 0.3 * foundFiles.length;

    // Boost for specific files
    if (framework === 'pytest') {
      if (foundFiles.includes('pytest.ini')) confidence += 0.4;
      if (foundFiles.includes('conftest.py')) confidence += 0.3;
    }

    if (framework === 'tox' && foundFiles.includes('tox.ini')) {
      confidence += 0.2;
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * Builds the test command string.
   */
  private buildTestCommand(framework: FrameworkDetectionResult, config: TestRunnerConfig): string {
    let command = framework.testCommand;

    // Add pytest-specific options
    if (framework.framework === 'pytest') {
      command += ' -v --tb=short';

      // JSON output for parsing
      command += ' --json-report --json-report-file=test-results.json';

      // Timeout handling
      const testTimeoutSec = Math.ceil(config.testTimeoutMs / 1000);
      command += ` --timeout=${String(testTimeoutSec)}`;
    }

    // Add test patterns if specified
    if (config.testPatterns !== undefined && config.testPatterns.length > 0) {
      command += ` ${config.testPatterns.join(' ')}`;
    }

    return command;
  }

  /**
   * Executes the test command.
   */
  private async executeTests(command: string, config: TestRunnerConfig): Promise<TestSuiteResult> {
    const startTime = Date.now();

    if (config.useDocker) {
      const dockerOptions: ExecuteInDockerOptions = {
        command,
        config,
        startTime,
        state: this.dockerState,
        createCancelledResult: (st) => this.createCancelledResult(st),
        handleTestError: (err, st) => this.handleTestError(err, st),
        logger: this.logger,
      };
      return executeInDocker(dockerOptions);
    }

    return this.executeLocally(command, config, startTime);
  }

  /**
   * Executes tests locally.
   */
  private async executeLocally(
    command: string,
    config: TestRunnerConfig,
    startTime: number
  ): Promise<TestSuiteResult> {
    this.logger.debug('Executing tests locally', { command });

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: config.workDir,
        timeout: config.overallTimeoutMs,
        maxBuffer: config.maxOutputBytes,
        env: { ...process.env, ...config.env },
      });

      const output = `${stdout}\n${stderr}`.trim();
      return await parseTestResults(output, startTime, config.workDir);
    } catch (err) {
      return this.handleTestError(err, startTime);
    }
  }

  /**
   * Handles test execution errors.
   */
  private handleTestError(err: unknown, startTime: number): TestSuiteResult {
    const durationMs = Date.now() - startTime;
    const execErr = err as {
      stdout?: string;
      stderr?: string;
      message?: string;
      killed?: boolean;
    };

    const output = [execErr.stdout ?? '', execErr.stderr ?? ''].join('\n').trim();

    // Check for timeout
    if (execErr.killed === true) {
      return {
        success: false,
        status: 'timeout',
        tests: [],
        passed: 0,
        failed: 0,
        skipped: 0,
        errored: 0,
        total: 0,
        durationMs,
        output,
        error: 'Test execution timed out',
      };
    }

    // Try to parse results even from error output
    const parsedResult = parseStdoutResults(output, durationMs);
    if (parsedResult.total > 0) {
      return parsedResult;
    }

    return {
      success: false,
      status: 'error',
      tests: [],
      passed: 0,
      failed: 0,
      skipped: 0,
      errored: 1,
      total: 0,
      durationMs,
      output,
      error: execErr.message ?? 'Test execution failed',
    };
  }

  /**
   * Creates a cancelled result.
   */
  private createCancelledResult(startTime: number): TestSuiteResult {
    return {
      success: false,
      status: 'error',
      tests: [],
      passed: 0,
      failed: 0,
      skipped: 0,
      errored: 0,
      total: 0,
      durationMs: Date.now() - startTime,
      output: '',
      error: 'Test execution was cancelled',
    };
  }
}

/** Creates a new test runner instance. */
export function createTestRunner(logger?: ILogger): TestRunner {
  return new TestRunner(logger);
}

/** Quick helper to run tests. */
export async function runTests(
  workDir: string,
  options?: Partial<TestRunnerConfig>
): Promise<TestSuiteResult> {
  const runner = createTestRunner();
  return runner.run({ workDir, ...DEFAULT_TEST_RUNNER_CONFIG, ...options });
}

/** Quick helper to detect test framework. */
export async function detectTestFramework(workDir: string): Promise<FrameworkDetectionResult> {
  const runner = createTestRunner();
  return runner.detectFramework(workDir);
}
