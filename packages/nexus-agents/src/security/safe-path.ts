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

import { resolve, sep, dirname, basename, isAbsolute, relative } from 'node:path';
import * as fs from 'node:fs';

function isEnoent(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === 'ENOENT';
}

function getRealpathSync(): ((path: string) => string) | undefined {
  try {
    const fn = fs.realpathSync;
    if (typeof fn !== 'function') {
      return undefined;
    }
    return typeof fn.native === 'function' ? (p: string) => fn.native(p) : (p: string) => fn(p);
  } catch {
    return undefined;
  }
}

function canonicalizeRoot(root: string): string {
  const resolved = resolve(root);
  const realpathFn = getRealpathSync();
  if (realpathFn === undefined) {
    return resolved;
  }
  try {
    return realpathFn(resolved);
  } catch {
    return resolved;
  }
}

function resolvePathWithSymlinks(targetPath: string): string | null {
  const realpathFn = getRealpathSync();
  if (realpathFn === undefined) {
    return targetPath;
  }
  let existing = targetPath;
  const trailing: string[] = [];

  for (;;) {
    try {
      const real = realpathFn(existing);
      return trailing.length === 0 ? real : resolve(real, ...trailing.reverse());
    } catch (err: unknown) {
      if (!isEnoent(err)) {
        return null;
      }
      const parent = dirname(existing);
      if (parent === existing) {
        return null;
      }
      trailing.push(basename(existing));
      existing = parent;
    }
  }
}

function isWithin(parent: string, child: string): boolean {
  if (child === parent) return true;
  const rel = relative(parent, child);
  if (rel === '') return true;
  if (rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) return false;
  return true;
}

/**
 * Resolve a scanner-supplied path against the workspace root, returning null
 * if it escapes. Null means the caller must fall back to a safe alternative
 * (e.g., scanner-provided snippet) rather than reading the file.
 *
 * Verifies both lexical containment and filesystem symlink targets (#1813, #1814, Entry 117).
 *
 * @param filePath - Scanner-supplied path (may be relative or absolute)
 * @param root - Workspace root (defaults to process.cwd())
 * @returns Resolved absolute path if inside root, null otherwise
 */
export function resolveInsideRoot(filePath: string, root: string = process.cwd()): string | null {
  const canonicalRoot = canonicalizeRoot(root);
  const resolvedRoot = resolve(root);

  // Lexical resolution against uncanonicalized root to respect relative paths
  const lexicalResolved = resolve(resolvedRoot, filePath);

  // Check if lexical resolution escapes both resolved root and canonical root
  if (!isWithin(resolvedRoot, lexicalResolved) && !isWithin(canonicalRoot, lexicalResolved)) {
    return null;
  }

  // Canonicalize symlinks on existing ancestors and target file
  const realCandidate = resolvePathWithSymlinks(lexicalResolved);
  if (realCandidate === null) {
    return null;
  }

  // Verify that the canonicalized path is strictly within the canonical root
  if (!isWithin(canonicalRoot, realCandidate)) {
    return null;
  }

  return realCandidate;
}
