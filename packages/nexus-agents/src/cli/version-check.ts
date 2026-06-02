/**
 * Startup version-drift check (#3283).
 *
 * A long-lived MCP server can drift many versions behind the published package
 * (47 stale `--mode=server` processes pinned at v2.76.0 were found in the wild),
 * silently serving old code so already-fixed bugs reappear. This module makes
 * that visible: at startup the server best-effort-checks the latest published
 * version and logs a prominent WARN if the running build is behind.
 *
 * Fail-soft and non-blocking by design: any network/timeout/parse failure is
 * swallowed (returns null), it never gates startup, it skips local `dev` builds
 * and CI, and it can be disabled with `NEXUS_VERSION_CHECK=0`.
 *
 * @module cli/version-check
 */

import semver from 'semver';
import { VERSION } from '../version.js';
import type { ILogger } from '../core/index.js';
import { parseBoolEnv } from '../config/defaults-env.js';

const REGISTRY_LATEST_URL = 'https://registry.npmjs.org/nexus-agents/latest';
const DEFAULT_TIMEOUT_MS = 1500;
const ENV_FLAG = 'NEXUS_VERSION_CHECK';

export interface VersionDrift {
  readonly current: string;
  readonly latest: string;
  readonly stale: boolean;
}

export interface VersionCheckOptions {
  readonly timeoutMs?: number;
  /** Injectable fetch (tests). Defaults to global fetch. */
  readonly fetchImpl?: typeof fetch;
  /** Override the running version (tests). Defaults to the build-injected VERSION. */
  readonly currentVersion?: string;
}

/**
 * Best-effort check of how the running version compares to the latest published.
 * Returns `null` on any failure or for a non-releasable build (`dev`/invalid
 * semver) — callers treat `null` as "don't warn".
 */
/** Fetch the latest published version string, or null on any failure. */
async function fetchLatestVersion(doFetch: typeof fetch, timeoutMs: number): Promise<string | null> {
  try {
    const res = await doFetch(REGISTRY_LATEST_URL, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const body = (await res.json()) as { version?: unknown };
    const latest = typeof body.version === 'string' ? body.version : null;
    return latest !== null && semver.valid(latest) !== null ? latest : null;
  } catch {
    // Offline, timeout, DNS, parse — all non-fatal. Stay silent.
    return null;
  }
}

export async function checkVersionDrift(
  options?: VersionCheckOptions
): Promise<VersionDrift | null> {
  const current = options?.currentVersion ?? VERSION;
  if (semver.valid(current) === null) return null; // 'dev' / local build — nothing to compare
  const doFetch = options?.fetchImpl ?? globalThis.fetch;
  if (typeof doFetch !== 'function') return null;
  const latest = await fetchLatestVersion(doFetch, options?.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  if (latest === null) return null;
  return { current, latest, stale: semver.lt(current, latest) };
}

/**
 * Log a prominent warning if the running build is behind the latest published
 * version. No-op when disabled (`NEXUS_VERSION_CHECK=0`), in CI, on a dev build,
 * or when the check can't complete. Never throws.
 */
export async function warnIfVersionStale(
  logger: ILogger,
  options?: VersionCheckOptions
): Promise<void> {
  if (!parseBoolEnv(ENV_FLAG, true)) return; // explicit opt-out
  if (process.env['CI'] !== undefined && process.env['CI'] !== '') return; // skip CI
  try {
    const drift = await checkVersionDrift(options);
    if (drift?.stale === true) {
      logger.warn(
        'nexus-agents is running a stale version — you may be serving old code (#3283)',
        {
          running: drift.current,
          latestPublished: drift.latest,
          fix: 'npm i -g nexus-agents@latest, then restart the MCP server',
        }
      );
    }
  } catch {
    // Defensive: warning must never break startup.
  }
}
