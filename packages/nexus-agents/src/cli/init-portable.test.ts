/**
 * Tests for `nexus-agents init --portable` (#2305, child of #2301).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  DEFAULT_PORTABLE_DIRNAME,
  formatInitPortableMessage,
  initPortable,
} from './init-portable.js';
import { DATA_SUBDIRECTORIES } from './doctor.js';

let tmpRoot: string;
let originalCwd: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-init-test-'));
  originalCwd = process.cwd();
  process.chdir(tmpRoot);
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('initPortable', () => {
  it('creates default .nexus-agents/ in cwd when no path is given', () => {
    const result = initPortable();
    expect(result.success).toBe(true);
    expect(result.absolutePath).toBe(path.resolve(tmpRoot, DEFAULT_PORTABLE_DIRNAME));
    expect(fs.existsSync(result.absolutePath)).toBe(true);
  });

  it('creates all 9 data subdirectories', () => {
    const result = initPortable();
    expect(result.success).toBe(true);
    for (const subdir of DATA_SUBDIRECTORIES) {
      expect(fs.existsSync(path.join(result.absolutePath, subdir))).toBe(true);
    }
  });

  it('sets restricted permissions (0o700) on auth/ subdir', () => {
    const result = initPortable();
    expect(result.success).toBe(true);
    if (process.platform === 'win32') return; // skip perm check on Windows
    const authStat = fs.statSync(path.join(result.absolutePath, 'auth'));
    expect(authStat.mode & 0o777).toBe(0o700);
  });

  it('accepts a custom relative path', () => {
    const result = initPortable({ path: '.nexus' });
    expect(result.success).toBe(true);
    expect(result.absolutePath).toBe(path.resolve(tmpRoot, '.nexus'));
    expect(fs.existsSync(result.absolutePath)).toBe(true);
  });

  it('accepts an absolute path', () => {
    const target = path.join(tmpRoot, 'sub', 'nexus');
    const result = initPortable({ path: target });
    expect(result.success).toBe(true);
    expect(result.absolutePath).toBe(target);
    expect(fs.existsSync(target)).toBe(true);
  });

  it('is idempotent on a previously-initialized dir', () => {
    const r1 = initPortable();
    const r2 = initPortable();
    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
    expect(r2.skipped).toBe(true);
    // alreadyExisted should be populated on the second run
    expect(r2.alreadyExisted.length).toBeGreaterThan(0);
  });

  it('refuses to create in a non-empty non-nexus directory without --force', () => {
    const target = path.join(tmpRoot, 'busy');
    fs.mkdirSync(target);
    fs.writeFileSync(path.join(target, 'README.md'), '# busy');
    const result = initPortable({ path: target });
    expect(result.success).toBe(false);
    expect(result.error).toContain('already exists and is not empty');
  });

  it('uses non-empty non-nexus directory when --force is passed', () => {
    const target = path.join(tmpRoot, 'busy');
    fs.mkdirSync(target);
    fs.writeFileSync(path.join(target, 'README.md'), '# busy');
    const result = initPortable({ path: target, force: true });
    expect(result.success).toBe(true);
    expect(fs.existsSync(path.join(target, 'audit'))).toBe(true);
    // README should still be there
    expect(fs.existsSync(path.join(target, 'README.md'))).toBe(true);
  });

  it('--dry-run reports without creating anything on disk', () => {
    const result = initPortable({ dryRun: true });
    expect(result.success).toBe(true);
    expect(result.created.length).toBeGreaterThan(0);
    // Nothing actually written
    expect(fs.existsSync(result.absolutePath)).toBe(false);
  });

  it('appends to .gitignore when --gitignore and a .git dir exists', () => {
    fs.mkdirSync(path.join(tmpRoot, '.git'));
    const result = initPortable({ gitignore: true });
    expect(result.success).toBe(true);
    expect(result.gitignoreUpdated).toBe(true);
    const ignoreContent = fs.readFileSync(path.join(tmpRoot, '.gitignore'), 'utf-8');
    expect(ignoreContent).toContain(`${DEFAULT_PORTABLE_DIRNAME}/`);
  });

  it('does not duplicate the .gitignore entry on re-run', () => {
    fs.mkdirSync(path.join(tmpRoot, '.git'));
    initPortable({ gitignore: true });
    const r2 = initPortable({ gitignore: true });
    expect(r2.gitignoreUpdated).toBe(false);
    const ignoreContent = fs.readFileSync(path.join(tmpRoot, '.gitignore'), 'utf-8');
    const lines = ignoreContent.split('\n').filter((l) => l.includes(DEFAULT_PORTABLE_DIRNAME));
    expect(lines).toHaveLength(1);
  });

  it('skips .gitignore update when no .git directory exists', () => {
    const result = initPortable({ gitignore: true });
    expect(result.success).toBe(true);
    expect(result.gitignoreUpdated).toBe(false);
    expect(fs.existsSync(path.join(tmpRoot, '.gitignore'))).toBe(false);
  });

  it('rejects creating at a path that already exists as a regular file', () => {
    const target = path.join(tmpRoot, 'collision');
    fs.writeFileSync(target, 'I am a file');
    const result = initPortable({ path: target });
    expect(result.success).toBe(false);
  });
});

describe('formatInitPortableMessage', () => {
  const baseResult = {
    success: true,
    absolutePath: '/tmp/example/.nexus-agents',
    created: ['/tmp/example/.nexus-agents'],
    alreadyExisted: [],
    skipped: false,
    gitignoreUpdated: false,
    error: null,
  };

  it('includes the absolute path on success', () => {
    const msg = formatInitPortableMessage(baseResult, false);
    expect(msg).toContain('/tmp/example/.nexus-agents');
    expect(msg).toContain('export NEXUS_DATA_DIR=/tmp/example/.nexus-agents');
  });

  it('says "already initialized" when skipped is true', () => {
    const msg = formatInitPortableMessage({ ...baseResult, skipped: true }, false);
    expect(msg).toContain('Already initialized');
  });

  it('mentions .gitignore update when gitignoreUpdated is true', () => {
    const msg = formatInitPortableMessage({ ...baseResult, gitignoreUpdated: true }, false);
    expect(msg).toContain('Added entry to .gitignore');
  });

  it('uses dry-run wording when dryRun is true', () => {
    const msg = formatInitPortableMessage(baseResult, true);
    expect(msg).toContain('(dry-run)');
    expect(msg).not.toContain('export NEXUS_DATA_DIR=');
  });

  it('reports the failure error on non-success', () => {
    const msg = formatInitPortableMessage(
      { ...baseResult, success: false, error: 'permission denied' },
      false
    );
    expect(msg).toContain('failed');
    expect(msg).toContain('permission denied');
  });
});
