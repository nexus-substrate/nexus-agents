/**
 * nexus-agents/security/sandbox - Sandbox Executor
 *
 * Policy-enforcing command executor with resource limits.
 *
 * @module security/sandbox/sandbox-executor
 * (Source: Issue #162, Alignment Roadmap Phase 4)
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve, normalize } from 'node:path';
import { createLogger, getTimeProvider } from '../../core/index.js';
import type {
  ISandboxExecutor,
  SandboxExecutionOptions,
  SandboxResult,
  PolicyEvaluation,
  PolicyViolation,
  ResourceUsage,
  SandboxConfig,
  SandboxPolicy,
} from './sandbox-types.js';
import { DEFAULT_RESOURCE_LIMITS } from './sandbox-types.js';
import { validateCommand, validateArgs } from './command-allowlist.js';
import { sanitizeEnvironment, createMinimalEnv } from './env-sanitizer.js';
import { STANDARD_POLICY } from './default-policies.js';

const execFileAsync = promisify(execFile);
const logger = createLogger({ component: 'sandbox-executor' });

/**
 * Parsed execution error structure.
 */
interface ParsedExecError {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly isTimeout: boolean;
}

/**
 * Parse an unknown error into a structured format.
 */
function parseExecError(error: unknown): ParsedExecError {
  const execError = error as {
    code?: number | string;
    stdout?: string;
    stderr?: string;
    message?: string;
    killed?: boolean;
  };

  const isTimeout = execError.killed === true && execError.code === 'ETIMEDOUT';
  const exitCode = typeof execError.code === 'number' ? execError.code : 1;

  return {
    exitCode,
    stdout: execError.stdout ?? '',
    stderr: execError.stderr ?? execError.message ?? 'Unknown error',
    isTimeout,
  };
}

/**
 * Default sandbox configuration.
 */
const DEFAULT_CONFIG: SandboxConfig = {
  defaultPolicy: STANDARD_POLICY,
  logViolations: true,
  enforce: true,
};

/**
 * Policy-enforcing sandbox executor.
 *
 * Validates commands and environment before execution,
 * applies resource limits, and logs violations.
 */
export class PolicySandboxExecutor implements ISandboxExecutor {
  readonly name = 'PolicySandboxExecutor';
  private readonly config: SandboxConfig;

  constructor(config?: Partial<SandboxConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Execute a command in the sandbox.
   */
  async execute(
    command: string,
    args: readonly string[],
    options: SandboxExecutionOptions
  ): Promise<SandboxResult> {
    const startTime = getTimeProvider().now();
    const policy = options.policy;

    // Validate command and args
    const evaluation = this.validate(command, args, options);

    // If not allowed and enforcement is on, return failure
    if (!evaluation.allowed && this.config.enforce) {
      return this.createDeniedResult(command, args, evaluation, startTime);
    }

    // Log violations even if not enforcing
    if (!evaluation.allowed && this.config.logViolations) {
      this.logViolations(command, evaluation);
    }

    // Prepare execution environment
    const execEnv = this.prepareEnvironment(options, policy);
    const limits = { ...DEFAULT_RESOURCE_LIMITS, ...policy.limits, ...options.limits };

    try {
      const result = await this.executeWithLimits(command, args, options.cwd, execEnv, limits);
      return this.createSuccessResult(command, args, result, evaluation, startTime);
    } catch (error) {
      return this.createErrorResult(command, args, error, evaluation, startTime);
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

    // Validate working directory
    const cwdViolation = this.validateCwd(options.cwd, policy);
    if (cwdViolation !== null) {
      violations.push(cwdViolation);
    }

    const result: PolicyEvaluation = {
      allowed: violations.length === 0,
      policyId: policy.id,
      violations,
    };

    // Only add reason if there are violations
    if (violations.length > 0 && violations[0] !== undefined) {
      return { ...result, reason: violations[0].reason };
    }

    return result;
  }

  /**
   * Validates working directory against policy.
   */
  private validateCwd(cwd: string | undefined, policy: SandboxPolicy): PolicyViolation | null {
    if (cwd === undefined) return null;

    const normalizedCwd = normalize(resolve(cwd));

    // Check if cwd is allowed by path rules
    const isAllowed = policy.pathRules.some((rule) => {
      const normalizedRule = normalize(resolve(rule.path));
      return normalizedCwd.startsWith(normalizedRule) && rule.access !== 'none';
    });

    if (!isAllowed) {
      return {
        type: 'path',
        denied: cwd,
        reason: `Working directory '${cwd}' is not allowed by policy`,
      };
    }

    return null;
  }

  /**
   * Prepares environment variables for execution.
   */
  private prepareEnvironment(
    options: SandboxExecutionOptions,
    policy: SandboxPolicy
  ): Record<string, string> {
    // Start with minimal env
    const baseEnv = createMinimalEnv(options.cwd);

    // Sanitize process.env and merge with additional env
    const sanitized = sanitizeEnvironment(process.env, policy.allowedEnvVars, options.env);

    // Log any blocked env vars
    if (sanitized.blocked.length > 0 && this.config.logViolations) {
      logger.debug('Blocked environment variables', { blocked: sanitized.blocked });
    }

    return { ...baseEnv, ...sanitized.env };
  }

  /**
   * Executes command with resource limits.
   */
  private async executeWithLimits(
    command: string,
    args: readonly string[],
    cwd: string | undefined,
    env: Record<string, string>,
    limits: Required<typeof DEFAULT_RESOURCE_LIMITS>
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const { stdout, stderr } = await execFileAsync(command, [...args], {
      cwd: cwd ?? process.cwd(),
      timeout: limits.maxWallTimeMs,
      maxBuffer: limits.maxOutputBytes,
      env,
      // Note: Node.js doesn't support memory/CPU limits directly
      // For full isolation, use container mode
    });

    return { stdout, stderr, exitCode: 0 };
  }

  /**
   * Creates a denied result when policy prevents execution.
   */
  private createDeniedResult(
    command: string,
    _args: readonly string[],
    evaluation: PolicyEvaluation,
    startTime: number
  ): SandboxResult {
    logger.warn('Sandbox policy denied execution', {
      command,
      policy: evaluation.policyId,
      reason: evaluation.reason,
    });

    return {
      success: false,
      exitCode: 126, // Permission denied exit code
      stdout: '',
      stderr: `Sandbox policy denied execution: ${evaluation.reason ?? 'Unknown reason'}`,
      durationMs: getTimeProvider().now() - startTime,
      resourceUsage: this.createEmptyResourceUsage(),
      policyEvaluation: evaluation,
    };
  }

  /**
   * Creates a success result.
   */
  private createSuccessResult(
    command: string,
    _args: readonly string[],
    result: { stdout: string; stderr: string; exitCode: number },
    evaluation: PolicyEvaluation,
    startTime: number
  ): SandboxResult {
    const durationMs = getTimeProvider().now() - startTime;

    logger.debug('Sandbox execution succeeded', { command, durationMs });

    return {
      success: result.exitCode === 0,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      durationMs,
      resourceUsage: {
        memoryBytes: 0, // Not tracked in policy mode
        cpuTimeMs: 0,
        processCount: 1,
        outputBytes: result.stdout.length + result.stderr.length,
        wallTimeMs: durationMs,
      },
      policyEvaluation: evaluation,
    };
  }

  /**
   * Creates an error result when execution fails.
   */
  private createErrorResult(
    command: string,
    _args: readonly string[],
    error: unknown,
    evaluation: PolicyEvaluation,
    startTime: number
  ): SandboxResult {
    const execError = parseExecError(error);
    const durationMs = getTimeProvider().now() - startTime;

    this.logExecutionError(command, execError, durationMs);

    return {
      success: false,
      exitCode: execError.exitCode,
      stdout: execError.stdout,
      stderr: execError.stderr,
      durationMs,
      resourceUsage: this.createErrorResourceUsage(execError, durationMs),
      policyEvaluation: evaluation,
    };
  }

  /**
   * Logs execution error.
   */
  private logExecutionError(command: string, execError: ParsedExecError, durationMs: number): void {
    if (execError.isTimeout) {
      logger.warn('Sandbox execution timed out', { command, durationMs });
    } else {
      logger.debug('Sandbox execution failed', {
        command,
        exitCode: execError.exitCode,
        durationMs,
      });
    }
  }

  /**
   * Creates resource usage for error results.
   */
  private createErrorResourceUsage(error: ParsedExecError, wallTimeMs: number): ResourceUsage {
    return {
      memoryBytes: 0,
      cpuTimeMs: 0,
      processCount: 1,
      outputBytes: error.stdout.length + error.stderr.length,
      wallTimeMs,
    };
  }

  /**
   * Creates empty resource usage for denied executions.
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

  /**
   * Logs policy violations.
   */
  private logViolations(command: string, evaluation: PolicyEvaluation): void {
    for (const violation of evaluation.violations) {
      logger.warn('Sandbox policy violation', {
        command,
        type: violation.type,
        denied: violation.denied,
        reason: violation.reason,
        policy: evaluation.policyId,
      });
    }
  }
}

/**
 * Create a sandbox executor with optional config.
 */
export function createSandboxExecutor(config?: Partial<SandboxConfig>): ISandboxExecutor {
  return new PolicySandboxExecutor(config);
}
