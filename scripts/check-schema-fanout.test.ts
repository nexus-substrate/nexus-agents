/**
 * Unit tests for check-schema-fanout.ts (#2408).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import {
  isSchemaChanged,
  findUntouchedConsumerTests,
  getChangedFiles,
} from './check-schema-fanout.js';

// ============================================================================
// Pure-function tests
// ============================================================================

describe('isSchemaChanged', () => {
  const schema = {
    name: 'TestSchema',
    source: 'src/foo-types.ts',
    marker: 'TestSchema',
    consumer_tests: ['src/foo.test.ts'],
    rationale: 'test',
  };

  it('returns false when source not in changed-files', () => {
    expect(isSchemaChanged(schema, ['src/other.ts'], () => '')).toBe(false);
  });

  it('returns true when diff has +/- line containing the marker', () => {
    const diff = [
      '@@ -1,3 +1,5 @@',
      '+export const TestSchema = z.object({',
      '+  newField: z.string(),',
      '+});',
    ].join('\n');
    expect(isSchemaChanged(schema, ['src/foo-types.ts'], () => diff)).toBe(true);
  });

  it('returns false when source changed but marker untouched', () => {
    const diff = [
      '@@ -1,3 +1,4 @@',
      '-import { Old } from "./old.js";',
      '+import { New } from "./new.js";',
    ].join('\n');
    expect(isSchemaChanged(schema, ['src/foo-types.ts'], () => diff)).toBe(false);
  });
});

describe('findUntouchedConsumerTests', () => {
  const schema = {
    name: 'TestSchema',
    source: 'src/foo-types.ts',
    marker: 'TestSchema',
    consumer_tests: ['src/a.test.ts', 'src/b.test.ts', 'src/c.test.ts'],
    rationale: 'test',
  };

  it('returns empty when at least one consumer test was changed', () => {
    expect(findUntouchedConsumerTests(schema, ['src/a.test.ts', 'src/foo-types.ts'])).toEqual([]);
  });

  it('returns empty when multiple consumer tests were changed', () => {
    expect(findUntouchedConsumerTests(schema, ['src/a.test.ts', 'src/b.test.ts'])).toEqual([]);
  });

  it('returns all consumer tests when none were changed', () => {
    expect(findUntouchedConsumerTests(schema, ['src/foo-types.ts'])).toEqual([
      'src/a.test.ts',
      'src/b.test.ts',
      'src/c.test.ts',
    ]);
  });
});

// ============================================================================
// Git integration test (mirrors check-registry-coverage.test.ts pattern)
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sch-fanout-test-'));
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

describe('getChangedFiles (schema-fanout)', () => {
  let ctx: RepoCtx;

  beforeEach(() => {
    ctx = setupRepo();
  });

  afterEach(() => {
    teardownRepo(ctx);
  });

  it('walks the PR commit range when GITHUB_BASE_REF is set', () => {
    git(ctx.dir, 'checkout -q -b feature');
    fs.writeFileSync(path.join(ctx.dir, 'schema.ts'), 'export const X = 1;\n');
    git(ctx.dir, 'add .');
    git(ctx.dir, 'commit -q -m "add schema"');

    git(ctx.dir, 'update-ref refs/remotes/origin/main main');
    process.env['GITHUB_BASE_REF'] = 'main';

    const changed = getChangedFiles(ctx.dir);
    expect(changed).toContain('schema.ts');
  });

  it('rejects malformed GITHUB_BASE_REF', () => {
    git(ctx.dir, 'checkout -q -b feature');
    fs.writeFileSync(path.join(ctx.dir, 'foo.ts'), 'x\n');
    git(ctx.dir, 'add .');
    git(ctx.dir, 'commit -q -m "add foo"');

    process.env['GITHUB_BASE_REF'] = 'main; rm -rf /';
    // Allowlist should reject this; falls back to HEAD~1...HEAD which has foo.ts
    const changed = getChangedFiles(ctx.dir);
    expect(changed).toContain('foo.ts');
  });
});
