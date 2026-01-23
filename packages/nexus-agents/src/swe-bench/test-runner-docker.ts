/**
 * nexus-agents/swe-bench - Test Runner Docker Execution
 *
 * Handles Docker-isolated test execution for SWE-bench evaluation.
 *
 * @module swe-bench/test-runner-docker
 * (Source: Issue #257 - SWE-Bench Evaluation)
 */

import { spawn, type ChildProcess } from 'node:child_process';
import type { ILogger } from '../core/logger.js';
import type { TestRunnerConfig, TestSuiteResult } from './test-runner-types.js';
import { parseTestResults } from './test-runner-parser.js';

// ============================================================================
// Types
// ============================================================================

/**
 * State for Docker execution tracking.
 */
export interface DockerExecutionState {
  currentProcess: ChildProcess | null;
  isCancelled: boolean;
}

/**
 * Callback for creating cancelled results.
 */
export type CancelledResultFactory = (startTime: number) => TestSuiteResult;

/**
 * Callback for handling test errors.
 */
export type ErrorHandler = (err: unknown, startTime: number) => TestSuiteResult;

/**
 * Options for executeInDocker function.
 */
export interface ExecuteInDockerOptions {
  command: string;
  config: TestRunnerConfig;
  startTime: number;
  state: DockerExecutionState;
  createCancelledResult: CancelledResultFactory;
  handleTestError: ErrorHandler;
  logger: ILogger;
}

// ============================================================================
// Docker Arguments
// ============================================================================

/**
 * Builds Docker run arguments for test execution.
 */
export function buildDockerArgs(
  command: string,
  config: TestRunnerConfig,
  image: string
): string[] {
  const args = [
    'run',
    '--rm',
    '-v',
    `${config.workDir}:/workspace`,
    '-w',
    '/workspace',
    '--network=none',
    '--memory=2g',
    '--cpus=2',
  ];

  // Add environment variables
  if (config.env !== undefined) {
    for (const [key, value] of Object.entries(config.env)) {
      args.push('-e', `${key}=${value}`);
    }
  }

  args.push(image, 'sh', '-c', command);

  return args;
}

// ============================================================================
// Output Capture
// ============================================================================

/**
 * Attaches output capture handlers to a Docker process.
 */
function attachOutputCapture(
  proc: ChildProcess,
  maxOutputBytes: number
): { getStdout: () => string; getStderr: () => string } {
  let stdout = '';
  let stderr = '';

  if (proc.stdout !== null) {
    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
      if (stdout.length > maxOutputBytes) {
        stdout = stdout.slice(0, maxOutputBytes);
      }
    });
  }

  if (proc.stderr !== null) {
    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
      if (stderr.length > maxOutputBytes) {
        stderr = stderr.slice(0, maxOutputBytes);
      }
    });
  }

  return {
    getStdout: () => stdout,
    getStderr: () => stderr,
  };
}

// ============================================================================
// Docker Execution
// ============================================================================

/**
 * Executes tests in a Docker container.
 */
export function executeInDocker(options: ExecuteInDockerOptions): Promise<TestSuiteResult> {
  const { command, config, startTime, state, createCancelledResult, handleTestError, logger } =
    options;
  const image = config.dockerImage ?? 'python:3.11-slim';
  logger.debug('Executing tests in Docker', { image, command });

  const dockerArgs = buildDockerArgs(command, config, image);

  return new Promise((resolve) => {
    const proc = spawn('docker', dockerArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    state.currentProcess = proc;
    const { getStdout, getStderr } = attachOutputCapture(proc, config.maxOutputBytes);

    const timeoutId = setTimeout(() => {
      proc.kill('SIGTERM');
    }, config.overallTimeoutMs);

    proc.on('close', () => {
      clearTimeout(timeoutId);
      state.currentProcess = null;

      if (state.isCancelled) {
        resolve(createCancelledResult(startTime));
        return;
      }

      const output = `${getStdout()}\n${getStderr()}`.trim();
      void parseTestResults(output, startTime, config.workDir).then(resolve);
    });

    proc.on('error', (err) => {
      clearTimeout(timeoutId);
      state.currentProcess = null;
      resolve(handleTestError(err, startTime));
    });
  });
}
