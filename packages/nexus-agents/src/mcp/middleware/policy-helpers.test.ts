/**
 * Tests for Policy Firewall Helpers
 * @module mcp/middleware/policy-helpers.test
 */

import { describe, it, expect } from 'vitest';
import { isPathSafe, extractPathFromArgs } from './policy-helpers.js';

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
