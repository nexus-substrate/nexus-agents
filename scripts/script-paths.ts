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

/** Repository root directory. */
export const ROOT = join(import.meta.dirname, '..');

/** Main package source directory. */
export const SRC_ROOT = join(ROOT, 'packages/nexus-agents/src');

/** Documentation directory. */
export const DOCS_ROOT = join(ROOT, 'docs');

/** Main package directory. */
export const PKG_ROOT = join(ROOT, 'packages/nexus-agents');
