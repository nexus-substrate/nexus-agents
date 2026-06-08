/**
 * Atomic single-flight lease for the auto-remediation enforce path (#3540 inc.2h
 * wiring / #3648; #3618 condition 1).
 *
 * The #3618 capstone vote's one hard concurrency requirement: the lease must be
 * acquired by an ATOMIC create-if-not-exists, NOT a check-then-act read (which is
 * TOCTOU — two CI runners both see "no lock" and both proceed). This implements
 * it via GitHub's git-refs API: `POST .../git/refs` is atomic and returns 422
 * "Reference already exists" if the ref is already there. So the FIRST mutating
 * action IS the lock acquisition — exactly one concurrent creator wins.
 *
 * Fail-closed: any non-success (422 already-held OR a transport error) yields
 * `null` (not acquired) → the orchestrator aborts the run rather than risk a
 * double-run. Release deletes the ref; release errors are swallowed (best-effort)
 * since a stale lock is recovered by the cleanup story in #3646.
 *
 * The `gh` exec is injected so the logic is unit-tested without network/git.
 *
 * @module mcp/tools/auto-remediation-lease
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ILogger } from '../../core/index.js';
import type { AcquiredLease } from './improvement-remediation-enforce.js';

const execFileAsync = promisify(execFile);

/** Result of a `gh` invocation. */
export interface GhExecResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Injected `gh` runner — returns the exit code rather than throwing. */
export type GhRunner = (args: readonly string[]) => Promise<GhExecResult>;

/** Options for the git-ref lease acquirer. */
export interface GitRefLeaseOptions {
  /** `owner/name` repo slug. */
  readonly repo: string;
  /** Commit SHA the lock ref points at (any real sha; the value is irrelevant). */
  readonly sha: string;
  /** Injected gh runner (defaults to a real, no-shell execFile of `gh`). */
  readonly gh?: GhRunner;
  readonly logger?: ILogger;
}

/** The git ref namespace for auto-remediation locks. */
export function lockRef(key: string): string {
  return `refs/locks/${key}`;
}

/** Default `gh` runner: no-shell execFile, never throws (captures exit code). */
export const defaultGhRunner: GhRunner = async (args) => {
  try {
    const { stdout, stderr } = await execFileAsync('gh', [...args]);
    return { exitCode: 0, stdout, stderr };
  } catch (err: unknown) {
    const e = err as { code?: number; stdout?: string; stderr?: string; message?: string };
    return {
      exitCode: typeof e.code === 'number' ? e.code : 1,
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? e.message ?? 'gh failed',
    };
  }
};

/**
 * Build an {@link AcquiredLease} acquirer that uses an atomic GitHub ref create.
 * Returns a function matching `AutoRemediationDeps.acquireLease`: it resolves to
 * a release handle on success, or `null` (fail-closed) when the lock is already
 * held or the create fails.
 */
export function makeGitRefLeaseAcquirer(
  opts: GitRefLeaseOptions
): (key: string) => Promise<AcquiredLease | null> {
  const gh = opts.gh ?? defaultGhRunner;
  return async (key: string): Promise<AcquiredLease | null> => {
    const ref = lockRef(key);
    // Atomic create — 422 if the ref already exists (lock held). This IS the
    // acquisition; there is no prior existence check (no TOCTOU window).
    const res = await gh([
      'api',
      '-X',
      'POST',
      `repos/${opts.repo}/git/refs`,
      '-f',
      `ref=${ref}`,
      '-f',
      `sha=${opts.sha}`,
    ]);
    if (res.exitCode !== 0) {
      opts.logger?.info('auto-remediation lease not acquired (held or error) — fail-closed', {
        ref,
        stderr: res.stderr.slice(0, 200),
      });
      return null;
    }
    return {
      release: async (): Promise<void> => {
        const del = await gh([
          'api',
          '-X',
          'DELETE',
          `repos/${opts.repo}/git/refs/${stripRefsPrefix(ref)}`,
        ]);
        if (del.exitCode !== 0) {
          opts.logger?.warn('auto-remediation lease release failed (stale lock; see #3646)', {
            ref,
            stderr: del.stderr.slice(0, 200),
          });
        }
      },
    };
  };
}

/** The GitHub refs DELETE endpoint omits the leading `refs/`. */
function stripRefsPrefix(ref: string): string {
  return ref.replace(/^refs\//, '');
}
