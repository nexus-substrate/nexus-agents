/**
 * nexus-agents/security/sandbox - Docker Sandbox Executor
 *
 * Container-based isolated command execution using Docker.
 * Provides true process isolation with resource limits.
 *
 * @module security/sandbox/docker-sandbox-executor
 * (Source: Issue #175, Alignment Roadmap Phase 4)
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createLogger, getTimeProvider } from '../../core/index.js';
import type {
  ISandboxExecutor,
  SandboxExecutionOptions,
  SandboxResult,
  PolicyEvaluation,
  PolicyViolation,
  ResourceLimits,
} from './sandbox-types.js';
import { DEFAULT_RESOURCE_LIMITS } from './sandbox-types.js';
import { validateCommand, validateArgs } from './command-allowlist.js';
import {
  MAX_OUTPUT_SIZE,
  DEFAULT_IMAGE,
  isDockerAvailable,
  resetDockerCache,
  bytesToDockerMemory,
  truncateOutput,
  parseExecError,
  createDeniedResult,
  createDockerUnavailableResult,
  createResourceUsageFromOutput,
} from './docker-sandbox-helpers.js';

// Re-export for backward compatibility
export { isDockerAvailable, resetDockerCache };

const execFileAsync = promisify(execFile);
const logger = createLogger({ component: 'docker-sandbox' });

/**
 * Docker sandbox configuration.
 */
export interface DockerSandboxConfig {
  /** Docker image to use. */
  readonly image?: string;
  /** Whether to allow network access (default: false). */
  readonly networkEnabled?: boolean;
  /** Additional volume mounts (host:container). */
  readonly volumes?: readonly string[];
  /** User to run as in container (default: 'node'). */
  readonly user?: string;
}

/**
 * Docker-based sandbox executor.
 *
 * Runs commands in isolated Docker containers with:
 * - --cap-drop=ALL: No Linux capabilities
 * - --read-only: Read-only root filesystem
 * - --network=none: No network access (unless explicitly enabled)
 * - Resource limits: Memory and CPU constraints
 */
export class DockerSandboxExecutor implements ISandboxExecutor {
  readonly name = 'DockerSandboxExecutor';
  private readonly config: DockerSandboxConfig;

  constructor(config?: DockerSandboxConfig) {
    this.config = config ?? {};
  }

  /**
   * Execute a command in a Docker sandbox.
   */
  async execute(
    command: string,
    args: readonly string[],
    options: SandboxExecutionOptions
  ): Promise<SandboxResult> {
    const startTime = getTimeProvider().now();

    // First validate command
    const evaluation = this.validate(command, args, options);
    if (!evaluation.allowed) {
      return this.buildDeniedResult(evaluation, startTime);
    }

    // Check Docker availability
    const dockerAvailable = await isDockerAvailable();
    if (!dockerAvailable) {
      return this.buildDockerUnavailableResult(evaluation, startTime);
    }

    // Build and execute Docker command
    const limits = { ...DEFAULT_RESOURCE_LIMITS, ...options.policy.limits, ...options.limits };
    const dockerArgs = this.buildDockerArgs(command, args, options, limits);

    try {
      const result = await this.executeDocker(dockerArgs, limits.maxWallTimeMs);
      return this.buildSuccessResult(result, evaluation, startTime);
    } catch (error) {
      return this.buildErrorResult(error, evaluation, startTime, limits.maxWallTimeMs);
    }
  }

  /**
   * Validate a command without executing.
   */
  validate(
    command: string,
    args: readonly string[],
    options: SandboxExecutionOptions
  ): PolicyEvaluation {
    const policy = options.policy;
    const violations: PolicyViolation[] = [];

    // Validate command
    const cmdViolation = validateCommand(command, policy.allowedCommands);
    if (cmdViolation !== null) {
      violations.push(cmdViolation);
    }

    // Validate arguments
    const argsViolation = validateArgs(args);
    if (argsViolation !== null) {
      violations.push(argsViolation);
    }

    const result: PolicyEvaluation = {
      allowed: violations.length === 0,
      policyId: policy.id,
      violations,
    };

    if (violations.length > 0 && violations[0] !== undefined) {
      return { ...result, reason: violations[0].reason };
    }

    return result;
  }

  /**
   * Build Docker run command arguments.
   */
  private buildDockerArgs(
    command: string,
    args: readonly string[],
    options: SandboxExecutionOptions,
    limits: Required<ResourceLimits>
  ): string[] {
    const dockerArgs: string[] = ['run', '--rm'];

    this.addResourceArgs(dockerArgs, limits);
    this.addSecurityArgs(dockerArgs);
    this.addVolumeArgs(dockerArgs, options);
    this.addEnvArgs(dockerArgs, options);
    this.addCommandArgs(dockerArgs, command, args);

    return dockerArgs;
  }

  /**
   * Add resource limit arguments.
   */
  private addResourceArgs(dockerArgs: string[], limits: Required<ResourceLimits>): void {
    const memory = bytesToDockerMemory(limits.maxMemoryBytes);
    dockerArgs.push(`--memory=${memory}`, '--cpus=2');

    // Network isolation (default: disabled)
    if (this.config.networkEnabled !== true) {
      dockerArgs.push('--network=none');
    }
  }

  /**
   * Add security arguments.
   */
  private addSecurityArgs(dockerArgs: string[]): void {
    const user = this.config.user ?? 'node';
    dockerArgs.push(`--user=${user}`, '--cap-drop=ALL');
    dockerArgs.push('--read-only', '--tmpfs=/tmp:rw,noexec,nosuid,size=100m');
  }

  /**
   * Add volume mount arguments.
   */
  private addVolumeArgs(dockerArgs: string[], options: SandboxExecutionOptions): void {
    if (options.cwd !== undefined) {
      dockerArgs.push(`-v=${options.cwd}:/workspace:rw`, '-w=/workspace');
    }

    if (this.config.volumes !== undefined) {
      for (const vol of this.config.volumes) {
        dockerArgs.push(`-v=${vol}`);
      }
    }
  }

  /**
   * Add environment variable arguments.
   */
  private addEnvArgs(dockerArgs: string[], options: SandboxExecutionOptions): void {
    const allowedEnv = options.policy.allowedEnvVars;
    if (options.env !== undefined) {
      for (const [key, value] of Object.entries(options.env)) {
        if (allowedEnv.includes(key)) {
          dockerArgs.push(`-e=${key}=${value}`);
        }
      }
    }

    dockerArgs.push('-e=HOME=/tmp', '-e=npm_config_cache=/tmp/.npm');
  }

  /**
   * Add command and image arguments.
   */
  private addCommandArgs(dockerArgs: string[], command: string, args: readonly string[]): void {
    const image = this.config.image ?? DEFAULT_IMAGE;
    dockerArgs.push(image);

    const fullCommand = args.length > 0 ? `${command} ${args.join(' ')}` : command;
    dockerArgs.push('sh', '-c', fullCommand);
  }

  /**
   * Execute Docker command.
   */
  private async executeDocker(
    args: string[],
    timeoutMs: number
  ): Promise<{ stdout: string; stderr: string }> {
    logger.debug('Executing Docker command', { timeout: timeoutMs });

    const { stdout, stderr } = await execFileAsync('docker', args, {
      timeout: timeoutMs,
      maxBuffer: MAX_OUTPUT_SIZE * 2,
    });

    return {
      stdout: truncateOutput(stdout),
      stderr: truncateOutput(stderr),
    };
  }

  /**
   * Build a denied result when policy prevents execution.
   */
  private buildDeniedResult(evaluation: PolicyEvaluation, startTime: number): SandboxResult {
    logger.warn('Docker sandbox denied execution', {
      policy: evaluation.policyId,
      reason: evaluation.reason,
    });

    const deniedData = createDeniedResult(evaluation, getTimeProvider().now() - startTime);

    return {
      success: false,
      exitCode: deniedData.exitCode,
      stdout: deniedData.stdout,
      stderr: deniedData.stderr,
      durationMs: getTimeProvider().now() - startTime,
      resourceUsage: deniedData.resourceUsage,
      policyEvaluation: evaluation,
    };
  }

  /**
   * Build result when Docker is not available.
   */
  private buildDockerUnavailableResult(
    evaluation: PolicyEvaluation,
    startTime: number
  ): SandboxResult {
    logger.error('Docker is not available for sandbox execution');

    const unavailableData = createDockerUnavailableResult();

    return {
      success: false,
      exitCode: unavailableData.exitCode,
      stdout: unavailableData.stdout,
      stderr: unavailableData.stderr,
      durationMs: getTimeProvider().now() - startTime,
      resourceUsage: unavailableData.resourceUsage,
      policyEvaluation: evaluation,
    };
  }

  /**
   * Build a success result.
   */
  private buildSuccessResult(
    result: { stdout: string; stderr: string },
    evaluation: PolicyEvaluation,
    startTime: number
  ): SandboxResult {
    const durationMs = getTimeProvider().now() - startTime;

    logger.debug('Docker sandbox execution succeeded', { durationMs });

    return {
      success: true,
      exitCode: 0,
      stdout: result.stdout,
      stderr: result.stderr,
      durationMs,
      resourceUsage: createResourceUsageFromOutput(result.stdout, result.stderr, durationMs),
      policyEvaluation: evaluation,
    };
  }

  /**
   * Build an error result.
   */
  private buildErrorResult(
    error: unknown,
    evaluation: PolicyEvaluation,
    startTime: number,
    timeoutMs: number
  ): SandboxResult {
    const durationMs = getTimeProvider().now() - startTime;
    const execError = parseExecError(error);

    if (execError.isTimeout) {
      logger.warn('Docker sandbox execution timed out', { timeoutMs, durationMs });
    } else {
      logger.debug('Docker sandbox execution failed', { exitCode: execError.exitCode });
    }

    return {
      success: false,
      exitCode: execError.exitCode,
      stdout: execError.stdout,
      stderr: execError.stderr,
      durationMs,
      resourceUsage: createResourceUsageFromOutput(execError.stdout, execError.stderr, durationMs),
      policyEvaluation: evaluation,
    };
  }
}

/**
 * Create a Docker sandbox executor with optional config.
 */
export function createDockerSandboxExecutor(config?: DockerSandboxConfig): DockerSandboxExecutor {
  return new DockerSandboxExecutor(config);
}
