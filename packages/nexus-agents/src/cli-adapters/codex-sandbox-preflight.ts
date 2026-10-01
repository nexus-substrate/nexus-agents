/** Model-free, process-cached check of the sandbox used by Codex seats (#6841). */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getErrorMessage } from '../core/index.js';
import { CLI_SUBPROCESS_TIMEOUTS, resolveClassGuardMs } from '../config/timeouts.js';
import { UNVERIFIABLE_STDERR_RE } from '../cli/voter-unverifiable.js';
import { codexPlatformSandboxArgs } from './adapters/codex-adapter-helpers.js';
import { sanitizeOutput } from '../security/output-sanitizer.js';
import type { ILogger } from '../core/logger.js';
import type { CliError } from './types.js';
import { createHostUnavailableCliError } from './cli-error-helpers.js';

/** Unknown is unmeasured, never evidence that the sandbox works. */
export type CodexSandboxPreflightResult = (
  { readonly status: 'ok' } | { readonly status: 'broken' | 'unknown'; readonly reason: string }
) & { readonly sandboxArgs?: readonly string[] };

/** Runner seam: no model call, shell interpolation, or inherited stdin. */
export type CodexSandboxProbeExec = (
  command: string,
  args: readonly string[],
  timeoutMs: number
) => Promise<{ readonly exitCode: number | null; readonly stderr: string }>;

const execFileAsync = promisify(execFile);

const defaultExec: CodexSandboxProbeExec = async (command, args, timeoutMs) => {
  try {
    const execution = execFileAsync(command, [...args], {
      encoding: 'utf8',
      timeout: timeoutMs,
      killSignal: 'SIGKILL',
    });
    // execFile pipes stdin; close it so the probe cannot wait for input.
    execution.child.stdin?.end();
    await execution;
    return { exitCode: 0, stderr: '' };
  } catch (error: unknown) {
    const failure = error as { code?: unknown; stderr?: unknown };
    return {
      exitCode: typeof failure.code === 'number' ? failure.code : null,
      stderr:
        typeof failure.stderr === 'string' && failure.stderr.trim() !== ''
          ? failure.stderr
          : getErrorMessage(error),
    };
  }
};

async function probeCandidate(
  exec: CodexSandboxProbeExec,
  sandboxArgs: readonly string[]
): Promise<CodexSandboxPreflightResult> {
  try {
    const timeoutMs = Math.min(
      CLI_SUBPROCESS_TIMEOUTS.statusProbeMs,
      resolveClassGuardMs('interactive')
    );
    const args = ['sandbox', '-c', 'sandbox_mode="read-only"', ...sandboxArgs, '--', 'true'];
    const { exitCode, stderr } = await exec('codex', args, timeoutMs);
    if (exitCode === 0) return { status: 'ok', sandboxArgs };
    const lines = sanitizeOutput(stderr)
      .split('\n')
      .map((line) => line.trim());
    const cause = lines.find((line) => UNVERIFIABLE_STDERR_RE.test(line));
    const status = exitCode !== null && cause !== undefined ? 'broken' : 'unknown';
    const detail = cause ?? lines.find((line) => line !== '') ?? 'no diagnostic output';
    const exit = exitCode === null ? 'did not complete' : `exit ${String(exitCode)}`;
    return { status, reason: `codex sandbox ${exit}: ${detail}` };
  } catch (error: unknown) {
    return { status: 'unknown', reason: sanitizeOutput(getErrorMessage(error)) };
  }
}

/**
 * First success wins, even after a recognized failure. Without any success,
 * ANY completed numeric failure with a recognized stderr line means broken;
 * a null exit or runner exception alone is unmeasured. Keep the first broken
 * cause rather than letting a later timeout hide it. Candidates are nonempty.
 */
async function probe(
  exec: CodexSandboxProbeExec,
  platform: NodeJS.Platform
): Promise<CodexSandboxPreflightResult> {
  const candidates = platform === 'linux' ? [[], codexPlatformSandboxArgs(platform)] : [[]];
  let failure: { status: 'broken' | 'unknown'; reason: string } = {
    status: 'unknown',
    reason: 'no sandbox candidates measured',
  };
  let measured = false;
  for (const sandboxArgs of candidates) {
    const result = await probeCandidate(exec, sandboxArgs);
    if (result.status === 'ok') return result;
    if (!measured || (failure.status !== 'broken' && result.status === 'broken')) {
      failure = result;
    }
    measured = true;
  }
  // Unknown uses the modern default, not the deprecated flag that panics on
  // >=0.156.1. Older Codex gets legacy whenever that candidate actually passes;
  // an unsupported probe cannot establish that legacy would work either.
  return { ...failure, sandboxArgs: [] };
}

/**
 * A memoized promise with an injected runner. Concurrent callers share the
 * pending probe; all verdicts, including unknown, are cached. Seats proceed
 * on unknown under the plain read-only sandbox
 * and log the reason; a recognized sandbox failure refuses execution.
 */
export function createCodexSandboxPreflight(
  exec: CodexSandboxProbeExec,
  platform: NodeJS.Platform = process.platform
): () => Promise<CodexSandboxPreflightResult> {
  let cached: Promise<CodexSandboxPreflightResult> | undefined;
  return () => (cached ??= probe(exec, platform));
}

/** The single default probe shared by doctor and every Codex seat/arm in this process. */
export const codexSandboxPreflight = createCodexSandboxPreflight(defaultExec);

/** Refuse before initialization; retain unknown provenance once per adapter. */
export function createCodexSandboxGuard(
  preflight: () => CodexSandboxPreflightResult | Promise<CodexSandboxPreflightResult>,
  logger: ILogger,
  onSandboxArgs: (args: readonly string[]) => void,
  platform: NodeJS.Platform = process.platform
): () => Promise<CliError | undefined> {
  let cached: Promise<CodexSandboxPreflightResult> | undefined;
  return async () => {
    // The async wrapper turns a synchronous throw into a rejection, and the
    // catch turns any rejection into unknown: a memoized rejection would make
    // every later call on this adapter throw instead of proceeding.
    cached ??= (async () => preflight())()
      .catch((error: unknown): CodexSandboxPreflightResult => ({
        status: 'unknown',
        reason: sanitizeOutput(getErrorMessage(error)),
      }))
      .then((result) => {
        // Old injected Result | Promise<Result> shapes omit sandboxArgs. Keep
        // their previous platform behavior; explicit [] always means plain.
        const sandboxArgs = result.sandboxArgs ?? codexPlatformSandboxArgs(platform);
        onSandboxArgs(sandboxArgs);
        if (result.status === 'unknown') {
          logger.warn('Codex sandbox preflight unknown; proceeding with read-only sandbox', {
            cli: 'codex',
            reason: result.reason,
            sandboxArgs,
          });
        }
        return result;
      });
    const result = await cached;
    return result.status === 'broken'
      ? createHostUnavailableCliError(
          `Codex read-only sandbox unavailable: ${result.reason} (checked once per process; restart the MCP server after fixing the host)`,
          'codex'
        )
      : undefined;
  };
}
