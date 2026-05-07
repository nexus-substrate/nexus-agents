/**
 * Unit tests for check-orphans.ts (#2410).
 *
 * Tests the pure helpers (allowlist matching, glob conversion, filter logic).
 * Skips the knip invocation itself — that's an integration concern best
 * verified manually or in CI; mocking knip would tautologize the test.
 */

import { describe, it, expect } from 'vitest';

import { globToRegExp, isAllowlisted, extractOrphans, filterOrphans } from './check-orphans.js';

describe('globToRegExp', () => {
  it('matches simple file globs', () => {
    expect(globToRegExp('scripts/*.ts').test('scripts/foo.ts')).toBe(true);
    expect(globToRegExp('scripts/*.ts').test('scripts/sub/foo.ts')).toBe(false);
  });

  it('matches deep globs with **', () => {
    expect(globToRegExp('scripts/**/*.ts').test('scripts/foo.ts')).toBe(true);
    expect(globToRegExp('scripts/**/*.ts').test('scripts/sub/foo.ts')).toBe(true);
    expect(globToRegExp('scripts/**/*.ts').test('scripts/a/b/c.ts')).toBe(true);
  });

  it('matches **/migrations/** anywhere', () => {
    const re = globToRegExp('**/migrations/**');
    expect(re.test('packages/foo/migrations/0001.ts')).toBe(true);
    expect(re.test('migrations/0001.ts')).toBe(true);
    expect(re.test('packages/foo/src/foo.ts')).toBe(false);
  });

  it('matches simple suffix globs', () => {
    const re = globToRegExp('**/*.test.ts');
    expect(re.test('foo.test.ts')).toBe(true);
    expect(re.test('packages/foo/src/foo.test.ts')).toBe(true);
    expect(re.test('packages/foo/src/foo.ts')).toBe(false);
  });
});

describe('isAllowlisted', () => {
  const allowlist = {
    version: '1.0.0',
    patterns: [
      { glob: 'scripts/**/*.ts', rationale: 'CLI scripts' },
      { glob: '**/*.test.ts', rationale: 'tests' },
    ],
    specific_files: [{ path: 'packages/foo/src/special.ts', rationale: 'one-off bootstrap' }],
  };

  it('matches files via glob patterns', () => {
    expect(isAllowlisted('scripts/build.ts', allowlist)).toBe(true);
    expect(isAllowlisted('scripts/sub/migrate.ts', allowlist)).toBe(true);
    expect(isAllowlisted('packages/foo/src/x.test.ts', allowlist)).toBe(true);
  });

  it('matches files via specific-files entries', () => {
    expect(isAllowlisted('packages/foo/src/special.ts', allowlist)).toBe(true);
  });

  it('does not match unrelated files', () => {
    expect(isAllowlisted('packages/foo/src/regular.ts', allowlist)).toBe(false);
    expect(isAllowlisted('docs/foo.md', allowlist)).toBe(false);
  });
});

describe('extractOrphans', () => {
  it('extracts file names from knip issues', () => {
    const issues = [
      { file: 'a.ts', files: [{ name: 'a.ts' }] },
      { file: 'b.ts', files: [{ name: 'b.ts' }] },
    ];
    expect(extractOrphans(issues)).toEqual(['a.ts', 'b.ts']);
  });

  it('returns sorted unique paths even if knip reports duplicates', () => {
    const issues = [
      { file: 'b.ts', files: [{ name: 'b.ts' }] },
      { file: 'a.ts', files: [{ name: 'a.ts' }] },
      { file: 'b.ts', files: [{ name: 'b.ts' }] },
    ];
    expect(extractOrphans(issues)).toEqual(['a.ts', 'b.ts']);
  });

  it('handles issues with no files entry (different knip issue type)', () => {
    const issues = [{ file: 'has-export-issue.ts' }];
    expect(extractOrphans(issues)).toEqual([]);
  });
});

describe('filterOrphans', () => {
  const allowlist = {
    version: '1.0.0',
    patterns: [{ glob: 'scripts/**/*.ts', rationale: 'CLI scripts' }],
    specific_files: [],
  };

  it('removes allowlisted entries', () => {
    const orphans = ['scripts/foo.ts', 'packages/foo/src/orphan.ts'];
    expect(filterOrphans(orphans, allowlist)).toEqual(['packages/foo/src/orphan.ts']);
  });

  it('returns all orphans if none are allowlisted', () => {
    const orphans = ['packages/foo/src/a.ts', 'packages/bar/src/b.ts'];
    expect(filterOrphans(orphans, allowlist)).toEqual([
      'packages/foo/src/a.ts',
      'packages/bar/src/b.ts',
    ]);
  });

  it('returns empty when all orphans are allowlisted', () => {
    const orphans = ['scripts/a.ts', 'scripts/sub/b.ts'];
    expect(filterOrphans(orphans, allowlist)).toEqual([]);
  });
});
