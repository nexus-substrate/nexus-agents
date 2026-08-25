/**
 * Integration tests for the release secret scan (#4839).
 *
 * These deliberately use the REAL `execSync` against a REAL temporary git
 * repository. The defect being fixed was a property of shell semantics — a
 * pipeline's exit status is its last command's — which a mocked `execSync`
 * cannot reproduce. Mocking here would assert the fix without testing it.
 *
 * @module cli/release-validate-secret-scan.test
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanRecentCommitsForSecrets } from './release-secret-scan.js';

/** A repo with a single commit: `git diff HEAD~10..HEAD` cannot resolve. */
let shallowRepo: string;

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', args, { cwd, stdio: 'ignore' });
}

beforeAll(() => {
  shallowRepo = mkdtempSync(join(tmpdir(), 'nexus-secret-scan-'));
  git(shallowRepo, 'init', '-q');
  git(shallowRepo, 'config', 'user.email', 'test@example.invalid');
  git(shallowRepo, 'config', 'user.name', 'Test');
  writeFileSync(join(shallowRepo, 'a.ts'), 'export const a = 1;\n');
  git(shallowRepo, 'add', '-A');
  git(shallowRepo, 'commit', '-q', '-m', 'initial');
});

afterAll(() => {
  rmSync(shallowRepo, { recursive: true, force: true });
});

describe('scanRecentCommitsForSecrets (#4839)', () => {
  it('reports that it did not run when the git range cannot be resolved', () => {
    // Fewer than ten commits — the shallow-clone case the old catch block
    // named in its remediation but could never reach, because `git`'s exit
    // code was masked by the `| grep | head` it was piped through.
    const result = scanRecentCommitsForSecrets({ cwd: shallowRepo });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).not.toBe('');
    }
  });

  it('reports a clean scan as scanned, not as failed', () => {
    // The counterpart. Without it, "always return ok:false" would pass the
    // test above, and every release would carry a spurious warning.
    const result = scanRecentCommitsForSecrets({ cwd: process.cwd(), range: 'HEAD~1..HEAD' });

    expect(result.ok).toBe(true);
  });

  it('returns the matching lines when a recent commit contains a secret-like token', () => {
    const repo = mkdtempSync(join(tmpdir(), 'nexus-secret-scan-hit-'));
    try {
      git(repo, 'init', '-q');
      git(repo, 'config', 'user.email', 'test@example.invalid');
      git(repo, 'config', 'user.name', 'Test');
      writeFileSync(join(repo, 'a.ts'), 'export const a = 1;\n');
      git(repo, 'add', '-A');
      git(repo, 'commit', '-q', '-m', 'initial');
      writeFileSync(join(repo, 'a.ts'), 'export const API_KEY = "nope";\n');
      git(repo, 'add', '-A');
      git(repo, 'commit', '-q', '-m', 'second');

      const result = scanRecentCommitsForSecrets({ cwd: repo, range: 'HEAD~1..HEAD' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.matches.some((line) => line.includes('API_KEY'))).toBe(true);
      }
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
