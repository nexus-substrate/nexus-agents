/**
 * Project root resolver.
 *
 * Walks up from a starting directory to find the project root
 * by looking for common project markers (.git, package.json, etc.).
 *
 * @module utils/resolve-project-root
 * (Source: Issue #1265 — Project root detection for global MCP)
 */

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/** Markers that identify a project root directory. */
const PROJECT_MARKERS = ['.git', 'package.json', 'Cargo.toml', 'go.mod', 'pyproject.toml'] as const;

/**
 * Walks up from `startDir` to find the nearest directory containing
 * a project marker (.git, package.json, etc.).
 *
 * @param startDir - Starting directory (defaults to process.cwd())
 * @returns Resolved project root, or `startDir` if no marker found
 */
export function resolveProjectRoot(startDir?: string): string {
  const start = resolve(startDir ?? process.cwd());
  let current = start;

  // Walk up until we hit filesystem root (max depth guard prevents infinite loops)
  const MAX_DEPTH = 100;
  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    for (const marker of PROJECT_MARKERS) {
      if (existsSync(join(current, marker))) {
        return current;
      }
    }
    const parent = dirname(current);
    if (parent === current) {
      // Reached filesystem root without finding a marker
      return start;
    }
    current = parent;
  }

  return start;
}
