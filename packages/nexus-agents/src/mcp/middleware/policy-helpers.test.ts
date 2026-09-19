/**
 * Tests for Policy Firewall Helpers
 * @module mcp/middleware/policy-helpers.test
 */

import { describe, it, expect } from 'vitest';
import { isPathSafe, extractPathFromArgs, extractPathsFromArgs } from './policy-helpers.js';

// ============================================================================
// isPathSafe
// ============================================================================

describe('isPathSafe', () => {
  it('returns true for path within allowed root', () => {
    expect(isPathSafe('/home/user/project/src/file.ts', ['/home/user/project'])).toBe(true);
  });

  it('returns false for path outside allowed roots', () => {
    expect(isPathSafe('/etc/passwd', ['/home/user/project'])).toBe(false);
  });

  it('handles multiple allowed roots', () => {
    expect(isPathSafe('/tmp/cache/file.txt', ['/home', '/tmp'])).toBe(true);
  });

  it('returns false for empty allowed paths', () => {
    expect(isPathSafe('/home/user/file.ts', [])).toBe(false);
  });

  it('handles trailing slashes in allowed paths', () => {
    expect(isPathSafe('/home/user/file.ts', ['/home/user/'])).toBe(true);
  });

  it('resolves a relative target against cwd, not against /', () => {
    // #5025: this asserted `isPathSafe('src/file.ts', ['/src']) === true`,
    // which only held because the old normalizer turned any non-absolute path
    // into `/` + path. A relative target belongs under the process's cwd.
    expect(isPathSafe('src/file.ts', ['/src'])).toBe(false);
    expect(isPathSafe('src/file.ts', ['.'])).toBe(true);
  });

  it('does not admit a sibling directory sharing the root prefix', () => {
    // #5025: this test was named "prevents path traversal via prefix matching"
    // and asserted the opposite — that `/home/user-evil/file` IS allowed under
    // `/home/user`, with a comment calling it "a known limitation". The name
    // described the intent; the assertion pinned the defect.
    expect(isPathSafe('/home/user-evil/file', ['/home/user'])).toBe(false);
    expect(isPathSafe('/home/user/file', ['/home/user'])).toBe(true);
  });

  it('does not admit every absolute path under the default allowlist (#5025)', () => {
    // The live defect. `allowedPaths` defaults to `['./']` in three places, and
    // `normalizePath('./')` is `'/'` — so `startsWith` was true for anything.
    // The startup posture line prints `allowedPaths: ['./']`, which reads as
    // "confined to cwd" and meant "/".
    expect(isPathSafe('/etc/shadow', ['./'])).toBe(false);
    expect(isPathSafe('/root/.ssh/id_ed25519', ['./'])).toBe(false);
  });

  it('admits the allowed root itself, not only paths beneath it', () => {
    // The separator boundary alone would deny the root directory: `/work`
    // does not start with `/work/`. Caught by mutation — nothing else in this
    // file exercised the exact-match arm.
    expect(isPathSafe('/work', ['/work'])).toBe(true);
    expect(isPathSafe('/work/', ['/work'])).toBe(true);
  });

  it('still admits a path genuinely under the default allowlist', () => {
    // The pair: `'./'` must mean cwd, not nothing.
    expect(isPathSafe(`${process.cwd()}/src/index.ts`, ['./'])).toBe(true);
  });
});

// ============================================================================
// extractPathFromArgs
// ============================================================================

describe('extractPathFromArgs', () => {
  it('extracts path field', () => {
    expect(extractPathFromArgs({ path: '/tmp/file.ts' })).toBe('/tmp/file.ts');
  });

  it('extracts filePath field', () => {
    expect(extractPathFromArgs({ filePath: '/tmp/file.ts' })).toBe('/tmp/file.ts');
  });

  it('extracts file_path field', () => {
    expect(extractPathFromArgs({ file_path: '/tmp/file.ts' })).toBe('/tmp/file.ts');
  });

  it('extracts directory field', () => {
    expect(extractPathFromArgs({ directory: '/tmp' })).toBe('/tmp');
  });

  it('extracts dir field', () => {
    expect(extractPathFromArgs({ dir: '/tmp' })).toBe('/tmp');
  });

  it('extracts target field', () => {
    expect(extractPathFromArgs({ target: '/tmp/out' })).toBe('/tmp/out');
  });

  it('extracts planFile field', () => {
    expect(extractPathFromArgs({ planFile: '/tmp/plan.md' })).toBe('/tmp/plan.md');
  });

  it('extracts specFile field', () => {
    expect(extractPathFromArgs({ specFile: '/tmp/spec.md' })).toBe('/tmp/spec.md');
  });

  it('extracts feedAPath and feedBPath fields', () => {
    expect(extractPathFromArgs({ feedAPath: '/tmp/a.json' })).toBe('/tmp/a.json');
    expect(extractPathFromArgs({ feedBPath: '/tmp/b.json' })).toBe('/tmp/b.json');
  });

  it('extracts projectDir field', () => {
    expect(extractPathFromArgs({ projectDir: '/tmp/proj' })).toBe('/tmp/proj');
  });

  it('extracts targetFile, sourcePath, destinationPath, destPath, outputPath, workingDir fields', () => {
    expect(extractPathFromArgs({ targetFile: '/tmp/target.ts' })).toBe('/tmp/target.ts');
    expect(extractPathFromArgs({ sourcePath: '/tmp/source.ts' })).toBe('/tmp/source.ts');
    expect(extractPathFromArgs({ destinationPath: '/tmp/dest.ts' })).toBe('/tmp/dest.ts');
    expect(extractPathFromArgs({ destPath: '/tmp/dest.ts' })).toBe('/tmp/dest.ts');
    expect(extractPathFromArgs({ outputPath: '/tmp/out.ts' })).toBe('/tmp/out.ts');
    expect(extractPathFromArgs({ workingDir: '/tmp/work' })).toBe('/tmp/work');
  });

  it('returns undefined for null', () => {
    expect(extractPathFromArgs(null)).toBeUndefined();
  });

  it('returns undefined for non-object', () => {
    expect(extractPathFromArgs('string')).toBeUndefined();
    expect(extractPathFromArgs(42)).toBeUndefined();
  });

  it('returns undefined when no path fields present', () => {
    expect(extractPathFromArgs({ name: 'test', count: 5 })).toBeUndefined();
  });

  it('returns undefined when path field is not a string', () => {
    expect(extractPathFromArgs({ path: 42 })).toBeUndefined();
    expect(extractPathFromArgs({ path: null })).toBeUndefined();
  });

  it('prefers earlier fields in priority order', () => {
    // 'path' comes before 'filePath' in the fields array
    expect(extractPathFromArgs({ path: '/a', filePath: '/b' })).toBe('/a');
  });
});

// ============================================================================
// extractPathsFromArgs
// ============================================================================

describe('extractPathsFromArgs', () => {
  it('returns empty array for non-objects or empty args', () => {
    expect(extractPathsFromArgs(null)).toEqual([]);
    expect(extractPathsFromArgs(undefined)).toEqual([]);
    expect(extractPathsFromArgs(123)).toEqual([]);
    expect(extractPathsFromArgs('path')).toEqual([]);
    expect(extractPathsFromArgs({})).toEqual([]);
  });

  it('extracts multiple path fields in priority order', () => {
    const paths = extractPathsFromArgs({
      feedBPath: '/data/feed-b.json',
      feedAPath: '/data/feed-a.json',
    });
    expect(paths).toEqual(['/data/feed-a.json', '/data/feed-b.json']);
  });

  it('extracts source and destination paths', () => {
    const paths = extractPathsFromArgs({
      sourcePath: '/src/file.ts',
      destinationPath: '/dst/file.ts',
    });
    expect(paths).toEqual(['/src/file.ts', '/dst/file.ts']);
  });

  it('extracts paths from array fields like paths, files, targetFiles', () => {
    expect(extractPathsFromArgs({ paths: ['/a/1.ts', '/a/2.ts'] })).toEqual(['/a/1.ts', '/a/2.ts']);
    expect(extractPathsFromArgs({ targetFiles: ['/b/1.ts'] })).toEqual(['/b/1.ts']);
    expect(extractPathsFromArgs({ files: ['/c/1.ts'] })).toEqual(['/c/1.ts']);
  });

  it('deduplicates identical paths across fields', () => {
    const paths = extractPathsFromArgs({
      path: '/common/file.ts',
      target: '/common/file.ts',
    });
    expect(paths).toEqual(['/common/file.ts']);
  });

  it('ignores non-filesystem path keys like keyPath, urlPath, jsonPath', () => {
    const paths = extractPathsFromArgs({
      keyPath: 'user.id',
      urlPath: '/api/v1/users',
      feedAPath: '/feeds/a.json',
    });
    expect(paths).toEqual(['/feeds/a.json']);
  });

  it('discovers custom path-like fields ending in Path, File, or Dir', () => {
    const paths = extractPathsFromArgs({
      customPlanFile: '/custom/plan.md',
      backupDir: '/custom/backup',
    });
    expect(paths).toEqual(['/custom/plan.md', '/custom/backup']);
  });

  it('ignores non-string array elements or non-string values', () => {
    const paths = extractPathsFromArgs({
      path: 999,
      paths: [1, null, true, '/valid/path.ts'],
    });
    expect(paths).toEqual(['/valid/path.ts']);
  });
});
