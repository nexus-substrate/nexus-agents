/**
 * nexus-agents/security/sandbox - Type Definitions
 *
 * Types for agent execution sandboxing and isolation.
 *
 * @module security/sandbox/sandbox-types
 * (Source: Issue #162, Alignment Roadmap Phase 4)
 */

/**
 * Sandbox execution mode.
 *
 * - `none`: no isolation; for development only.
 * - `policy`: rule-based enforcement with no process isolation. Catches
 *   policy violations but a misbehaving process can still touch the host.
 * - `container`: Docker-based OS-level isolation. Strongest, but requires
 *   Docker on the host.
 * - `deno`: process-level permission gating via Deno's `--allow-*` flags
 *   (#1898). Weaker than container — same OS, just process permissions —
 *   but works without Docker (Mac without Docker Desktop, locked-down CI
 *   runners). No CPU/memory limits.
 */
export type SandboxMode = 'none' | 'policy' | 'container' | 'deno';

/**
 * Security capability that can be restricted.
 */
export type SecurityCapability =
  | 'network'
  | 'filesystem_read'
  | 'filesystem_write'
  | 'process_spawn'
  | 'env_access';

/**
 * Resource limits for sandboxed execution.
 */
export interface ResourceLimits {
  /** Maximum memory in bytes (default: 512MB). */
  readonly maxMemoryBytes?: number;
  /** Maximum CPU time in milliseconds. */
  readonly maxCpuTimeMs?: number;
  /** Maximum number of child processes. */
  readonly maxProcesses?: number;
  /** Maximum output buffer size in bytes. */
  readonly maxOutputBytes?: number;
  /** Maximum execution time in milliseconds. */
  readonly maxWallTimeMs?: number;
}

/**
 * Default resource limits.
 */
export const DEFAULT_RESOURCE_LIMITS: Required<ResourceLimits> = {
  maxMemoryBytes: 512 * 1024 * 1024, // 512MB
  maxCpuTimeMs: 60 * 1000, // 1 minute CPU time
  maxProcesses: 10,
  maxOutputBytes: 10 * 1024 * 1024, // 10MB
  maxWallTimeMs: 5 * 60 * 1000, // 5 minutes wall time
};

/**
 * Path access rule for filesystem sandboxing.
 */
export interface PathAccessRule {
  /** Path pattern (supports glob). */
  readonly path: string;
  /** Access mode: 'read' | 'write' | 'none'. */
  readonly access: 'read' | 'write' | 'none';
}

/**
 * Sandbox execution policy.
 */
export interface SandboxPolicy {
  /** Unique policy identifier. */
  readonly id: string;
  /** Human-readable policy name. */
  readonly name: string;
  /** Sandbox execution mode. */
  readonly mode: SandboxMode;
  /** Allowed commands (empty = all denied). */
  readonly allowedCommands: readonly string[];
  /** Allowed environment variables to pass through. */
  readonly allowedEnvVars: readonly string[];
  /** Path access rules. */
  readonly pathRules: readonly PathAccessRule[];
  /** Enabled capabilities. */
  readonly capabilities: readonly SecurityCapability[];
  /** Resource limits. */
  readonly limits: ResourceLimits;
}

/**
 * Result of sandbox policy evaluation.
 */
export interface PolicyEvaluation {
  /** Whether the operation is allowed. */
  readonly allowed: boolean;
  /** Denial reason if not allowed. */
  readonly reason?: string;
  /** Policy that was applied. */
  readonly policyId: string;
  /** Violations found. */
  readonly violations: readonly PolicyViolation[];
}

/**
 * A specific policy violation.
 */
export interface PolicyViolation {
  /** Type of violation. */
  readonly type: 'command' | 'env' | 'path' | 'capability' | 'resource';
  /** What was denied. */
  readonly denied: string;
  /** Explanation. */
  readonly reason: string;
}

/**
 * Sandbox execution result.
 */
export interface SandboxResult {
  /** Whether execution succeeded. */
  readonly success: boolean;
  /** Exit code from the command. */
  readonly exitCode: number;
  /** Standard output. */
  readonly stdout: string;
  /** Standard error. */
  readonly stderr: string;
  /** Execution duration in milliseconds. */
  readonly durationMs: number;
  /** Resource usage metrics. */
  readonly resourceUsage: ResourceUsage;
  /** Policy evaluation result. */
  readonly policyEvaluation: PolicyEvaluation;
}

/**
 * Resource usage metrics from sandboxed execution.
 */
export interface ResourceUsage {
  /** Memory used in bytes. */
  readonly memoryBytes: number;
  /** CPU time used in milliseconds. */
  readonly cpuTimeMs: number;
  /** Number of processes spawned. */
  readonly processCount: number;
  /** Output bytes generated. */
  readonly outputBytes: number;
  /** Wall time in milliseconds. */
  readonly wallTimeMs: number;
}

/**
 * Interface for sandbox executors.
 */
export interface ISandboxExecutor {
  /** Executor name for logging. */
  readonly name: string;
  /** Execute a command in the sandbox. */
  execute(
    command: string,
    args: readonly string[],
    options: SandboxExecutionOptions
  ): Promise<SandboxResult>;
  /** Validate a command without executing. */
  validate(
    command: string,
    args: readonly string[],
    options: SandboxExecutionOptions
  ): PolicyEvaluation;
}

/**
 * Options for sandboxed execution.
 */
export interface SandboxExecutionOptions {
  /** Working directory. */
  readonly cwd?: string;
  /** Environment variables (will be filtered by policy). */
  readonly env?: Record<string, string>;
  /** Policy to apply. */
  readonly policy: SandboxPolicy;
  /** Override resource limits. */
  readonly limits?: Partial<ResourceLimits>;
}

/**
 * Sandbox executor configuration.
 */
export interface SandboxConfig {
  /** Default policy to use. */
  readonly defaultPolicy: SandboxPolicy;
  /** Whether to log policy violations. */
  readonly logViolations: boolean;
  /** Whether to enforce policies (false = warn only). */
  readonly enforce: boolean;
}
