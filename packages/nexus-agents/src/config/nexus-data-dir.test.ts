/**
 * Tests for getNexusDataDir() helper (#2302, child of #2301).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { homedir } from 'node:os';
import { join, resolve, isAbsolute } from 'node:path';
import { getNexusDataDir, nexusDataPath, resetNexusDataDirCache } from './nexus-data-dir.js';

describe('getNexusDataDir', () => {
  let originalEnv: string | undefined;
  let originalSandbox: string | undefined;
  let originalSandboxRoot: string | undefined;

  beforeEach(() => {
    originalEnv = process.env['NEXUS_DATA_DIR'];
    originalSandbox = process.env['NEXUS_SANDBOX'];
    originalSandboxRoot = process.env['NEXUS_SANDBOX_ROOT'];
    delete process.env['NEXUS_DATA_DIR'];
    delete process.env['NEXUS_SANDBOX'];
    delete process.env['NEXUS_SANDBOX_ROOT'];
    resetNexusDataDirCache();
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env['NEXUS_DATA_DIR'];
    else process.env['NEXUS_DATA_DIR'] = originalEnv;
    if (originalSandbox === undefined) delete process.env['NEXUS_SANDBOX'];
    else process.env['NEXUS_SANDBOX'] = originalSandbox;
    if (originalSandboxRoot === undefined) delete process.env['NEXUS_SANDBOX_ROOT'];
    else process.env['NEXUS_SANDBOX_ROOT'] = originalSandboxRoot;
    resetNexusDataDirCache();
  });

  it('falls back to <homedir>/.nexus-agents when env var is unset', () => {
    expect(getNexusDataDir()).toBe(join(homedir(), '.nexus-agents'));
  });

  it('uses NEXUS_DATA_DIR when set to an absolute path', () => {
    process.env['NEXUS_DATA_DIR'] = '/var/lib/nexus-portable';
    expect(getNexusDataDir()).toBe('/var/lib/nexus-portable');
  });

  it('resolves relative NEXUS_DATA_DIR against process.cwd() at first call', () => {
    process.env['NEXUS_DATA_DIR'] = '.nexus-agents';
    const result = getNexusDataDir();
    expect(isAbsolute(result)).toBe(true);
    expect(result).toBe(resolve('.nexus-agents'));
  });

  it('treats empty string env var as unset (homedir fallback)', () => {
    process.env['NEXUS_DATA_DIR'] = '';
    expect(getNexusDataDir()).toBe(join(homedir(), '.nexus-agents'));
  });

  it('treats whitespace-only env var as unset (homedir fallback)', () => {
    process.env['NEXUS_DATA_DIR'] = '   ';
    expect(getNexusDataDir()).toBe(join(homedir(), '.nexus-agents'));
  });

  it('re-reads the env var on every call (no caching)', () => {
    process.env['NEXUS_DATA_DIR'] = '/first';
    expect(getNexusDataDir()).toBe('/first');
    process.env['NEXUS_DATA_DIR'] = '/second';
    expect(getNexusDataDir()).toBe('/second');
  });

  it('resetNexusDataDirCache() is a documented no-op', () => {
    expect(() => {
      resetNexusDataDirCache();
    }).not.toThrow();
  });

  it('handles paths with trailing whitespace by trimming', () => {
    process.env['NEXUS_DATA_DIR'] = '  /trimmed  ';
    expect(getNexusDataDir()).toBe('/trimmed');
  });

  // #2501: sandbox-aware default
  describe('sandbox-aware default', () => {
    it('uses NEXUS_SANDBOX_ROOT/.nexus-agents when NEXUS_SANDBOX is set + root provided', () => {
      process.env['NEXUS_SANDBOX'] = 'docker-opencode';
      process.env['NEXUS_SANDBOX_ROOT'] = '/projects';
      expect(getNexusDataDir()).toBe('/projects/.nexus-agents');
    });

    it('falls back to /.nexus-agents when sandbox active but root unset', () => {
      process.env['NEXUS_SANDBOX'] = 'docker-opencode';
      expect(getNexusDataDir()).toBe('/.nexus-agents');
    });

    it('NEXUS_DATA_DIR overrides the sandbox default (env-var precedence)', () => {
      process.env['NEXUS_SANDBOX'] = 'docker-opencode';
      process.env['NEXUS_SANDBOX_ROOT'] = '/projects';
      process.env['NEXUS_DATA_DIR'] = '/custom/state';
      expect(getNexusDataDir()).toBe('/custom/state');
    });

    it('homedir fallback survives when sandbox is inactive', () => {
      // No NEXUS_SANDBOX, no NEXUS_DATA_DIR — should use homedir.
      expect(getNexusDataDir()).toBe(join(homedir(), '.nexus-agents'));
    });
  });
});

describe('nexusDataPath', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env['NEXUS_DATA_DIR'];
    delete process.env['NEXUS_DATA_DIR'];
    resetNexusDataDirCache();
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env['NEXUS_DATA_DIR'];
    else process.env['NEXUS_DATA_DIR'] = originalEnv;
    resetNexusDataDirCache();
  });

  it('joins segments under the resolved data dir (homedir default)', () => {
    expect(nexusDataPath('audit', 'log.jsonl')).toBe(
      join(homedir(), '.nexus-agents', 'audit', 'log.jsonl')
    );
  });

  it('joins segments under NEXUS_DATA_DIR when set', () => {
    process.env['NEXUS_DATA_DIR'] = '/var/nexus';
    expect(nexusDataPath('memory', 'beliefs.json')).toBe('/var/nexus/memory/beliefs.json');
  });

  it('returns the data dir itself when called with no segments', () => {
    process.env['NEXUS_DATA_DIR'] = '/var/nexus';
    expect(nexusDataPath()).toBe('/var/nexus');
  });
});

// Epic #2872 / Issue #2882: the gated repo-preferred resolver. State-
// category split per vote #2876 — per-repo subdirs (sessions, checkpoints,
// traces, runs, audit, pipeline, tasks) route to <repo>/.nexus-agents/
// when NEXUS_REPO_PREFERRED=1; cross-repo subdirs always go to homedir.
describe('NEXUS_REPO_PREFERRED routing (epic #2872, issue #2882)', () => {
  let originalCwd: string;
  let originalNexusDataDir: string | undefined;
  let originalRepoPreferred: string | undefined;
  let originalSandbox: string | undefined;
  let tempRepo: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    originalNexusDataDir = process.env['NEXUS_DATA_DIR'];
    originalRepoPreferred = process.env['NEXUS_REPO_PREFERRED'];
    originalSandbox = process.env['NEXUS_SANDBOX'];
    delete process.env['NEXUS_DATA_DIR'];
    delete process.env['NEXUS_REPO_PREFERRED'];
    delete process.env['NEXUS_SANDBOX'];

    const { mkdtempSync, mkdirSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    tempRepo = mkdtempSync(join(tmpdir(), 'nexus-repo-preferred-'));
    mkdirSync(join(tempRepo, '.git'));
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    if (originalNexusDataDir === undefined) delete process.env['NEXUS_DATA_DIR'];
    else process.env['NEXUS_DATA_DIR'] = originalNexusDataDir;
    if (originalRepoPreferred === undefined) delete process.env['NEXUS_REPO_PREFERRED'];
    else process.env['NEXUS_REPO_PREFERRED'] = originalRepoPreferred;
    if (originalSandbox === undefined) delete process.env['NEXUS_SANDBOX'];
    else process.env['NEXUS_SANDBOX'] = originalSandbox;
    const { rmSync } = await import('node:fs');
    rmSync(tempRepo, { recursive: true, force: true });
  });

  it('returns null from getNexusRepoDir when NEXUS_REPO_PREFERRED is unset', async () => {
    const { getNexusRepoDir } = await import('./nexus-data-dir.js');
    process.chdir(tempRepo);
    expect(getNexusRepoDir()).toBe(null);
  });

  it('returns <repo>/.nexus-agents from getNexusRepoDir when enabled inside a repo', async () => {
    const { getNexusRepoDir } = await import('./nexus-data-dir.js');
    process.env['NEXUS_REPO_PREFERRED'] = '1';
    process.chdir(tempRepo);
    const { realpathSync } = await import('node:fs');
    expect(getNexusRepoDir()).toBe(join(realpathSync(tempRepo), '.nexus-agents'));
  });

  it('returns null when enabled but cwd is not in a repo', async () => {
    const { getNexusRepoDir } = await import('./nexus-data-dir.js');
    const { mkdtempSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const nonRepo = mkdtempSync(join(tmpdir(), 'nexus-no-repo-'));
    try {
      process.env['NEXUS_REPO_PREFERRED'] = '1';
      process.chdir(nonRepo);
      expect(getNexusRepoDir()).toBe(null);
    } finally {
      process.chdir(originalCwd);
      rmSync(nonRepo, { recursive: true, force: true });
    }
  });

  it('NEXUS_DATA_DIR explicit override wins over NEXUS_REPO_PREFERRED', async () => {
    const { getNexusRepoDir } = await import('./nexus-data-dir.js');
    process.env['NEXUS_REPO_PREFERRED'] = '1';
    process.env['NEXUS_DATA_DIR'] = '/tmp/explicit-override';
    process.chdir(tempRepo);
    expect(getNexusRepoDir()).toBe(null);
  });

  it('routes per-repo subdir (sessions) to <repo> when enabled', async () => {
    const { nexusDataPath } = await import('./nexus-data-dir.js');
    process.env['NEXUS_REPO_PREFERRED'] = '1';
    process.chdir(tempRepo);
    const { realpathSync } = await import('node:fs');
    expect(nexusDataPath('sessions', 'journal-x.jsonl')).toBe(
      join(realpathSync(tempRepo), '.nexus-agents', 'sessions', 'journal-x.jsonl')
    );
  });

  it('routes cross-repo subdir (learning) to homedir even when enabled inside a repo', async () => {
    const { nexusDataPath } = await import('./nexus-data-dir.js');
    process.env['NEXUS_REPO_PREFERRED'] = '1';
    process.chdir(tempRepo);
    expect(nexusDataPath('learning', 'outcomes.jsonl')).toBe(
      join(homedir(), '.nexus-agents', 'learning', 'outcomes.jsonl')
    );
  });

  it('routes every cross-repo subdir to homedir (regression guard)', async () => {
    const { nexusDataPath } = await import('./nexus-data-dir.js');
    process.env['NEXUS_REPO_PREFERRED'] = '1';
    process.chdir(tempRepo);
    for (const subdir of ['learning', 'voting', 'memory', 'weather', 'research', 'auth', 'usage']) {
      expect(nexusDataPath(subdir, 'x.json')).toBe(
        join(homedir(), '.nexus-agents', subdir, 'x.json')
      );
    }
  });

  it('routes every per-repo subdir to the repo (regression guard)', async () => {
    const { nexusDataPath } = await import('./nexus-data-dir.js');
    process.env['NEXUS_REPO_PREFERRED'] = '1';
    process.chdir(tempRepo);
    const { realpathSync } = await import('node:fs');
    const repoBase = join(realpathSync(tempRepo), '.nexus-agents');
    for (const subdir of [
      'sessions',
      'checkpoints',
      'traces',
      'runs',
      'audit',
      'pipeline',
      'tasks',
    ]) {
      expect(nexusDataPath(subdir, 'x.jsonl')).toBe(join(repoBase, subdir, 'x.jsonl'));
    }
  });

  it('routes per-repo subdir to HOMEDIR when NEXUS_REPO_PREFERRED is unset (backward compat)', async () => {
    const { nexusDataPath } = await import('./nexus-data-dir.js');
    process.chdir(tempRepo);
    expect(nexusDataPath('sessions', 'foo.jsonl')).toBe(
      join(homedir(), '.nexus-agents', 'sessions', 'foo.jsonl')
    );
  });

  it('nexusSharedPath always returns homedir even for per-repo subdir names', async () => {
    const { nexusSharedPath } = await import('./nexus-data-dir.js');
    process.env['NEXUS_REPO_PREFERRED'] = '1';
    process.chdir(tempRepo);
    expect(nexusSharedPath('sessions', 'foo.jsonl')).toBe(
      join(homedir(), '.nexus-agents', 'sessions', 'foo.jsonl')
    );
  });

  it('walks upward to find the repo root from a nested cwd', async () => {
    const { nexusDataPath } = await import('./nexus-data-dir.js');
    const { mkdirSync, realpathSync } = await import('node:fs');
    const deep = join(tempRepo, 'src', 'feature');
    mkdirSync(deep, { recursive: true });
    process.env['NEXUS_REPO_PREFERRED'] = '1';
    process.chdir(deep);
    expect(nexusDataPath('runs', 'r1.jsonl')).toBe(
      join(realpathSync(tempRepo), '.nexus-agents', 'runs', 'r1.jsonl')
    );
  });
});
