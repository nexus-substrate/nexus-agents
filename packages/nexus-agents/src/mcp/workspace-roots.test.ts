/**
 * Tests for deriveWorkspaceRootFromRoots (#3991) — picking a single repo root
 * from the client's declared MCP `roots`.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { deriveWorkspaceRootFromRoots, type McpRoot } from './workspace-roots.js';

describe('deriveWorkspaceRootFromRoots', () => {
  let plainDir: string;
  let gitDir: string;

  beforeEach(() => {
    plainDir = mkdtempSync(join(tmpdir(), 'nexus-roots-plain-'));
    gitDir = mkdtempSync(join(tmpdir(), 'nexus-roots-git-'));
    mkdirSync(join(gitDir, '.git'));
  });

  afterEach(() => {
    rmSync(plainDir, { recursive: true, force: true });
    rmSync(gitDir, { recursive: true, force: true });
  });

  it('returns null for an empty list', () => {
    expect(deriveWorkspaceRootFromRoots([])).toBe(null);
  });

  it('converts a single file:// root to a filesystem path', () => {
    const root = { uri: pathToFileURL(plainDir).href };
    expect(deriveWorkspaceRootFromRoots([root])).toBe(plainDir);
  });

  it('prefers the root that contains a .git over earlier non-git roots', () => {
    const roots = [{ uri: pathToFileURL(plainDir).href }, { uri: pathToFileURL(gitDir).href }];
    expect(deriveWorkspaceRootFromRoots(roots)).toBe(gitDir);
  });

  it('falls back to the first usable root when none contain a .git', () => {
    const other = mkdtempSync(join(tmpdir(), 'nexus-roots-other-'));
    try {
      const roots = [{ uri: pathToFileURL(plainDir).href }, { uri: pathToFileURL(other).href }];
      expect(deriveWorkspaceRootFromRoots(roots)).toBe(plainDir);
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });

  it('ignores non-file:// schemes', () => {
    const roots = [{ uri: 'https://example.com/repo' }, { uri: pathToFileURL(gitDir).href }];
    expect(deriveWorkspaceRootFromRoots(roots)).toBe(gitDir);
  });

  it('returns null when every root is a non-file scheme', () => {
    expect(deriveWorkspaceRootFromRoots([{ uri: 'https://example.com/repo' }])).toBe(null);
  });

  it('skips malformed entries without throwing', () => {
    // Intentionally malformed (a non-string uri, a missing uri) to exercise the
    // runtime guard; cast through unknown since the type forbids these shapes.
    const roots = [{ uri: 42 }, { name: 'no-uri' }, { uri: pathToFileURL(plainDir).href }];
    expect(deriveWorkspaceRootFromRoots(roots as unknown as McpRoot[])).toBe(plainDir);
  });
});
