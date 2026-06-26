/**
 * Run `changeset version` with bounded retries on the transient
 * `@changesets/get-github-info` GraphQL flake (#4072).
 *
 * The Release workflow's `version: pnpm changeset:version` step intermittently
 * fails while changesets enriches the changelog from the GitHub GraphQL API:
 *
 *   🦋  error Failed to parse data from GitHub
 *   🦋  error Invalid response body while trying to fetch
 *           https://api.github.com/graphql: Premature close
 *
 * This is a NETWORK flake, not a data error — changesets explicitly "escapes
 * applying the changesets, and no files should have been affected", so re-running
 * `changeset version` is SAFE and succeeds (observed: failed twice, passed on the
 * 3rd run on 2026-06-26). Each occurrence otherwise stalls the autonomous release
 * cycle until a human re-runs the job. This wrapper retries ONLY that transient
 * class — a non-transient failure (e.g. a malformed changeset) exits immediately
 * so real errors are never masked.
 *
 * Drop-in for the bare `changeset version` at the head of the `changeset:version`
 * npm script; the rest of that chain (sync-plugin-version, governance:inject, …)
 * is unchanged and runs after this succeeds.
 *
 * @module scripts/changeset-version-with-retry
 */

import { spawnSync } from 'node:child_process';

/**
 * Parse an integer env override, falling back to `fallback` when unset OR invalid.
 * The fail-safe fallback matters: a bad `CHANGESET_VERSION_MAX_ATTEMPTS` must NOT
 * yield `NaN` (which would make the attempt loop never run, returning success
 * WITHOUT versioning — the exact desync this script exists to prevent, #4072
 * review). `min` guards the floor (MAX_ATTEMPTS must be ≥ 1 so the loop always
 * runs once).
 */
export function intEnv(name: string, fallback: number, min: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n >= min ? n : fallback;
}

const MAX_ATTEMPTS = intEnv('CHANGESET_VERSION_MAX_ATTEMPTS', 3, 1);
const RETRY_DELAY_MS = intEnv('CHANGESET_VERSION_RETRY_DELAY_MS', 5000, 0);

/**
 * Whether `changeset version`'s combined stdout+stderr indicates a TRANSIENT
 * changelog-enrichment failure (GitHub GraphQL premature-close / connection
 * reset) that is safe to retry. Returns false for any other failure so genuine
 * errors (invalid changeset, write failure) are surfaced, not retried away.
 */
export function isRetryableChangesetVersionError(output: string): boolean {
  return /Failed to parse data from GitHub|get-github-info|api\.github\.com\/graphql|Premature close|ECONNRESET|ETIMEDOUT|socket hang up|EAI_AGAIN/i.test(
    output
  );
}

/** Run `changeset version` once, forwarding its output, and report success + captured text. */
function runChangesetVersion(): { ok: boolean; output: string } {
  const res = spawnSync('pnpm', ['exec', 'changeset', 'version'], {
    encoding: 'utf-8',
    // Generous buffer: a large changelog must not ENOBUFS the captured output.
    maxBuffer: 64 * 1024 * 1024,
  });
  // spawn itself failed (e.g. binary not found) — not a retryable GraphQL flake.
  if (res.error !== undefined) {
    const message = res.error.message;
    process.stderr.write(`${message}\n`);
    return { ok: false, output: message };
  }
  // With a spawn success + `encoding`, stdout/stderr are strings.
  const { stdout, stderr } = res;
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  return { ok: res.status === 0, output: `${stdout}${stderr}` };
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function main(): Promise<void> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const { ok, output } = runChangesetVersion();
    if (ok) {
      if (attempt > 1) {
        process.stdout.write(
          `[changeset-version-retry] succeeded on attempt ${String(attempt)}.\n`
        );
      }
      return;
    }
    const retryable = isRetryableChangesetVersionError(output);
    if (!retryable || attempt === MAX_ATTEMPTS) {
      console.error(
        `[changeset-version-retry] \`changeset version\` failed on attempt ` +
          `${String(attempt)}/${String(MAX_ATTEMPTS)} (retryable=${String(retryable)}); not retrying.`
      );
      process.exit(1);
    }
    console.error(
      `[changeset-version-retry] transient GitHub GraphQL flake on attempt ` +
        `${String(attempt)}/${String(MAX_ATTEMPTS)} (#4072) — retrying in ${String(RETRY_DELAY_MS)}ms...`
    );
    await sleep(RETRY_DELAY_MS);
  }
}

// Only run when invoked directly (not when imported by the test).
if (process.argv[1]?.endsWith('changeset-version-with-retry.ts') === true) {
  void main();
}
