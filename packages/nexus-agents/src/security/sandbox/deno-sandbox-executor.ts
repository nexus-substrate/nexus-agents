/* eslint-disable @typescript-eslint/no-deprecated -- Self-references inside
 * the deprecated DenoSandboxExecutor class body are unavoidable (#2499). */
/**
 * nexus-agents/security/sandbox - Deno Sandbox Executor
 *
 * Process-level permission sandbox using Deno's `--allow-*` flags (#1898).
 *
 * Deno provides per-process gating for filesystem read/write, network,
 * subprocess spawn, and env access. We translate the existing SandboxPolicy
 * into the corresponding flag set and then run the target command via
 * `deno run --allow-X dlx-bridge.ts -- <cmd> <args>` — Deno acts as a
 * permission supervisor over a small bridge script that re-spawns the
 * actual command with the gated permissions.
 *
 * **Tradeoffs vs Docker** (intentional, documented in SandboxMode):
 *   - Process-level isolation (same OS) vs container-level (separate kernel
 *     namespaces). Docker is stronger.
 *   - No CPU/memory cgroup limits — Deno doesn't expose those.
 *   - Network filtering is coarse: `--allow-net` is on/off in Phase 1;
 *     per-host filtering is Phase 2.
 *   - Works without Docker — Mac without Docker Desktop, locked-down CI
 *     runners, etc.
 *
 * @module security/sandbox/deno-sandbox-executor
 * (Source: Issue #1898 — WASM/Deno fallback for users without Docker)
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { createLogger, getTimeProvider } from '../../core/index.js';

import type {
  ISandboxExecutor,
  PolicyEvaluation,
  PolicyViolation,
  SandboxExecutionOptions,
  SandboxResult,
} from './sandbox-types.js';
import { DEFAULT_RESOURCE_LIMITS } from './sandbox-types.js';
import { validateCommand, validateArgs } from './command-allowlist.js';
import {
  createDeniedResult,
  createResourceUsageFromOutput,
  parseExecError,
  truncateOutput,
} from './docker-sandbox-helpers.js';
import {
  isDenoAvailable,
  policyToDenoFlags,
  resetDenoCache,
  collectPolicyConfigurationWarnings,
} from './deno-sandbox-helpers.js';

// Re-export for symmetry with docker-sandbox-executor.
export { isDenoAvailable, resetDenoCache };

const execFileAsync = promisify(execFile);
const logger = createLogger({ component: 'deno-sandbox' });

/** Configuration knobs for the Deno executor. */
export interface DenoSandboxConfig {
  /**
   * If true, log the assembled deno command line at info level. Useful for
   * debugging permission-flag mismatches; off by default to avoid leaking
   * env-var names into logs.
   */
  readonly logCommandLine?: boolean;
}

/**
 * Result from `deno run -- <cmd> <args>`.
 */
interface DenoExecOutcome {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * Result when Deno isn't installed on the host.
 */
function createDenoUnavailableResult(): {
  exitCode: number;
  stdout: string;
  stderr: string;
} {
  return {
    exitCode: 127,
    stdout: '',
    stderr: 'Deno is not available. Install Deno (>=2.0) to use the deno sandbox mode.',
  };
}

/**
 * Deno-based sandbox executor.
 *
 * Runs the target command under Deno's permission system. The flag set is
 * derived from the SandboxPolicy via `policyToDenoFlags(...)`. Capabilities
 * not granted by the policy are denied at the process boundary by Deno
 * itself — there is no need for a wrapper script in v1 because we use
 * `--allow-run=<cmd>` and Deno-spawn the target as a subprocess.
 *
 * @deprecated [#2499] Unused in production — only `validateCommand` /
 * `validateArgs` from `cli/sandbox-exec.ts` consume the sandbox layer.
 * Slated for removal one minor release after the deprecation lands;
 * see [#2499](https://github.com/williamzujkowski/nexus-agents/issues/2499)
 * for migration. The product direction (epic [#2500]) is "compatible
 * with running inside a host-provided sandbox" — not "ship our own
 * sandbox runtime."
 */
export class DenoSandboxExecutor implements ISandboxExecutor {
  readonly name = 'DenoSandboxExecutor';
  private readonly config: DenoSandboxConfig;

  constructor(config?: DenoSandboxConfig) {
    this.config = config ?? {};
  }

  async execute(
    command: string,
    args: readonly string[],
    options: SandboxExecutionOptions
  ): Promise<SandboxResult> {
    const startTime = getTimeProvider().now();

    const evaluation = this.validate(command, args, options);
    if (!evaluation.allowed) {
      return this.buildDeniedResult(evaluation, startTime);
    }

    const denoAvailable = await isDenoAvailable();
    if (!denoAvailable) {
      return this.buildDenoUnavailableResult(evaluation, startTime);
    }

    const limits = { ...DEFAULT_RESOURCE_LIMITS, ...options.policy.limits, ...options.limits };
    const denoArgs = buildDenoArgs(command, args, options);

    if (this.config.logCommandLine === true) {
      logger.info('Deno sandbox invocation', { args: denoArgs });
    }

    try {
      const outcome = await runDeno(denoArgs, limits.maxWallTimeMs);
      return this.buildSuccessResult(outcome, evaluation, startTime);
    } catch (error: unknown) {
      return this.buildErrorResult(error, evaluation, startTime);
    }
  }

  validate(
    command: string,
    args: readonly string[],
    options: SandboxExecutionOptions
  ): PolicyEvaluation {
    const policy = options.policy;
    const violations: PolicyViolation[] = [];

    const cmdViolation = validateCommand(command, policy.allowedCommands);
    if (cmdViolation !== null) violations.push(cmdViolation);

    const argsViolation = validateArgs(args);
    if (argsViolation !== null) violations.push(argsViolation);

    // #2428 ask 1: surface "capability declared but unenforceable" mismatches
    // so operators reading the SandboxResult can detect config gaps without
    // scraping logs. These aren't security violations (Deno fails closed on
    // missing flags); they're feedback that the operator's intent diverges
    // from the deployed config.
    const configurationWarnings = collectPolicyConfigurationWarnings(policy);

    const base: PolicyEvaluation = {
      allowed: violations.length === 0,
      policyId: policy.id,
      violations,
      ...(configurationWarnings.length > 0 ? { configurationWarnings } : {}),
    };
    if (violations.length > 0 && violations[0] !== undefined) {
      return { ...base, reason: violations[0].reason };
    }
    return base;
  }

  // --------------------------------------------------------------------------
  // Result builders
  // --------------------------------------------------------------------------

  private buildDeniedResult(evaluation: PolicyEvaluation, startTime: number): SandboxResult {
    const durationMs = getTimeProvider().now() - startTime;
    const denied = createDeniedResult(evaluation, durationMs);
    return {
      success: false,
      exitCode: denied.exitCode,
      stdout: denied.stdout,
      stderr: denied.stderr,
      durationMs,
      resourceUsage: denied.resourceUsage,
      policyEvaluation: evaluation,
    };
  }

  private buildDenoUnavailableResult(
    evaluation: PolicyEvaluation,
    startTime: number
  ): SandboxResult {
    const durationMs = getTimeProvider().now() - startTime;
    const result = createDenoUnavailableResult();
    return {
      success: false,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      durationMs,
      resourceUsage: createResourceUsageFromOutput(result.stdout, result.stderr, durationMs),
      policyEvaluation: evaluation,
    };
  }

  private buildSuccessResult(
    outcome: DenoExecOutcome,
    evaluation: PolicyEvaluation,
    startTime: number
  ): SandboxResult {
    const durationMs = getTimeProvider().now() - startTime;
    return {
      success: outcome.exitCode === 0,
      exitCode: outcome.exitCode,
      stdout: outcome.stdout,
      stderr: outcome.stderr,
      durationMs,
      resourceUsage: createResourceUsageFromOutput(outcome.stdout, outcome.stderr, durationMs),
      policyEvaluation: evaluation,
    };
  }

  private buildErrorResult(
    error: unknown,
    evaluation: PolicyEvaluation,
    startTime: number
  ): SandboxResult {
    const durationMs = getTimeProvider().now() - startTime;
    const parsed = parseExecError(error);
    return {
      success: false,
      exitCode: parsed.exitCode,
      stdout: parsed.stdout,
      stderr: parsed.stderr,
      durationMs,
      resourceUsage: createResourceUsageFromOutput(parsed.stdout, parsed.stderr, durationMs),
      policyEvaluation: evaluation,
    };
  }
}

// ============================================================================
// Free helpers (kept top-level so tests can exercise them without instantiating
// the class).
// ============================================================================

/**
 * Assemble the `deno eval` argv that runs `<command> <args>` under
 * permission flags derived from the policy. Always passes `--no-prompt`
 * (security review on PR #2427) — without it, Deno suspends and prompts
 * the user when a permission gate denies an operation. In a CI runner or
 * autonomous-loop context that hangs the parent process; `--no-prompt`
 * forces immediate `PermissionDenied` on missing capabilities.
 */
export function buildDenoArgs(
  command: string,
  args: readonly string[],
  options: SandboxExecutionOptions
): string[] {
  const flags = policyToDenoFlags(options.policy);
  // `deno run` requires a script — for command-mode we use eval to spawn the target
  // via Deno.Command, since `deno run` of an arbitrary binary isn't supported.
  // The eval text is small and produces the same exit code as the spawned process.
  const evalScript = buildEvalSpawn(command, args);
  return ['eval', '--no-prompt', ...flags, evalScript];
}

/**
 * Build the small `Deno.Command` invocation that re-spawns the target with
 * its raw args and forwards stdout/stderr/exit. Both `command` and `args`
 * pass through `JSON.stringify` — that produces valid JS string literals
 * for any input (escapes quotes, backslashes, control chars, U+2028/2029),
 * and the deserialized values flow into `Deno.Command({ args: [...] })` in
 * array form, so there's no shell parsing on the deno side. The argv
 * injection surface is reduced to the SandboxPolicy allowlist gates
 * (validateCommand + validateArgs) already applied in `validate()`.
 *
 * Do not refactor this to a template-string interpolation — that would
 * reintroduce a shell-style injection class.
 */
function buildEvalSpawn(command: string, args: readonly string[]): string {
  const argsJson = JSON.stringify(args);
  const cmdJson = JSON.stringify(command);
  return [
    'const r = await new Deno.Command(',
    cmdJson,
    ', { args: ',
    argsJson,
    ', stdout: "piped", stderr: "piped" }).output();',
    'await Deno.stdout.write(r.stdout);',
    'await Deno.stderr.write(r.stderr);',
    'Deno.exit(r.code);',
  ].join('');
}

/**
 * Run the Deno binary with the given argv. Wraps execFile so callers can
 * mock the exec layer in tests.
 */
async function runDeno(denoArgs: readonly string[], timeoutMs: number): Promise<DenoExecOutcome> {
  const result = await execFileAsync('deno', denoArgs as string[], {
    timeout: timeoutMs,
    maxBuffer: 1024 * 1024,
  });
  return {
    exitCode: 0,
    stdout: truncateOutput(result.stdout),
    stderr: truncateOutput(result.stderr),
  };
}
