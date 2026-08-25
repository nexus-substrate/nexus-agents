/**
 * Recent-commit secret scan for release validation.
 *
 * Separate from `release-validate-helpers` because it is the one check there
 * that shells out to git, and the distinction it has to preserve — "scanned,
 * nothing found" versus "did not scan" — is worth testing against a real
 * repository rather than a mocked `execSync` (#4839).
 *
 * @module cli/release-secret-scan
 */

import { execSync } from 'node:child_process';
import { CLI_SUBPROCESS_TIMEOUTS } from '../config/timeouts.js';

/** Outcome of the recent-commit secret scan: it either ran, or it did not. */
export type SecretScanResult =
  | { readonly ok: true; readonly matches: readonly string[] }
  | { readonly ok: false; readonly reason: string };

/** Options for {@link scanRecentCommitsForSecrets}; both exist for testing. */
export interface SecretScanOptions {
  readonly cwd?: string;
  readonly range?: string;
}

const SECRET_LINE_PATTERN = /api[_-]?key|secret|password|token/i;
const MAX_REPORTED_MATCHES = 5;

/**
 * Scan recent commits for secret-like tokens, distinguishing "scanned, nothing
 * found" from "did not scan".
 *
 * This runs `git diff` on its own and filters in JS. It previously piped git
 * through `grep | head`, and a shell pipeline's exit status is its *last*
 * command's: `head` succeeds essentially always, so a git failure — a shallow
 * clone, or any branch with fewer than ten commits — exited 0 with empty
 * output and was indistinguishable from a clean tree (#4839).
 */
export function scanRecentCommitsForSecrets(options: SecretScanOptions = {}): SecretScanResult {
  const range = options.range ?? 'HEAD~10..HEAD';
  let diff: string;
  try {
    diff = execSync(`git diff ${range} -- "*.ts" "*.js"`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: CLI_SUBPROCESS_TIMEOUTS.ghCommandMs,
      ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    });
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }

  const matches = diff
    .split('\n')
    .filter((line) => SECRET_LINE_PATTERN.test(line))
    .slice(0, MAX_REPORTED_MATCHES);
  return { ok: true, matches };
}
