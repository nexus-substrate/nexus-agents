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
export type CodexSandboxPreflightResult =
  { readonly status: 'ok' } | { readonly status: 'broken' | 'unknown'; readonly reason: string };

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

async function probe(
  exec: CodexSandboxProbeExec,
  platform: NodeJS.Platform
): Promise<CodexSandboxPreflightResult> {
  try {
    const timeoutMs = Math.min(
      CLI_SUBPROCESS_TIMEOUTS.statusProbeMs,
      resolveClassGuardMs('interactive')
    );
    const args = [
      'sandbox',
      '-c',
      'sandbox_mode="read-only"',
      ...codexPlatformSandboxArgs(platform),
      '--',
      'true',
    ];
    const { exitCode, stderr } = await exec('codex', args, timeoutMs);
    if (exitCode === 0) return { status: 'ok' };
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
 * A memoized promise with an injected runner. Concurrent callers share the
 * pending probe; all verdicts, including unknown, are cached. Seats proceed
 * on unknown under their existing read-only sandbox
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
  logger: ILogger
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
        if (result.status === 'unknown') {
          logger.warn('Codex sandbox preflight unknown; proceeding with read-only sandbox', {
            cli: 'codex',
            reason: result.reason,
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
