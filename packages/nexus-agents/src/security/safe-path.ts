/**
 * Safe Path — Path traversal guards for scanner-controlled inputs (#1813, #1814)
 *
 * When reading files whose path comes from untrusted input (e.g., SARIF
 * scanner output), we must verify the resolved path stays within the
 * workspace root. Without this, a malicious scanner can cause arbitrary
 * file reads whose contents are exfiltrated via downstream LLM prompts
 * (CWE-22).
 *
 * Shared helper to prevent the finding-triage/fix-generator drift that
 * required two separate fixes.
 *
 * @module security/safe-path
 */

import { resolve } from 'node:path';

/**
 * Resolve a scanner-supplied path against the workspace root, returning null
 * if it escapes. Null means the caller must fall back to a safe alternative
 * (e.g., scanner-provided snippet) rather than reading the file.
 *
 * @param filePath - Scanner-supplied path (may be relative or absolute)
 * @param root - Workspace root (defaults to process.cwd())
 * @returns Resolved absolute path if inside root, null otherwise
 */
export function resolveInsideRoot(filePath: string, root: string = process.cwd()): string | null {
  const resolvedRoot = resolve(root);
  const resolved = resolve(resolvedRoot, filePath);
  if (resolved === resolvedRoot) return resolved;
  if (resolved.startsWith(resolvedRoot + '/')) return resolved;
  return null;
}
