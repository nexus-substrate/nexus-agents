/** Isolation selection shared by implementation checkouts and baseline archives. */
import { existsSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { getNexusTmpDir } from '../config/nexus-tmp-dir.js';

/** Whether a canonical child path is equal to or inside a parent. */
function contains(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

/** Whether two canonical paths are equal or one contains the other. */
function overlaps(a: string, b: string): boolean {
  return contains(a, b) || contains(b, a);
}

/**
 * Prefer the existing NEXUS_TMPDIR resolver. The default `<repo>/.nexus-agents/tmp`
 * can be inside the source: neither PATCH_PATHS nor COMPLETE_SCAN_FLAGS excludes
 * `.nexus-agents`, and the sandbox/gate refuses overlapping implementation trees.
 * Keep the OS-root exception for that case instead of nesting scratch copies in
 * captured/scanned inputs. An OS root containing the source is safe: callers allocate fresh, distinct children via
 * mkdtemp or a UUID-named Git worktree, creating siblings rather than nesting.
 */
export function pipelineScratchRoot(protectedPaths: readonly string[]): string {
  const canonical = (path: string): string =>
    existsSync(path) ? realpathSync(path) : resolve(path);
  const occupied = protectedPaths.map(canonical);
  const preferred = canonical(getNexusTmpDir());
  if (!occupied.some((path) => overlaps(preferred, path))) return preferred;
  // As before #7302: the OS temp root is the fallback even when it lies inside a
  // protected tree (CI puts TMPDIR inside the package cwd). Callers allocate a
  // fresh child there, and the quality gate's own isolation check still fails
  // closed if that child overlaps a scanned tree.
  return canonical(tmpdir());
}
