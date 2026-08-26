/**
 * portable-mode — auto-detect sandboxed execution environments and
 * redirect nexus-agents data to a workspace-local directory.
 *
 * The existing `getNexusDataDir()` already respects `NEXUS_DATA_DIR` and
 * `NEXUS_PORTABLE_MODE`. This module wires up the *auto-detection* path
 * so operators running inside a Docker / restricted-FS / sandboxed
 * environment don't have to set the env vars manually — nexus-agents
 * notices and announces the flip.
 *
 * Source: Issue #2471 (epic #2467 child).
 *
 * Detection rules (first match wins):
 *   1. `NEXUS_DATA_DIR` already set → respect, no auto-detect
 *   2. `NEXUS_PORTABLE_MODE=0` → operator opted out, no auto-detect
 *   3. `NEXUS_PORTABLE_MODE=1` → portable mode, no detection needed
 *   4. Heuristic: home directory not writable
 *   5. Heuristic: container env vars set (KUBERNETES_SERVICE_HOST,
 *      DOCKER_CONTAINER, ECS_CONTAINER_METADATA_URI, SANDBOX, etc.)
 *
 * When portable mode fires:
 *   - Sets `process.env.NEXUS_DATA_DIR` to `<cwd>/.nexus-agents`
 *   - Announces once on stderr (subsequent calls are silent)
 *   - If cwd is a git repo, appends `.nexus-agents/` to .gitignore
 *
 * To force off: `NEXUS_PORTABLE_MODE=0`. To force on without heuristics:
 * `NEXUS_PORTABLE_MODE=1`. To override target dir: `NEXUS_DATA_DIR=...`.
 */

import { accessSync, constants, existsSync, readFileSync, appendFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

/** Container / sandbox environment variables that strongly imply portable mode. */
const SANDBOX_ENV_VARS: readonly string[] = [
  'KUBERNETES_SERVICE_HOST',
  'DOCKER_CONTAINER',
  'ECS_CONTAINER_METADATA_URI',
  'ECS_CONTAINER_METADATA_URI_V4',
  'SANDBOX',
  'NEXUS_SANDBOX',
];

let DETECTED = false;

interface DetectionResult {
  readonly portable: boolean;
  readonly dataDir: string;
  readonly reason:
    'env-data-dir' | 'env-opt-out' | 'env-opt-in' | 'home-unwritable' | 'container-env' | 'default';
}

function isHomeWritable(): boolean {
  try {
    const home = homedir();
    if (!existsSync(home)) return false;
    accessSync(home, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function inSandboxEnv(): boolean {
  for (const v of SANDBOX_ENV_VARS) {
    const val = process.env[v];
    if (val !== undefined && val !== '') return true;
  }
  return false;
}

/**
 * The operator-declared sandbox root, when set (#5026).
 *
 * Read directly rather than through `detectSandbox()` to keep this module free
 * of imports — it runs as a side effect of `cli-log-bootstrap` before anything
 * else loads.
 */
function sandboxRootFromEnv(): string | undefined {
  const raw = process.env['NEXUS_SANDBOX_ROOT']?.trim();
  return raw !== undefined && raw !== '' ? resolve(raw) : undefined;
}

function checkExplicitEnv(cwd: string): DetectionResult | null {
  const fromEnv = process.env['NEXUS_DATA_DIR']?.trim();
  if (fromEnv !== undefined && fromEnv !== '') {
    return { portable: false, dataDir: resolve(fromEnv), reason: 'env-data-dir' };
  }
  const portableEnv = process.env['NEXUS_PORTABLE_MODE'];
  if (portableEnv === '0' || portableEnv === 'false') {
    return { portable: false, dataDir: join(homedir(), '.nexus-agents'), reason: 'env-opt-out' };
  }
  if (portableEnv === '1' || portableEnv === 'true') {
    return { portable: true, dataDir: join(cwd, '.nexus-agents'), reason: 'env-opt-in' };
  }
  return null;
}

function checkHeuristics(cwd: string): DetectionResult | null {
  if (!isHomeWritable()) {
    return { portable: true, dataDir: join(cwd, '.nexus-agents'), reason: 'home-unwritable' };
  }
  if (inSandboxEnv()) {
    // #5026: prefer an explicitly declared sandbox root over cwd. `NEXUS_SANDBOX`
    // is one of SANDBOX_ENV_VARS, so setting it makes this heuristic fire and
    // stamp `NEXUS_DATA_DIR = <cwd>/.nexus-agents` — which then short-circuits
    // `getNexusDataDir`'s own sandbox branch (`nexus-data-dir.ts:124-127`)
    // before it can honour `NEXUS_SANDBOX_ROOT`. The documented purpose of that
    // variable ("default NEXUS_DATA_DIR to the multi-repo root") therefore never
    // happened, and state fragmented per working directory across a multi-repo
    // mount. `doctor`'s dataDirInsideRepo check exists to detect exactly that
    // layout and reports it as operator misconfiguration.
    const declaredRoot = sandboxRootFromEnv();
    return {
      portable: true,
      dataDir: join(declaredRoot ?? cwd, '.nexus-agents'),
      reason: 'container-env',
    };
  }
  return null;
}

/**
 * Decide whether to flip nexus-agents to portable mode and what data dir
 * to use. Pure function; no side effects beyond reading env + filesystem.
 */
export function detectPortableMode(cwd: string = process.cwd()): DetectionResult {
  return (
    checkExplicitEnv(cwd) ??
    checkHeuristics(cwd) ?? {
      portable: false,
      dataDir: join(homedir(), '.nexus-agents'),
      reason: 'default',
    }
  );
}

/**
 * Apply detected portable mode at process startup. Idempotent (subsequent
 * calls are no-ops). Announces on stderr once when the auto-detection
 * heuristic triggers — env-opt-in/out doesn't announce because the
 * operator already knows.
 */
export function applyPortableMode(cwd: string = process.cwd()): void {
  if (DETECTED) return;
  DETECTED = true;

  const result = detectPortableMode(cwd);

  // No env, no heuristic match — nothing to do.
  if (!result.portable) return;

  // The heuristic-driven cases announce; explicit opt-in is silent.
  if (result.reason === 'home-unwritable' || result.reason === 'container-env') {
    process.stderr.write(
      `[portable-mode] Sandbox detected (${result.reason}). Using ${result.dataDir} for all nexus-agents data.\n` +
        `                Set NEXUS_PORTABLE_MODE=0 to override; see docs/guides/SANDBOXED-USAGE.md\n`
    );
  }

  process.env['NEXUS_DATA_DIR'] = result.dataDir;

  if (isInsideGitRepo(cwd)) {
    ensureGitignored(cwd, '.nexus-agents/');
  }
}

function isInsideGitRepo(cwd: string): boolean {
  try {
    const gitDir = join(cwd, '.git');
    return existsSync(gitDir) && statSync(gitDir).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Append `entry` to `<cwd>/.gitignore` if not already present. Stderr
 * announce on the first append. Exported because the repo-preferred
 * resolver in `nexus-data-dir.ts` reuses the same auto-gitignore behavior
 * when `<repo>/.nexus-agents/` becomes the active data dir (epic #2872).
 */
export function ensureGitignored(cwd: string, entry: string): void {
  const path = join(cwd, '.gitignore');
  try {
    const existing = existsSync(path) ? readFileSync(path, 'utf-8') : '';
    const lines = existing.split('\n').map((l) => l.trim());
    if (lines.includes(entry) || lines.includes(entry.replace(/\/$/, ''))) return;
    const sep = existing.length > 0 && !existing.endsWith('\n') ? '\n' : '';
    appendFileSync(path, `${sep}${entry}\n`, 'utf-8');
    process.stderr.write(
      `[portable-mode] Added '${entry}' to ${path} so nexus-agents data is gitignored.\n`
    );
  } catch (e: unknown) {
    // Non-fatal — operator can add the line themselves.
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(
      `[portable-mode] Could not auto-update ${path} (${msg}). Add '${entry}' manually if you don't want nexus-agents data tracked by git.\n`
    );
  }
}

/** Test-only reset of the once-only state. */
export function _resetDetectedForTests(): void {
  DETECTED = false;
}
