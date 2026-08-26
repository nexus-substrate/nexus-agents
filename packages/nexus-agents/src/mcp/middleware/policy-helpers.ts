/**
 * nexus-agents/mcp - Policy Firewall Helpers
 *
 * Utility functions for path validation and argument extraction.
 *
 * (Source: OWASP ASVS 4.0, Authorization Controls)
 */

import { resolve, sep } from 'node:path';

// =============================================================================
// Path Utility Functions
// =============================================================================

/**
 * Validates a path against allowed roots.
 *
 * @param targetPath - The path to validate
 * @param allowedPaths - Array of allowed root paths
 * @returns True if the path is within an allowed root
 */
export function isPathSafe(targetPath: string, allowedPaths: readonly string[]): boolean {
  // #5025: this used `normalizePath`, which collapses the DEFAULT allowlist
  // entry `'./'` to `'/'` — so `startsWith` was true for every absolute path
  // and the rule admitted `/etc/shadow` and `~/.ssh/id_ed25519`. A raw string
  // prefix also has no separator boundary, so a root of `/work` admitted
  // `/work-secrets`. Resolve both sides against cwd and require either an
  // exact match or a path-separator boundary.
  const resolvedTarget = resolve(targetPath);

  for (const allowed of allowedPaths) {
    const root = resolve(allowed);
    if (resolvedTarget === root) return true;
    if (resolvedTarget.startsWith(root.endsWith(sep) ? root : root + sep)) return true;
  }

  return false;
}

/**
 * Normalizes a path by removing trailing slashes and handling relative paths.
 *
 * NOT a containment primitive: `normalizePath('./')` is `'/'`, which is why
 * {@link isPathSafe} no longer uses it (#5025). Kept for display/comparison of
 * path-like strings where the root semantics do not matter.
 */
export function normalizePath(p: string): string {
  // Remove trailing slashes
  let normalized = p.replace(/\/{1,100}$/, '');

  // Handle relative paths
  if (normalized === '.') {
    normalized = '';
  } else if (normalized.startsWith('./')) {
    normalized = normalized.slice(2);
  }

  // Ensure absolute-like comparison
  if (!normalized.startsWith('/')) {
    normalized = '/' + normalized;
  }

  return normalized;
}

/**
 * Extracts path from tool arguments if present.
 */
export function extractPathFromArgs(args: unknown): string | undefined {
  if (args === null || typeof args !== 'object') {
    return undefined;
  }

  const argsObj = args as Record<string, unknown>;

  // Common path field names
  const pathFields = ['path', 'filePath', 'file_path', 'directory', 'dir', 'target'];

  for (const field of pathFields) {
    const value = argsObj[field];
    if (typeof value === 'string') {
      return value;
    }
  }

  return undefined;
}
