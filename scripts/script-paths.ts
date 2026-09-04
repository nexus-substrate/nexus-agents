/**
 * Shared path constants for scripts.
 *
 * All scripts that need repo root, source root, or docs root
 * should import from here instead of computing paths inline.
 *
 * Uses `import.meta.dirname` (Node 22+).
 *
 * @module scripts/script-paths
 * (Source: Issue #1434)
 */

import { join } from 'node:path';

/**
 * Repository root directory.
 *
 * Defaults to the real repo root (the parent of `scripts/`). Honors a
 * `NEXUS_SCRIPT_ROOT` override so a script's whole path graph — including every
 * helper module that derives its paths from this constant — can be redirected
 * at an isolated copy of the tree. This is the seam that lets the
 * governance-injection tests (#3954) run the check/inject logic in-process
 * against a temp sandbox instead of mutating the real working tree and shelling
 * out to `pnpm exec tsx`. Unset (the production default) leaves behavior identical.
 */
export const ROOT =
  process.env['NEXUS_SCRIPT_ROOT'] !== undefined && process.env['NEXUS_SCRIPT_ROOT'] !== ''
    ? process.env['NEXUS_SCRIPT_ROOT']
    : join(import.meta.dirname, '..');

/** Main package source directory. */
export const SRC_ROOT = join(ROOT, 'packages/nexus-agents/src');

/** Documentation directory. */
export const DOCS_ROOT = join(ROOT, 'docs');

/** Main package directory. */
export const PKG_ROOT = join(ROOT, 'packages/nexus-agents');
