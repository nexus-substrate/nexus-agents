/**
 * Ratchet for #5053: the research registry lives in exactly one place — the
 * repo root's `docs/research/registry`. A second copy below the root (the
 * package dir grew an empty one when a server started with cwd there) is a
 * shadow registry that a cwd-dependent resolver silently reads instead.
 *
 * The test cannot pass vacuously: it also asserts the root registry exists
 * with the YAML files the research tools load, so an empty scan of the wrong
 * tree fails on that half instead of reporting "no shadows".
 */

import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { findRepoRoot } from '../config/repo-root-detection.js';
import { PAPERS_FILE, REGISTRY_PATH, TECHNIQUES_FILE } from './research-helpers-io.js';

/** Directories never scanned: dependencies, VCS internals, build output, agent scratch. */
const SKIPPED_DIR_NAMES = new Set([
  'node_modules',
  '.git',
  'dist',
  'coverage',
  '.claude',
  '.nexus-agents',
  '.changeset',
]);

const REGISTRY_SUFFIX = `${sep}${REGISTRY_PATH.split('/').join(sep)}`;

function findRegistryDirs(dir: string, found: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    // Dirent.isDirectory() is false for symlinks, so linked node_modules and
    // similar are never followed even before the name check.
    if (!entry.isDirectory() || SKIPPED_DIR_NAMES.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (full.endsWith(REGISTRY_SUFFIX)) {
      found.push(full);
      continue;
    }
    findRegistryDirs(full, found);
  }
}

describe('research registry has a single root (#5053)', () => {
  const repoRoot = findRepoRoot(dirname(fileURLToPath(import.meta.url)));

  it('the root registry exists with the YAML files the research tools load', () => {
    expect(repoRoot).not.toBeNull();
    if (repoRoot === null) return;
    const rootRegistry = join(repoRoot, REGISTRY_PATH);
    expect(statSync(rootRegistry).isDirectory()).toBe(true);
    for (const file of [PAPERS_FILE, TECHNIQUES_FILE]) {
      expect(existsSync(join(rootRegistry, file)), `${file} missing at ${rootRegistry}`).toBe(true);
    }
  });

  it('no docs/research/registry directory exists anywhere below the root one', () => {
    expect(repoRoot).not.toBeNull();
    if (repoRoot === null) return;
    const found: string[] = [];
    findRegistryDirs(repoRoot, found);
    expect(found).toEqual([join(repoRoot, REGISTRY_PATH)]);
  });
});
