/**
 * Unit tests for check-registry-coverage.ts (#2406).
 *
 * Strategy:
 *   - isRegistryChanged + findMissingPeers are pure — test directly against
 *     synthetic registry/diff fixtures.
 *   - performCheck sits on top of git, fs, env. Test it via a temp-repo
 *     integration test similar to scripts/check-docops-skill.test.ts.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import {
  isRegistryChanged,
  findMissingPeers,
  getChangedFiles,
  extractMarkerEntries,
  isUnmeasurableManifest,
} from './check-registry-coverage.js';

// ============================================================================
// Pure-function tests
// ============================================================================

describe('isRegistryChanged', () => {
  const registry = {
    name: 'TEST_REG',
    source: 'src/foo.ts',
    marker: 'export const TEST_REG',
    peer_files: ['src/foo-types.ts'],
    rationale: 'test',
  };

  it('returns false when source file not in changed-files set', () => {
    expect(isRegistryChanged(registry, ['src/other.ts'], () => '')).toBe(false);
  });

  it('returns true when diff has + or - line containing the marker', () => {
    const diff = [
      'diff --git a/src/foo.ts b/src/foo.ts',
      '--- a/src/foo.ts',
      '+++ b/src/foo.ts',
      '@@ -1,3 +1,4 @@',
      '+export const TEST_REG: Foo[] = [',
      '+  { name: "new-entry" },',
      '+];',
    ].join('\n');
    const diffOf = (): string => diff;
    expect(isRegistryChanged(registry, ['src/foo.ts'], diffOf)).toBe(true);
  });

  it('returns false when source changed but marker line was not touched', () => {
    const diff = [
      'diff --git a/src/foo.ts b/src/foo.ts',
      '--- a/src/foo.ts',
      '+++ b/src/foo.ts',
      '@@ -1,3 +1,4 @@',
      '-import { Old } from "./old.js";',
      '+import { New } from "./new.js";',
    ].join('\n');
    const diffOf = (): string => diff;
    expect(isRegistryChanged(registry, ['src/foo.ts'], diffOf)).toBe(false);
  });
});

// Structural-equivalence exemption (#2935) — marker line touched but the
// array entries are identical → cosmetic change (export keyword, comment,
// formatting) → gate should not fire.
describe('isRegistryChanged structural-equivalence exemption', () => {
  const registry = {
    name: 'TEST_REG',
    source: 'src/foo.ts',
    marker: 'TEST_REG',
    peer_files: ['src/foo-types.ts'],
    rationale: 'test',
  };

  // The diff touches the marker line — line-detection alone would fire.
  const markerTouchDiff = [
    '--- a/src/foo.ts',
    '+++ b/src/foo.ts',
    '@@ -1 +1 @@',
    '-const TEST_REG = [',
    '+export const TEST_REG = [',
  ].join('\n');

  it('exempts when before and after array entries are identical', () => {
    const oldContent = `const TEST_REG = ['a', 'b', 'c'] as const;`;
    const newContent = `export const TEST_REG = ['a', 'b', 'c'] as const;`;
    const diffOf = (): string => markerTouchDiff;
    const baseOf = (): string => oldContent;
    const currentOf = (): string => newContent;
    expect(isRegistryChanged(registry, ['src/foo.ts'], diffOf, baseOf, currentOf)).toBe(false);
  });

  it('still fires when entries actually changed', () => {
    const oldContent = `const TEST_REG = ['a', 'b'] as const;`;
    const newContent = `const TEST_REG = ['a', 'b', 'c'] as const;`;
    const diffOf = (): string => markerTouchDiff;
    const baseOf = (): string => oldContent;
    const currentOf = (): string => newContent;
    expect(isRegistryChanged(registry, ['src/foo.ts'], diffOf, baseOf, currentOf)).toBe(true);
  });

  it('falls back to line-based detection when pre-image fetch fails', () => {
    const diffOf = (): string => markerTouchDiff;
    const baseOf = (): string | null => null; // simulates `git show` failure
    const currentOf = (): string => `const TEST_REG = ['a'] as const;`;
    expect(isRegistryChanged(registry, ['src/foo.ts'], diffOf, baseOf, currentOf)).toBe(true);
  });

  it('falls back to line-based detection when current-file read fails', () => {
    const diffOf = (): string => markerTouchDiff;
    const baseOf = (): string => `const TEST_REG = ['a'] as const;`;
    const currentOf = (): string | null => null; // simulates fs read failure
    expect(isRegistryChanged(registry, ['src/foo.ts'], diffOf, baseOf, currentOf)).toBe(true);
  });
});

describe('isRegistryChanged moved_from relocation exemption (#3566)', () => {
  // Registry relocated: list moved from old.ts (marker OLD_REG) to new.ts
  // (marker NEW_REG), contents unchanged. The new source has no base.
  const registry = {
    name: 'RELOCATED',
    source: 'src/new.ts',
    marker: 'NEW_REG',
    peer_files: ['src/peer.ts'],
    rationale: 'test',
    moved_from: 'src/old.ts',
    moved_from_marker: 'OLD_REG',
  };
  const diffOf = (): string =>
    ['--- /dev/null', '+++ b/src/new.ts', '@@ -0,0 +1 @@', '+export const NEW_REG = ['].join('\n');

  it('exempts a no-op relocation (same entries under the old marker at base)', () => {
    const baseOf = (p: string): string | null =>
      p === 'src/old.ts' ? `const OLD_REG = ['a', 'b', 'c'] as const;` : null; // new.ts absent at base
    const currentOf = (): string => `export const NEW_REG = ['a', 'b', 'c'] as const;`;
    expect(isRegistryChanged(registry, ['src/new.ts'], diffOf, baseOf, currentOf)).toBe(false);
  });

  it('still fires when the relocation also changed entries', () => {
    const baseOf = (p: string): string | null =>
      p === 'src/old.ts' ? `const OLD_REG = ['a', 'b'] as const;` : null;
    const currentOf = (): string => `export const NEW_REG = ['a', 'b', 'c'] as const;`;
    expect(isRegistryChanged(registry, ['src/new.ts'], diffOf, baseOf, currentOf)).toBe(true);
  });
});

describe('extractMarkerEntries', () => {
  it('extracts a sorted, de-duplicated list', () => {
    const content = `const FOO = ['c', 'a', 'b', 'a'] as const;`;
    expect(extractMarkerEntries(content, 'FOO')).toEqual(['a', 'b', 'c']);
  });

  it('returns null when marker is absent', () => {
    expect(extractMarkerEntries('const OTHER = [1, 2];', 'FOO')).toBeNull();
  });

  it('returns null when the array has no string literals', () => {
    expect(extractMarkerEntries('const FOO = [1, 2, 3];', 'FOO')).toBeNull();
  });

  it('handles regex-special characters in the marker', () => {
    const content = `const FOO_BAR$ = ['x'] as const;`;
    expect(extractMarkerEntries(content, 'FOO_BAR$')).toEqual(['x']);
  });
});

describe('findMissingPeers', () => {
  const registry = {
    name: 'TEST_REG',
    source: 'src/foo.ts',
    marker: 'TEST_REG',
    peer_files: ['src/a.ts', 'src/b.ts', 'src/c.ts'],
    rationale: 'test',
  };

  it('returns empty when all peers are in the changed-files set', () => {
    expect(findMissingPeers(registry, ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/foo.ts'])).toEqual(
      []
    );
  });

  it('returns the missing peers in declaration order', () => {
    expect(findMissingPeers(registry, ['src/a.ts', 'src/foo.ts'])).toEqual([
      'src/b.ts',
      'src/c.ts',
    ]);
  });

  it('returns all peers when none are in the changed-files set', () => {
    expect(findMissingPeers(registry, ['src/foo.ts'])).toEqual([
      'src/a.ts',
      'src/b.ts',
      'src/c.ts',
    ]);
  });
});

// ============================================================================
// Git-based getChangedFiles
// ============================================================================

interface RepoCtx {
  dir: string;
  origCwd: string;
  origBaseRef: string | undefined;
}

function git(repoDir: string, cmd: string): string {
  return execSync(`git -C "${repoDir}" ${cmd}`, { encoding: 'utf-8' });
}

function setupRepo(): RepoCtx {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reg-cov-test-'));
  const origCwd = process.cwd();
  const origBaseRef = process.env['GITHUB_BASE_REF'];

  git(dir, 'init -q -b main');
  git(dir, 'config user.email test@example.com');
  git(dir, 'config user.name Test');
  fs.writeFileSync(path.join(dir, 'README.md'), '# initial\n');
  git(dir, 'add README.md');
  git(dir, 'commit -q -m "initial commit"');

  process.chdir(dir);
  return { dir, origCwd, origBaseRef };
}

function teardownRepo(ctx: RepoCtx): void {
  process.chdir(ctx.origCwd);
  if (ctx.origBaseRef === undefined) {
    delete process.env['GITHUB_BASE_REF'];
  } else {
    process.env['GITHUB_BASE_REF'] = ctx.origBaseRef;
  }
  fs.rmSync(ctx.dir, { recursive: true, force: true });
}

describe('getChangedFiles', () => {
  let ctx: RepoCtx;

  beforeEach(() => {
    ctx = setupRepo();
  });

  afterEach(() => {
    teardownRepo(ctx);
  });

  it('walks the PR commit range when GITHUB_BASE_REF is set', () => {
    git(ctx.dir, 'checkout -q -b feature');
    fs.writeFileSync(path.join(ctx.dir, 'src-foo.ts'), 'export const X = 1;\n');
    fs.writeFileSync(path.join(ctx.dir, 'src-bar.ts'), 'export const Y = 2;\n');
    git(ctx.dir, 'add .');
    git(ctx.dir, 'commit -q -m "add foo and bar"');

    git(ctx.dir, 'update-ref refs/remotes/origin/main main');
    process.env['GITHUB_BASE_REF'] = 'main';

    const changed = getChangedFiles(ctx.dir);
    expect(changed).toContain('src-foo.ts');
    expect(changed).toContain('src-bar.ts');
  });

  it('falls back to HEAD~1 when no base ref is set', () => {
    delete process.env['GITHUB_BASE_REF'];
    fs.writeFileSync(path.join(ctx.dir, 'note.txt'), 'one\n');
    git(ctx.dir, 'add note.txt');
    git(ctx.dir, 'commit -q -m "add note"');

    const changed = getChangedFiles(ctx.dir);
    expect(changed).toContain('note.txt');
  });
});

describe('an empty manifest is unmeasured, not clean (#4586)', () => {
  it('treats zero declared registries as unmeasurable', () => {
    // `success: violations.length === 0` is satisfied by an empty manifest, so
    // emptying `registries` made the gate green while inspecting nothing — and
    // `validateManifest`'s bitrot loop had no entries to catch it either.
    expect(isUnmeasurableManifest(0)).toBe(true);
  });

  it('treats a populated manifest as measurable', () => {
    // The pair: without it, "always unmeasurable" would satisfy the test above.
    expect(isUnmeasurableManifest(1)).toBe(false);
    expect(isUnmeasurableManifest(12)).toBe(false);
  });
});
