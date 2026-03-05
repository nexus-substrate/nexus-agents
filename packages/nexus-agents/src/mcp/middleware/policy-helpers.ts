/**
 * nexus-agents/mcp - Policy Firewall Helpers
 *
 * Utility functions for path validation and argument extraction.
 *
 * (Source: OWASP ASVS 4.0, Authorization Controls)
 */

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
  // Normalize the target path
  const normalizedTarget = normalizePath(targetPath);

  // Check if any allowed path is a prefix of the target
  for (const allowed of allowedPaths) {
    const normalizedAllowed = normalizePath(allowed);
    if (normalizedTarget.startsWith(normalizedAllowed)) {
      return true;
    }
  }

  return false;
}

/**
 * Normalizes a path by removing trailing slashes and handling relative paths.
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
