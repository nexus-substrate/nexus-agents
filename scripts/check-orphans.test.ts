/**
 * Unit tests for check-orphans.ts (#2410).
 *
 * Tests the pure helpers (allowlist matching, glob conversion, filter logic).
 * Skips the knip invocation itself — that's an integration concern best
 * verified manually or in CI; mocking knip would tautologize the test.
 */

import { describe, it, expect } from 'vitest';

import {
  classifyKnipOutput,
  globToRegExp,
  isAllowlisted,
  extractOrphans,
  filterOrphans,
  validateAllowlist,
  isPassing,
} from './check-orphans.js';

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

describe('validateAllowlist (#4583 — every one-off exemption declares its intent)', () => {
  const base = { version: '1.0.0', patterns: [] };

  it('accepts an entry that declares an expiry', () => {
    const allowlist = {
      ...base,
      specific_files: [{ path: 'a.ts', rationale: 'temporary', expires: '2099-01-01' }],
    };
    expect(validateAllowlist(allowlist)).toEqual([]);
  });

  it('accepts an entry that declares itself permanent', () => {
    const allowlist = {
      ...base,
      specific_files: [{ path: 'a.ts', rationale: 'loaded by name', permanent: true }],
    };
    expect(validateAllowlist(allowlist)).toEqual([]);
  });

  it('rejects an entry declaring neither, naming the file', () => {
    const allowlist = {
      ...base,
      specific_files: [{ path: 'packages/foo/src/mystery.ts', rationale: 'unexplained' }],
    };
    const errors = validateAllowlist(allowlist);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('packages/foo/src/mystery.ts');
    expect(errors[0]).toContain('expires');
    expect(errors[0]).toContain('permanent');
  });

  it('rejects an entry declaring both, naming the file', () => {
    const allowlist = {
      ...base,
      specific_files: [
        { path: 'both.ts', rationale: 'confused', expires: '2099-01-01', permanent: true },
      ],
    };
    const errors = validateAllowlist(allowlist);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('both.ts');
  });

  it('rejects an unparseable expires date rather than treating it as never-expiring', () => {
    const allowlist = {
      ...base,
      specific_files: [{ path: 'bad-date.ts', rationale: 'typo', expires: 'someday' }],
    };
    const errors = validateAllowlist(allowlist);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('bad-date.ts');
  });
});

describe('isAllowlisted honours expiry (#4583)', () => {
  const now = new Date('2026-08-23T12:00:00Z');
  const mk = (
    entry: Record<string, unknown>
  ): { version: string; patterns: []; specific_files: never[] } => ({
    version: '1.0.0',
    patterns: [],
    specific_files: [entry as never],
  });

  it('keeps exempting an entry whose expires date is in the future', () => {
    expect(
      isAllowlisted('a.ts', mk({ path: 'a.ts', rationale: 'r', expires: '2026-12-31' }), now)
    ).toBe(true);
  });

  it('stops exempting an entry whose expires date has passed', () => {
    expect(
      isAllowlisted('a.ts', mk({ path: 'a.ts', rationale: 'r', expires: '2026-01-01' }), now)
    ).toBe(false);
  });

  it('exempts a permanent entry regardless of the clock', () => {
    expect(isAllowlisted('a.ts', mk({ path: 'a.ts', rationale: 'r', permanent: true }), now)).toBe(
      true
    );
  });

  it('flags an expired file through filterOrphans', () => {
    const allowlist = mk({
      path: 'packages/foo/src/stale.ts',
      rationale: 'r',
      expires: '2026-01-01',
    });
    expect(filterOrphans(['packages/foo/src/stale.ts'], allowlist, now)).toEqual([
      'packages/foo/src/stale.ts',
    ]);
  });
});

describe('classifyKnipOutput (#5028)', () => {
  it('reports empty output as not run, not as a clean scan', () => {
    const run = classifyKnipOutput('   ');

    expect(run.ran).toBe(false);
    expect(run.issues).toEqual([]);
  });

  it('reports unparseable output as not run', () => {
    // A knip bumped past a reporter change emits something that is not JSON.
    const run = classifyKnipOutput('Error: unknown --reporter');

    expect(run.ran).toBe(false);
    expect(String(run.reason)).toContain('parseable');
  });

  it('reports JSON in an unrecognised shape as not run (#5034)', () => {
    // `normalizeKnipJson` returned `[]` for any shape it did not understand, so
    // a reporter change — the case this check exists for — parsed cleanly and
    // reported a completed scan of zero issues. My own fix shipped with a test
    // asserting `{"files":[]}` counted as a clean scan; that fixture IS the
    // reporter-change case.
    const run = classifyKnipOutput('{"files":[]}');

    expect(run.ran).toBe(false);
    expect(String(run.reason)).toContain('recognised reporter shape');
  });

  it('reports a genuine empty result as a completed scan', () => {
    // The pair: a real clean repo must not be reported as unmeasured. Both
    // shapes the normalizer actually understands.
    expect(classifyKnipOutput('[]').ran).toBe(true);
    expect(classifyKnipOutput('{"issues":[]}').ran).toBe(true);
  });
});

describe('isPassing (#4583 — the gate blocks instead of always returning true)', () => {
  it('fails when any orphan is flagged', () => {
    expect(
      isPassing({
        total: 1,
        allowlisted: 0,
        flagged: ['packages/foo/src/orphan.ts'],
        scanned: true,
      })
    ).toBe(false);
  });

  it('passes when nothing is flagged', () => {
    expect(isPassing({ total: 22, allowlisted: 22, flagged: [], scanned: true })).toBe(true);
  });

  it('fails when knip never ran, rather than reporting a clean repo (#5028)', () => {
    // `runKnip` returned `[]` on every failure path — empty stdout,
    // unparseable JSON, a throw — with stderr suppressed, and `[]` is also
    // what a clean scan produces. A knip broken by a reporter or config change
    // printed "Total orphans (knip): 0 / ✓ No flagged orphans" and exited 0.
    // This repo carries 22 allowlisted orphans, so total===0 is in fact the
    // signature of a dead run.
    expect(
      isPassing({
        total: 0,
        allowlisted: 0,
        flagged: [],
        scanned: false,
        unscannedReason: 'knip produced no output',
      })
    ).toBe(false);
  });
});
