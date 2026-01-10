/**
 * Docker Sandbox Executor
 *
 * Provides isolated execution environment for self-development workflow.
 * Runs commands inside Docker containers with resource limits.
 *
 * @module workflows/self-development/docker-sandbox
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Result } from '../../core/index.js';
import { ok, err, createLogger } from '../../core/index.js';

const execFileAsync = promisify(execFile);
const logger = createLogger({ component: 'docker-sandbox' });

/** Default Docker image for Node.js projects. */
const DEFAULT_IMAGE = 'node:22-alpine';

/** Default timeout for sandboxed commands (10 minutes). */
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

/** Default memory limit (2GB). */
const DEFAULT_MEMORY_LIMIT = '2g';

/** Default CPU limit (2 cores). */
const DEFAULT_CPU_LIMIT = '2';

/** Maximum output size to capture (1MB). */
const MAX_OUTPUT_SIZE = 1024 * 1024;

/** Configuration for Docker sandbox. */
export interface SandboxConfig {
  /** Docker image to use. */
  readonly image?: string;
  /** Working directory inside container (mapped from host). */
  readonly workDir: string;
  /** Timeout in milliseconds. */
  readonly timeoutMs?: number;
  /** Memory limit (e.g., '2g', '512m'). */
  readonly memoryLimit?: string;
  /** CPU limit (e.g., '2', '0.5'). */
  readonly cpuLimit?: string;
  /** Whether to allow network access. */
  readonly networkEnabled?: boolean;
  /** Additional volume mounts (host:container). */
  readonly volumes?: readonly string[];
  /** Environment variables. */
  readonly env?: Record<string, string>;
}

/** Result of sandboxed command execution. */
export interface SandboxResult {
  /** Command that was executed. */
  readonly command: string;
  /** Exit code (0 = success). */
  readonly exitCode: number;
  /** Standard output (truncated if too large). */
  readonly stdout: string;
  /** Standard error (truncated if too large). */
  readonly stderr: string;
  /** Duration in milliseconds. */
  readonly durationMs: number;
  /** Whether the command succeeded (exitCode === 0). */
  readonly success: boolean;
  /** Container ID used for execution. */
  readonly containerId?: string;
}

/** Error thrown when sandbox execution fails. */
export class SandboxError extends Error {
  constructor(
    message: string,
    public readonly command: string,
    public readonly exitCode?: number,
    public readonly stderr?: string
  ) {
    super(message);
    this.name = 'SandboxError';
  }
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
 * Check if Docker is available on the system.
 */
export async function isDockerAvailable(): Promise<boolean> {
  try {
    await execFileAsync('docker', ['version'], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Build Docker run command arguments.
 */
function buildDockerArgs(config: SandboxConfig, command: string): string[] {
  const args: string[] = ['run', '--rm'];

  // Resource limits
  const memory = config.memoryLimit ?? DEFAULT_MEMORY_LIMIT;
  const cpu = config.cpuLimit ?? DEFAULT_CPU_LIMIT;
  args.push(`--memory=${memory}`, `--cpus=${cpu}`);

  // Network isolation (default: disabled)
  if (config.networkEnabled !== true) {
    args.push('--network=none');
  }

  // Security: run as non-root, drop capabilities
  args.push('--user=node', '--cap-drop=ALL');

  // Read-only root filesystem with tmpfs for temp files
  args.push('--read-only', '--tmpfs=/tmp:rw,noexec,nosuid,size=100m');

  // Mount working directory
  args.push(`-v=${config.workDir}:/workspace:rw`);
  args.push('-w=/workspace');

  // Additional volumes
  if (config.volumes !== undefined) {
    for (const vol of config.volumes) {
      args.push(`-v=${vol}`);
    }
  }

  // Environment variables
  if (config.env !== undefined) {
    for (const [key, value] of Object.entries(config.env)) {
      args.push(`-e=${key}=${value}`);
    }
  }

  // Node-specific env for pnpm
  args.push('-e=HOME=/tmp', '-e=npm_config_cache=/tmp/.npm');

  // Image and command
  const image = config.image ?? DEFAULT_IMAGE;
  args.push(image);
  args.push('sh', '-c', command);

  return args;
}

/** Error object shape from execFile. */
interface ExecError {
  readonly code?: string | number;
  readonly stdout?: string;
  readonly stderr?: string;
  readonly message: string;
  readonly killed?: boolean;
}

/**
 * Execute a command inside a Docker sandbox.
 */
export async function executeSandboxed(
  command: string,
  config: SandboxConfig
): Promise<Result<SandboxResult, SandboxError>> {
  const startTime = Date.now();
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const dockerAvailable = await isDockerAvailable();
  if (!dockerAvailable) {
    return err(new SandboxError('Docker is not available', command));
  }

  const dockerArgs = buildDockerArgs(config, command);
  logger.debug('Executing sandboxed command', { command, config });

  try {
    const { stdout, stderr } = await execFileAsync('docker', dockerArgs, {
      timeout: timeoutMs,
      maxBuffer: MAX_OUTPUT_SIZE * 2,
    });

    const result: SandboxResult = {
      command,
      exitCode: 0,
      stdout: truncateOutput(stdout),
      stderr: truncateOutput(stderr),
      durationMs: Date.now() - startTime,
      success: true,
    };

    logger.debug('Sandboxed command succeeded', { command, durationMs: result.durationMs });
    return ok(result);
  } catch (error) {
    return handleExecError(command, error as ExecError, Date.now() - startTime, timeoutMs);
  }
}

/**
 * Handle execution errors.
 */
function handleExecError(
  command: string,
  execError: ExecError,
  durationMs: number,
  timeoutMs: number
): Result<SandboxResult, SandboxError> {
  // Handle timeout
  if (execError.killed === true) {
    logger.warn('Sandboxed command timed out', { command, timeoutMs });
    return err(new SandboxError(`Command timed out after ${String(timeoutMs)}ms`, command));
  }

  // Handle non-zero exit code (returns result, not error)
  if (typeof execError.code === 'number') {
    const result: SandboxResult = {
      command,
      exitCode: execError.code,
      stdout: truncateOutput(execError.stdout ?? ''),
      stderr: truncateOutput(execError.stderr ?? ''),
      durationMs,
      success: false,
    };
    logger.debug('Sandboxed command failed', { command, exitCode: execError.code });
    return ok(result);
  }

  // Handle other errors
  const sandboxError = new SandboxError(
    `Sandbox execution failed: ${execError.message}`,
    command,
    undefined,
    execError.stderr
  );
  logger.error('Sandbox error', sandboxError, { command });
  return err(sandboxError);
}

/**
 * Execute pnpm script in sandbox.
 */
export async function executePnpmSandboxed(
  script: string,
  config: Omit<SandboxConfig, 'networkEnabled'>
): Promise<Result<SandboxResult, SandboxError>> {
  // pnpm needs network for install, but not for verify commands
  const needsNetwork = script === 'install' || script === 'add' || script === 'update';
  return executeSandboxed(`pnpm ${script}`, {
    ...config,
    networkEnabled: needsNetwork,
  });
}

/**
 * Run verification checks in sandbox.
 */
export interface SandboxVerificationResult {
  readonly name: string;
  readonly command: string;
  readonly passed: boolean;
  readonly durationMs: number;
  readonly output?: string;
  readonly error?: string;
}

/**
 * Run a single verification check in sandbox.
 */
export async function runSandboxedVerification(
  name: string,
  script: string,
  config: Omit<SandboxConfig, 'networkEnabled'>
): Promise<SandboxVerificationResult> {
  const result = await executePnpmSandboxed(script, config);

  if (!result.ok) {
    return {
      name,
      command: `pnpm ${script}`,
      passed: false,
      durationMs: 0,
      error: result.error.message,
    };
  }

  const sandboxResult = result.value;
  const base = {
    name,
    command: `pnpm ${script}`,
    passed: sandboxResult.success,
    durationMs: sandboxResult.durationMs,
  };

  if (!sandboxResult.success) {
    return { ...base, output: sandboxResult.stdout, error: sandboxResult.stderr };
  }

  return base;
}

/**
 * Run all verification checks in sandbox.
 */
export async function runAllSandboxedVerifications(
  workDir: string
): Promise<SandboxVerificationResult[]> {
  const config: Omit<SandboxConfig, 'networkEnabled'> = { workDir };
  const checks = ['typecheck', 'lint', 'test', 'build'];
  const results: SandboxVerificationResult[] = [];

  for (const check of checks) {
    const result = await runSandboxedVerification(check, check, config);
    results.push(result);

    if (!result.passed) {
      logger.warn('Sandboxed verification failed, stopping', { check });
      break;
    }
  }

  return results;
}
