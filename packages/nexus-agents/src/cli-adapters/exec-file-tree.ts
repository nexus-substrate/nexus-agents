/**
 * Run a command to completion, ending its whole process tree on a timeout or
 * an abort (#6747).
 *
 * `execFile`'s own `timeout` and `signal` options kill only the direct child.
 * The commands the quality gate and the security scan run are `npm run …`
 * scripts and scanners, which spawn children of their own, so killing the
 * direct child left the real work running as an orphan. They are also
 * signalled in the wrong order for a tree kill: the descendants must be
 * collected BEFORE the parent dies, because an orphan is reparented and can
 * no longer be found through it (#6680). So neither option is passed; both
 * paths go through {@link terminateProcessTree}, which collects first, and the
 * child is tracked so a server shutdown reaches it too.
 *
 * @module cli-adapters/exec-file-tree
 */

import { execFile, type ChildProcess } from 'node:child_process';
import { AbortError } from '../adapters/abort-utils.js';
import { SIGKILL_GRACE_MS, terminateProcessTree, trackProcessTree } from './process-tree-kill.js';

export interface ExecFileTreeOptions {
  /** Working directory for the command. Absent: the server's own. */
  readonly cwd?: string | undefined;
  /** Runaway guard: the tree is ended and the call rejects after this long. */
  readonly timeoutMs: number;
  /** Largest stdout or stderr accepted, in bytes. Absent: Node's default. */
  readonly maxBuffer?: number | undefined;
  /** Ends the tree and rejects with {@link AbortError} when it fires. */
  readonly signal?: AbortSignal | undefined;
  /** SIGTERM → SIGKILL grace period. Absent: {@link SIGKILL_GRACE_MS}. */
  readonly graceMs?: number | undefined;
}

export interface ExecFileTreeResult {
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * Run `command` with `args`. Resolves with its output on exit code 0; rejects
 * with `execFile`'s error on a non-zero exit, with a timed-out error when
 * `timeoutMs` passes, and with an {@link AbortError} when `signal` fires. A
 * signal that has already fired rejects without spawning anything.
 *
 * The call settles as soon as the tree is signalled, not when the child
 * closes: a descendant holding the output pipe open would otherwise keep the
 * caller waiting for exactly the work the abort was meant to stop.
 */
export function execFileTree(
  command: string,
  args: readonly string[],
  options: ExecFileTreeOptions
): Promise<ExecFileTreeResult> {
  const { signal, timeoutMs } = options;
  if (signal?.aborted === true) {
    return Promise.reject(new AbortError(`${command} aborted before it started`));
  }
  const graceMs = options.graceMs ?? SIGKILL_GRACE_MS;

  return new Promise<ExecFileTreeResult>((resolve, reject) => {
    const run: { settled: boolean; child: ChildProcess | undefined } = {
      settled: false,
      child: undefined,
    };
    // `timer` and `onAbort` are declared below; this only runs after both exist.
    const finish = (settle: () => void): void => {
      if (run.settled) return;
      run.settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      settle();
    };
    /** End the tree, then settle with `failure`. */
    const stop = (failure: Error): void => {
      if (run.settled) return;
      if (run.child !== undefined) void terminateProcessTree(run.child, graceMs);
      finish(() => {
        reject(failure);
      });
    };
    const onAbort = (): void => {
      stop(new AbortError(`${command} aborted`));
    };
    const timer = setTimeout(() => {
      stop(new Error(`${command} ${args.join(' ')} timed out after ${String(timeoutMs)}ms`));
    }, timeoutMs);
    signal?.addEventListener('abort', onAbort, { once: true });

    run.child = spawnTracked(command, args, options, (error, stdout, stderr) => {
      finish(() => {
        if (error === null) resolve({ stdout, stderr });
        else reject(error);
      });
    });
  });
}

/** Spawn the command, tracked so a server shutdown reaches its tree (#6680). */
function spawnTracked(
  command: string,
  args: readonly string[],
  options: ExecFileTreeOptions,
  onExit: (error: Error | null, stdout: string, stderr: string) => void
): ChildProcess {
  return trackProcessTree(
    execFile(
      command,
      [...args],
      {
        encoding: 'utf8',
        ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
        ...(options.maxBuffer !== undefined ? { maxBuffer: options.maxBuffer } : {}),
      },
      (error, stdout, stderr) => {
        onExit(error, stdout, stderr);
      }
    )
  );
}
