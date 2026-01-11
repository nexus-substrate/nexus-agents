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
import { createLogger } from '../../core/index.js';
import type {
  ISandboxExecutor,
  SandboxExecutionOptions,
  SandboxResult,
  PolicyEvaluation,
  PolicyViolation,
  ResourceUsage,
  ResourceLimits,
} from './sandbox-types.js';
import { DEFAULT_RESOURCE_LIMITS } from './sandbox-types.js';
import { validateCommand, validateArgs } from './command-allowlist.js';

const execFileAsync = promisify(execFile);
const logger = createLogger({ component: 'docker-sandbox' });

/** Default Docker image for execution. */
const DEFAULT_IMAGE = 'node:22-alpine';

/** Maximum output size to capture (1MB). */
const MAX_OUTPUT_SIZE = 1024 * 1024;

/** Docker availability check result (cached). */
let dockerAvailableCache: boolean | null = null;

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
 * Check if Docker is available on the system.
 */
export async function isDockerAvailable(): Promise<boolean> {
  if (dockerAvailableCache !== null) {
    return dockerAvailableCache;
  }

  try {
    await execFileAsync('docker', ['version'], { timeout: 5000 });
    dockerAvailableCache = true;
    return true;
  } catch {
    dockerAvailableCache = false;
    return false;
  }
}

/**
 * Reset Docker availability cache (for testing).
 */
export function resetDockerCache(): void {
  dockerAvailableCache = null;
}

/**
 * Convert bytes to Docker memory format.
 */
function bytesToDockerMemory(bytes: number): string {
  const GB = 1024 * 1024 * 1024;
  const MB = 1024 * 1024;
  const KB = 1024;

  if (bytes >= GB) {
    return `${String(Math.floor(bytes / GB))}g`;
  }
  if (bytes >= MB) {
    return `${String(Math.floor(bytes / MB))}m`;
  }
  return `${String(Math.floor(bytes / KB))}k`;
}

/**
 * Truncate output if it exceeds the maximum size.
 */
function truncateOutput(output: string, maxSize: number = MAX_OUTPUT_SIZE): string {
  if (output.length <= maxSize) return output;
  const truncated = output.slice(0, maxSize);
  return `${truncated}\n... [truncated ${String(output.length - maxSize)} bytes]`;
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
    const startTime = Date.now();

    // First validate command
    const evaluation = this.validate(command, args, options);
    if (!evaluation.allowed) {
      return this.createDeniedResult(evaluation, startTime);
    }

    // Check Docker availability
    const dockerAvailable = await isDockerAvailable();
    if (!dockerAvailable) {
      return this.createDockerUnavailableResult(evaluation, startTime);
    }

    // Build and execute Docker command
    const limits = { ...DEFAULT_RESOURCE_LIMITS, ...options.policy.limits, ...options.limits };
    const dockerArgs = this.buildDockerArgs(command, args, options, limits);

    try {
      const result = await this.executeDocker(dockerArgs, limits.maxWallTimeMs);
      return this.createSuccessResult(result, evaluation, startTime);
    } catch (error) {
      return this.createErrorResult(error, evaluation, startTime, limits.maxWallTimeMs);
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
   * Create a denied result when policy prevents execution.
   */
  private createDeniedResult(evaluation: PolicyEvaluation, startTime: number): SandboxResult {
    logger.warn('Docker sandbox denied execution', {
      policy: evaluation.policyId,
      reason: evaluation.reason,
    });

    return {
      success: false,
      exitCode: 126,
      stdout: '',
      stderr: `Sandbox policy denied execution: ${evaluation.reason ?? 'Unknown reason'}`,
      durationMs: Date.now() - startTime,
      resourceUsage: this.createEmptyResourceUsage(),
      policyEvaluation: evaluation,
    };
  }

  /**
   * Create result when Docker is not available.
   */
  private createDockerUnavailableResult(
    evaluation: PolicyEvaluation,
    startTime: number
  ): SandboxResult {
    logger.error('Docker is not available for sandbox execution');

    return {
      success: false,
      exitCode: 127,
      stdout: '',
      stderr: 'Docker is not available. Install Docker to use container sandbox mode.',
      durationMs: Date.now() - startTime,
      resourceUsage: this.createEmptyResourceUsage(),
      policyEvaluation: evaluation,
    };
  }

  /**
   * Create a success result.
   */
  private createSuccessResult(
    result: { stdout: string; stderr: string },
    evaluation: PolicyEvaluation,
    startTime: number
  ): SandboxResult {
    const durationMs = Date.now() - startTime;

    logger.debug('Docker sandbox execution succeeded', { durationMs });

    return {
      success: true,
      exitCode: 0,
      stdout: result.stdout,
      stderr: result.stderr,
      durationMs,
      resourceUsage: {
        memoryBytes: 0, // Docker doesn't report per-container easily
        cpuTimeMs: 0,
        processCount: 1,
        outputBytes: result.stdout.length + result.stderr.length,
        wallTimeMs: durationMs,
      },
      policyEvaluation: evaluation,
    };
  }

  /**
   * Create an error result.
   */
  private createErrorResult(
    error: unknown,
    evaluation: PolicyEvaluation,
    startTime: number,
    timeoutMs: number
  ): SandboxResult {
    const durationMs = Date.now() - startTime;
    const execError = this.parseExecError(error);

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
      resourceUsage: {
        memoryBytes: 0,
        cpuTimeMs: 0,
        processCount: 1,
        outputBytes: execError.stdout.length + execError.stderr.length,
        wallTimeMs: durationMs,
      },
      policyEvaluation: evaluation,
    };
  }

  /**
   * Parse execution error.
   */
  private parseExecError(error: unknown): {
    exitCode: number;
    stdout: string;
    stderr: string;
    isTimeout: boolean;
  } {
    const execError = error as {
      code?: number | string;
      stdout?: string;
      stderr?: string;
      message?: string;
      killed?: boolean;
    };

    return {
      exitCode: typeof execError.code === 'number' ? execError.code : 1,
      stdout: truncateOutput(execError.stdout ?? ''),
      stderr: truncateOutput(execError.stderr ?? execError.message ?? 'Unknown error'),
      isTimeout: execError.killed === true,
    };
  }

  /**
   * Create empty resource usage.
   */
  private createEmptyResourceUsage(): ResourceUsage {
    return {
      memoryBytes: 0,
      cpuTimeMs: 0,
      processCount: 0,
      outputBytes: 0,
      wallTimeMs: 0,
    };
  }
}

/**
 * Create a Docker sandbox executor with optional config.
 */
export function createDockerSandboxExecutor(config?: DockerSandboxConfig): DockerSandboxExecutor {
  return new DockerSandboxExecutor(config);
}
