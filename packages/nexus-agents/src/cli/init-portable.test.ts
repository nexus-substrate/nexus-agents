/**
 * Tests for `nexus-agents init --portable` (#2305 / #2308 / #2311).
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
  it('creates default .nexus-agents/ in cwd when no path is given', async () => {
    const result = await initPortable();
    expect(result.success).toBe(true);
    expect(result.absolutePath).toBe(path.resolve(tmpRoot, DEFAULT_PORTABLE_DIRNAME));
    expect(fs.existsSync(result.absolutePath)).toBe(true);
  });

  it('creates all 9 data subdirectories', async () => {
    const result = await initPortable();
    expect(result.success).toBe(true);
    for (const subdir of DATA_SUBDIRECTORIES) {
      expect(fs.existsSync(path.join(result.absolutePath, subdir))).toBe(true);
    }
  });

  it('sets restricted permissions (0o700) on auth/ subdir', async () => {
    const result = await initPortable();
    expect(result.success).toBe(true);
    if (process.platform === 'win32') return;
    const authStat = fs.statSync(path.join(result.absolutePath, 'auth'));
    expect(authStat.mode & 0o777).toBe(0o700);
  });

  it('accepts a custom relative path', async () => {
    const result = await initPortable({ path: '.nexus' });
    expect(result.success).toBe(true);
    expect(result.absolutePath).toBe(path.resolve(tmpRoot, '.nexus'));
    expect(fs.existsSync(result.absolutePath)).toBe(true);
  });

  it('accepts an absolute path', async () => {
    const target = path.join(tmpRoot, 'sub', 'nexus');
    const result = await initPortable({ path: target });
    expect(result.success).toBe(true);
    expect(result.absolutePath).toBe(target);
    expect(fs.existsSync(target)).toBe(true);
  });

  it('is idempotent on a previously-initialized dir', async () => {
    const r1 = await initPortable();
    const r2 = await initPortable();
    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
    expect(r2.skipped).toBe(true);
    expect(r2.alreadyExisted.length).toBeGreaterThan(0);
  });

  it('refuses to create in a non-empty non-nexus directory without --force', async () => {
    const target = path.join(tmpRoot, 'busy');
    fs.mkdirSync(target);
    fs.writeFileSync(path.join(target, 'README.md'), '# busy');
    const result = await initPortable({ path: target });
    expect(result.success).toBe(false);
    expect(result.error).toContain('already exists and is not empty');
  });

  it('uses non-empty non-nexus directory when --force is passed', async () => {
    const target = path.join(tmpRoot, 'busy');
    fs.mkdirSync(target);
    fs.writeFileSync(path.join(target, 'README.md'), '# busy');
    const result = await initPortable({ path: target, force: true });
    expect(result.success).toBe(true);
    expect(fs.existsSync(path.join(target, 'audit'))).toBe(true);
    expect(fs.existsSync(path.join(target, 'README.md'))).toBe(true);
  });

  it('--dry-run reports without creating anything on disk', async () => {
    const result = await initPortable({ dryRun: true });
    expect(result.success).toBe(true);
    expect(result.created.length).toBeGreaterThan(0);
    expect(fs.existsSync(result.absolutePath)).toBe(false);
  });

  it('appends to .gitignore when --gitignore and a .git dir exists', async () => {
    fs.mkdirSync(path.join(tmpRoot, '.git'));
    const result = await initPortable({ gitignore: true });
    expect(result.success).toBe(true);
    expect(result.gitignoreUpdated).toBe(true);
    const ignoreContent = fs.readFileSync(path.join(tmpRoot, '.gitignore'), 'utf-8');
    expect(ignoreContent).toContain(`${DEFAULT_PORTABLE_DIRNAME}/`);
  });

  it('does not duplicate the .gitignore entry on re-run', async () => {
    fs.mkdirSync(path.join(tmpRoot, '.git'));
    await initPortable({ gitignore: true });
    const r2 = await initPortable({ gitignore: true });
    expect(r2.gitignoreUpdated).toBe(false);
    const ignoreContent = fs.readFileSync(path.join(tmpRoot, '.gitignore'), 'utf-8');
    const lines = ignoreContent.split('\n').filter((l) => l.includes(DEFAULT_PORTABLE_DIRNAME));
    expect(lines).toHaveLength(1);
  });

  it('skips .gitignore update when no .git directory exists', async () => {
    const result = await initPortable({ gitignore: true });
    expect(result.success).toBe(true);
    expect(result.gitignoreUpdated).toBe(false);
    expect(fs.existsSync(path.join(tmpRoot, '.gitignore'))).toBe(false);
  });

  it('rejects creating at a path that already exists as a regular file', async () => {
    const target = path.join(tmpRoot, 'collision');
    fs.writeFileSync(target, 'I am a file');
    const result = await initPortable({ path: target });
    expect(result.success).toBe(false);
  });
});

describe('initPortable --uninstall (#2311)', () => {
  it('does not create a data dir when --uninstall is set', async () => {
    const result = await initPortable({ uninstall: true });
    expect(result.success).toBe(true);
    expect(result.uninstall).toBeDefined();
    // The data dir was never created in this test, so the uninstall is a no-op.
    expect(fs.existsSync(path.join(tmpRoot, DEFAULT_PORTABLE_DIRNAME))).toBe(false);
  });

  it('removes cli/ and bin/ subdirs that exist', async () => {
    const dataDir = path.join(tmpRoot, DEFAULT_PORTABLE_DIRNAME);
    fs.mkdirSync(path.join(dataDir, 'cli'), { recursive: true });
    fs.mkdirSync(path.join(dataDir, 'bin'), { recursive: true });
    fs.mkdirSync(path.join(dataDir, 'memory'), { recursive: true });

    const result = await initPortable({ uninstall: true });
    expect(result.success).toBe(true);
    expect(fs.existsSync(path.join(dataDir, 'cli'))).toBe(false);
    expect(fs.existsSync(path.join(dataDir, 'bin'))).toBe(false);
    // Data subdirs preserved.
    expect(fs.existsSync(path.join(dataDir, 'memory'))).toBe(true);
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

  it('renders install lines when install result is present', () => {
    const msg = formatInitPortableMessage(
      {
        ...baseResult,
        install: {
          success: true,
          version: '1.2.3',
          cliDir: '/tmp/example/.nexus-agents/cli',
          binDir: '/tmp/example/.nexus-agents/bin',
          shim: {
            success: true,
            shimPath: '/tmp/example/.nexus-agents/bin/nexus-agents',
            written: true,
            alreadyMatched: false,
            error: null,
          },
          skipped: false,
          error: null,
        },
      },
      false
    );
    expect(msg).toContain('Installed nexus-agents@1.2.3');
    expect(msg).toContain('Wrote bin shim');
  });

  it('renders uninstall lines when uninstall result is present', () => {
    const msg = formatInitPortableMessage(
      {
        ...baseResult,
        uninstall: {
          success: true,
          removed: ['/tmp/example/.nexus-agents/cli', '/tmp/example/.nexus-agents/bin'],
          notPresent: [],
          error: null,
        },
      },
      false
    );
    expect(msg).toContain('Removed:');
    expect(msg).toContain('preserved');
  });
});
