/**
 * Repo-scoped scratch directory (#4412).
 *
 * Short-lived working files — throwaway git worktrees, system-prompt files,
 * generated MCP configs — used to be built directly into `os.tmpdir()`. That
 * is a shared space with no owner and no budget: anything else on the machine
 * can fill it, and when it fills, the failure surfaces as unrelated nonsense.
 * On this repo it manifested as ~1,100 test files failing to *collect* with
 * zero assertion failures, which reads like a code fault and is not one.
 *
 * Scratch now lands under the data dir we already own and already gitignore,
 * in its own `tmp/` subdir so it can be reaped without touching sessions,
 * traces, or the audit chain. Resolution order:
 *
 * 1. `NEXUS_TMPDIR` — explicit operator override, wins outright.
 * 2. `<dataDir>/tmp` via {@link nexusDataPathEnsure} — inherits the existing
 *    per-repo / sandbox / writability logic rather than re-deriving it.
 * 3. `os.tmpdir()` — fail-open when neither can be created.
 *
 * Step 3 is deliberate. Scratch space is a convenience, not an invariant: a
 * read-only checkout should degrade to `/tmp`, not take down every adapter
 * that needs to write a prompt file.
 *
 * @module config/nexus-tmp-dir
 */

import { mkdirSync, mkdtempSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { nexusDataPathEnsure } from './nexus-data-dir.js';

/**
 * Returns an existing directory suitable for short-lived working files.
 *
 * Always returns a path that exists — callers may `mkdtemp` into it directly
 * without a preceding `mkdirSync`.
 */
export function getNexusTmpDir(): string {
  const fromEnv = process.env['NEXUS_TMPDIR']?.trim();
  if (fromEnv !== undefined && fromEnv !== '') {
    const dir = resolve(fromEnv);
    try {
      mkdirSync(dir, { recursive: true });
      return dir;
    } catch {
      // An override that cannot be created is an operator mistake, but not a
      // reason to fail the caller's actual work. Fall through.
      return tmpdir();
    }
  }

  try {
    return nexusDataPathEnsure('tmp');
  } catch {
    return tmpdir();
  }
}

/**
 * `fs.mkdtempSync` against the scratch root.
 *
 * Keep the caller's prefix descriptive — it is the only thing that makes a
 * leaked directory attributable to the code that made it.
 */
export function nexusMkdtempSync(prefix: string): string {
  return mkdtempSync(join(getNexusTmpDir(), prefix));
}

/** Promise-returning counterpart to {@link nexusMkdtempSync}. */
export async function nexusMkdtemp(prefix: string): Promise<string> {
  return mkdtemp(join(getNexusTmpDir(), prefix));
}
