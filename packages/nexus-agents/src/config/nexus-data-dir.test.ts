/**
 * Tests for getNexusDataDir() helper (#2302, child of #2301).
 */

import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import { homedir } from 'node:os';
import { mkdtempOutsideRepo } from '../testing/non-repo-temp-dir.js';
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
  let originalRepoPreferred: string | undefined;

  beforeEach(() => {
    originalEnv = process.env['NEXUS_DATA_DIR'];
    originalRepoPreferred = process.env['NEXUS_REPO_PREFERRED'];
    delete process.env['NEXUS_DATA_DIR'];
    // This block tests the homedir base — disable the now-default
    // repo-preferred tier so per-repo subdir names ('audit') still
    // resolve to homedir. Vote #2876 flipped the default to ON.
    process.env['NEXUS_REPO_PREFERRED'] = '0';
    resetNexusDataDirCache();
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env['NEXUS_DATA_DIR'];
    else process.env['NEXUS_DATA_DIR'] = originalEnv;
    if (originalRepoPreferred === undefined) delete process.env['NEXUS_REPO_PREFERRED'];
    else process.env['NEXUS_REPO_PREFERRED'] = originalRepoPreferred;
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
describe('NEXUS_REPO_PREFERRED routing (epic #2872, default-ON via vote #2876)', () => {
  let originalCwd: string;
  let originalNexusDataDir: string | undefined;
  let originalRepoPreferred: string | undefined;
  let originalSandbox: string | undefined;
  let originalSandboxRoot: string | undefined;
  let originalGitignoreAuto: string | undefined;
  let tempRepo: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    originalNexusDataDir = process.env['NEXUS_DATA_DIR'];
    originalRepoPreferred = process.env['NEXUS_REPO_PREFERRED'];
    originalSandbox = process.env['NEXUS_SANDBOX'];
    originalSandboxRoot = process.env['NEXUS_SANDBOX_ROOT'];
    originalGitignoreAuto = process.env['NEXUS_GITIGNORE_AUTO'];
    delete process.env['NEXUS_DATA_DIR'];
    delete process.env['NEXUS_REPO_PREFERRED'];
    delete process.env['NEXUS_SANDBOX'];
    delete process.env['NEXUS_SANDBOX_ROOT'];
    // Silence the auto-gitignore side-effect by default — tests that want
    // to exercise it re-enable per-test.
    process.env['NEXUS_GITIGNORE_AUTO'] = '0';

    const { mkdtempSync, mkdirSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    tempRepo = mkdtempSync(join(tmpdir(), 'nexus-repo-preferred-'));
    mkdirSync(join(tempRepo, '.git'));

    const { _resetGitignoreMemoForTests } = await import('./nexus-data-dir.js');
    _resetGitignoreMemoForTests();
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    if (originalNexusDataDir === undefined) delete process.env['NEXUS_DATA_DIR'];
    else process.env['NEXUS_DATA_DIR'] = originalNexusDataDir;
    if (originalRepoPreferred === undefined) delete process.env['NEXUS_REPO_PREFERRED'];
    else process.env['NEXUS_REPO_PREFERRED'] = originalRepoPreferred;
    if (originalSandbox === undefined) delete process.env['NEXUS_SANDBOX'];
    else process.env['NEXUS_SANDBOX'] = originalSandbox;
    if (originalSandboxRoot === undefined) delete process.env['NEXUS_SANDBOX_ROOT'];
    else process.env['NEXUS_SANDBOX_ROOT'] = originalSandboxRoot;
    if (originalGitignoreAuto === undefined) delete process.env['NEXUS_GITIGNORE_AUTO'];
    else process.env['NEXUS_GITIGNORE_AUTO'] = originalGitignoreAuto;
    const { rmSync } = await import('node:fs');
    rmSync(tempRepo, { recursive: true, force: true });
  });

  it('returns <repo>/.nexus-agents from getNexusRepoDir by default (no env set) inside a repo', async () => {
    const { getNexusRepoDir } = await import('./nexus-data-dir.js');
    process.chdir(tempRepo);
    const { realpathSync } = await import('node:fs');
    expect(getNexusRepoDir()).toBe(join(realpathSync(tempRepo), '.nexus-agents'));
  });

  it('returns null when NEXUS_REPO_PREFERRED=0 (explicit opt-out, even inside a repo)', async () => {
    const { getNexusRepoDir } = await import('./nexus-data-dir.js');
    process.env['NEXUS_REPO_PREFERRED'] = '0';
    process.chdir(tempRepo);
    expect(getNexusRepoDir()).toBe(null);
  });

  it('returns null when cwd is not in a repo (homedir fallback)', async () => {
    const { getNexusRepoDir } = await import('./nexus-data-dir.js');
    const { rmSync } = await import('node:fs');
    const nonRepo = mkdtempOutsideRepo('nexus-no-repo-');
    try {
      process.chdir(nonRepo);
      expect(getNexusRepoDir()).toBe(null);
    } finally {
      process.chdir(originalCwd);
      rmSync(nonRepo, { recursive: true, force: true });
    }
  });

  it('NEXUS_DATA_DIR explicit override wins over the repo-preferred default', async () => {
    const { getNexusRepoDir } = await import('./nexus-data-dir.js');
    process.env['NEXUS_DATA_DIR'] = '/tmp/explicit-override';
    process.chdir(tempRepo);
    expect(getNexusRepoDir()).toBe(null);
  });

  it('routes per-repo subdir (sessions) to <repo> by default inside a repo', async () => {
    const { nexusDataPath } = await import('./nexus-data-dir.js');
    process.chdir(tempRepo);
    const { realpathSync } = await import('node:fs');
    expect(nexusDataPath('sessions', 'journal-x.jsonl')).toBe(
      join(realpathSync(tempRepo), '.nexus-agents', 'sessions', 'journal-x.jsonl')
    );
  });

  it('routes cross-repo subdir (learning) to homedir even by default', async () => {
    const { nexusDataPath } = await import('./nexus-data-dir.js');
    process.chdir(tempRepo);
    expect(nexusDataPath('learning', 'outcomes.jsonl')).toBe(
      join(homedir(), '.nexus-agents', 'learning', 'outcomes.jsonl')
    );
  });

  it('routes every cross-repo subdir to homedir (regression guard)', async () => {
    const { nexusDataPath } = await import('./nexus-data-dir.js');
    process.chdir(tempRepo);
    for (const subdir of ['learning', 'voting', 'memory', 'weather', 'research', 'auth', 'usage']) {
      expect(nexusDataPath(subdir, 'x.json')).toBe(
        join(homedir(), '.nexus-agents', subdir, 'x.json')
      );
    }
  });

  it('routes every per-repo subdir to the repo (regression guard)', async () => {
    const { nexusDataPath } = await import('./nexus-data-dir.js');
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
      // #3991: the runtime vote-records ledger is per-repo governance state.
      'governance',
    ]) {
      expect(nexusDataPath(subdir, 'x.jsonl')).toBe(join(repoBase, subdir, 'x.jsonl'));
    }
  });

  it('#3991: routes governance (vote-records) to <repo>/.nexus-agents/governance by default inside a repo', async () => {
    const { nexusDataPath } = await import('./nexus-data-dir.js');
    process.chdir(tempRepo);
    const { realpathSync } = await import('node:fs');
    expect(nexusDataPath('governance', 'vote-records.jsonl')).toBe(
      join(realpathSync(tempRepo), '.nexus-agents', 'governance', 'vote-records.jsonl')
    );
  });

  it('#3991: routes governance to homedir when NEXUS_REPO_PREFERRED=0 (global install)', async () => {
    const { nexusDataPath } = await import('./nexus-data-dir.js');
    process.env['NEXUS_REPO_PREFERRED'] = '0';
    process.chdir(tempRepo);
    expect(nexusDataPath('governance', 'vote-records.jsonl')).toBe(
      join(homedir(), '.nexus-agents', 'governance', 'vote-records.jsonl')
    );
  });

  it('#3991: routes governance under the sandbox root when NEXUS_SANDBOX is set', async () => {
    const { nexusDataPath } = await import('./nexus-data-dir.js');
    process.env['NEXUS_SANDBOX'] = '1';
    process.env['NEXUS_SANDBOX_ROOT'] = '/sandbox';
    process.chdir(tempRepo);
    // Sandbox short-circuits getNexusRepoDir (detectSandbox().active) so the
    // governance ledger lands under <sandbox-root>/.nexus-agents/governance/.
    expect(nexusDataPath('governance', 'vote-records.jsonl')).toBe(
      join('/sandbox', '.nexus-agents', 'governance', 'vote-records.jsonl')
    );
  });

  it('routes per-repo subdir to HOMEDIR when NEXUS_REPO_PREFERRED=0 (opt-out)', async () => {
    const { nexusDataPath } = await import('./nexus-data-dir.js');
    process.env['NEXUS_REPO_PREFERRED'] = '0';
    process.chdir(tempRepo);
    expect(nexusDataPath('sessions', 'foo.jsonl')).toBe(
      join(homedir(), '.nexus-agents', 'sessions', 'foo.jsonl')
    );
  });

  it('auto-appends .nexus-agents/ to <repo>/.gitignore on first resolution', async () => {
    const { getNexusRepoDir } = await import('./nexus-data-dir.js');
    const { readFileSync } = await import('node:fs');
    // Re-enable the auto-gitignore side-effect for this test only.
    delete process.env['NEXUS_GITIGNORE_AUTO'];
    process.chdir(tempRepo);
    expect(getNexusRepoDir()).not.toBe(null);
    const ignoreContents = readFileSync(join(tempRepo, '.gitignore'), 'utf-8');
    expect(ignoreContents).toContain('.nexus-agents/');
  });

  it('honors NEXUS_GITIGNORE_AUTO=0 — does not create .gitignore even when resolving', async () => {
    const { getNexusRepoDir } = await import('./nexus-data-dir.js');
    const { existsSync } = await import('node:fs');
    process.env['NEXUS_GITIGNORE_AUTO'] = '0';
    process.chdir(tempRepo);
    expect(getNexusRepoDir()).not.toBe(null);
    expect(existsSync(join(tempRepo, '.gitignore'))).toBe(false);
  });

  it('does not duplicate .nexus-agents/ in an existing .gitignore (idempotent)', async () => {
    const { getNexusRepoDir } = await import('./nexus-data-dir.js');
    const { writeFileSync, readFileSync } = await import('node:fs');
    delete process.env['NEXUS_GITIGNORE_AUTO'];
    writeFileSync(join(tempRepo, '.gitignore'), 'node_modules/\n.nexus-agents/\n', 'utf-8');
    process.chdir(tempRepo);
    expect(getNexusRepoDir()).not.toBe(null);
    const lines = readFileSync(join(tempRepo, '.gitignore'), 'utf-8').split('\n').filter(Boolean);
    expect(lines.filter((l) => l === '.nexus-agents/')).toHaveLength(1);
  });

  it('nexusSharedPath always returns homedir even for per-repo subdir names', async () => {
    const { nexusSharedPath } = await import('./nexus-data-dir.js');
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
    process.chdir(deep);
    expect(nexusDataPath('runs', 'r1.jsonl')).toBe(
      join(realpathSync(tempRepo), '.nexus-agents', 'runs', 'r1.jsonl')
    );
  });
});

// Issue #2888 / epic #2887: cross-repo subdirs auto-fall-back to the
// per-repo `.nexus-agents/` when homedir is physically unreachable. Vote
// #2876 preserved — normal-machine users see no change.
describe('sandbox-fallback for cross-repo paths (issue #2888)', () => {
  let originalCwd: string;
  let originalNexusDataDir: string | undefined;
  let originalRepoPreferred: string | undefined;
  let originalGitignoreAuto: string | undefined;
  let originalHome: string | undefined;
  let tempRepo: string;
  // An unwritable homedir, simulated: `os.homedir()` honors $HOME on POSIX,
  // so pointing $HOME at a path UNDER a regular file makes
  // `getNexusDataDir()` resolve somewhere mkdirSync fails fast (ENOTDIR).
  // Crucially this leaves NEXUS_DATA_DIR unset — setting that would
  // disable getNexusRepoDir() (explicit override wins) and the fallback
  // could never find a repo to land in.
  let unwritableHome: string;
  let writeSpy: MockInstance;
  let warningOutput: string[];

  beforeEach(async () => {
    originalCwd = process.cwd();
    originalNexusDataDir = process.env['NEXUS_DATA_DIR'];
    originalRepoPreferred = process.env['NEXUS_REPO_PREFERRED'];
    originalGitignoreAuto = process.env['NEXUS_GITIGNORE_AUTO'];
    originalHome = process.env['HOME'];
    delete process.env['NEXUS_DATA_DIR'];
    delete process.env['NEXUS_REPO_PREFERRED'];
    process.env['NEXUS_GITIGNORE_AUTO'] = '0';

    const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    tempRepo = mkdtempSync(join(tmpdir(), 'nexus-fallback-'));
    mkdirSync(join(tempRepo, '.git'));

    // Hermetic "unwritable homedir": a path UNDER a regular file.
    // mkdirSync on `<file>/fake-home/.nexus-agents` fails fast with
    // ENOTDIR — unlike a `/proc/...` path, which hangs at the syscall level.
    const blockerFile = join(tempRepo, 'blocker-is-a-file');
    writeFileSync(blockerFile, 'not a directory\n');
    unwritableHome = join(blockerFile, 'fake-home');

    const { _resetGitignoreMemoForTests, _resetWritabilityMemoForTests } =
      await import('./nexus-data-dir.js');
    _resetGitignoreMemoForTests();
    _resetWritabilityMemoForTests();

    warningOutput = [];
    // Capture stderr writes. The mock honors the optional drain callback
    // (process.stderr.write(chunk, cb) / (chunk, enc, cb)) so it can't
    // stall a caller that waits on the write completing.
    writeSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk: string | Uint8Array, encodingOrCb?: unknown, cb?: unknown) => {
        warningOutput.push(String(chunk));
        const callback = typeof encodingOrCb === 'function' ? encodingOrCb : cb;
        if (typeof callback === 'function') {
          (callback as () => void)();
        }
        return true;
      });
  });

  afterEach(async () => {
    writeSpy.mockRestore();
    process.chdir(originalCwd);
    if (originalNexusDataDir === undefined) delete process.env['NEXUS_DATA_DIR'];
    else process.env['NEXUS_DATA_DIR'] = originalNexusDataDir;
    if (originalRepoPreferred === undefined) delete process.env['NEXUS_REPO_PREFERRED'];
    else process.env['NEXUS_REPO_PREFERRED'] = originalRepoPreferred;
    if (originalGitignoreAuto === undefined) delete process.env['NEXUS_GITIGNORE_AUTO'];
    else process.env['NEXUS_GITIGNORE_AUTO'] = originalGitignoreAuto;
    if (originalHome === undefined) delete process.env['HOME'];
    else process.env['HOME'] = originalHome;
    const { rmSync } = await import('node:fs');
    rmSync(tempRepo, { recursive: true, force: true });
  });

  it('falls back to per-repo location when homedir base is unwritable and we are in a repo', async () => {
    process.env['HOME'] = unwritableHome;
    const { nexusDataPath } = await import('./nexus-data-dir.js');
    const { realpathSync } = await import('node:fs');
    process.chdir(tempRepo);

    // 'research' is a cross-repo subdir per vote #2876. With homedir
    // unwritable, it should land per-repo as a fallback.
    const path = nexusDataPath('research', 'pending-catalog.json');
    expect(path).toBe(
      join(realpathSync(tempRepo), '.nexus-agents', 'research', 'pending-catalog.json')
    );
  });

  it('emits a one-time stderr warning on fallback', async () => {
    process.env['HOME'] = unwritableHome;
    const { nexusDataPath } = await import('./nexus-data-dir.js');
    process.chdir(tempRepo);

    nexusDataPath('research', 'a.json');
    nexusDataPath('research', 'b.json');
    nexusDataPath('research', 'c.json');

    // Once-per-subdir announce: three resolves, one warning.
    const fallbackWarnings = warningOutput.filter((w) =>
      w.includes('homedir ~/.nexus-agents is not writable')
    );
    expect(fallbackWarnings).toHaveLength(1);
    expect(fallbackWarnings[0]).toContain('research');
  });

  it('does NOT fall back when homedir is writable (normal-machine behavior preserved)', async () => {
    // No HOME manipulation — homedir is writable, default path applies.
    const { nexusDataPath } = await import('./nexus-data-dir.js');
    process.chdir(tempRepo);

    // 'research' should still resolve to homedir on a normal machine.
    expect(nexusDataPath('research', 'x.json')).toBe(
      join(homedir(), '.nexus-agents', 'research', 'x.json')
    );
  });

  it('does NOT fall back when not in a repo (surfaces the underlying error)', async () => {
    process.env['HOME'] = unwritableHome;
    const { nexusDataPath } = await import('./nexus-data-dir.js');
    const { rmSync } = await import('node:fs');
    const nonRepo = mkdtempOutsideRepo('nexus-no-repo-');
    try {
      process.chdir(nonRepo);
      // No repo to fall back to → returns the homedir path; the
      // caller's write will surface the underlying ENOTDIR/EACCES.
      expect(nexusDataPath('research', 'x.json')).toBe(
        join(unwritableHome, '.nexus-agents', 'research', 'x.json')
      );
    } finally {
      process.chdir(originalCwd);
      rmSync(nonRepo, { recursive: true, force: true });
    }
  });

  it('per-repo subdirs still route via PER_REPO_SUBDIRS first (fallback is for cross-repo only)', async () => {
    // Even if homedir is unwritable, sessions/checkpoints/etc go to the
    // repo path via the PER_REPO_SUBDIRS tier — not via the fallback.
    process.env['HOME'] = unwritableHome;
    const { nexusDataPath } = await import('./nexus-data-dir.js');
    const { realpathSync } = await import('node:fs');
    process.chdir(tempRepo);

    nexusDataPath('sessions', 'foo.jsonl');
    // The per-repo tier short-circuits before the writability probe,
    // so no fallback warning fires for per-repo subdirs.
    const fallbackWarnings = warningOutput.filter((w) =>
      w.includes('homedir ~/.nexus-agents is not writable')
    );
    expect(fallbackWarnings).toHaveLength(0);
    expect(nexusDataPath('sessions', 'foo.jsonl')).toBe(
      join(realpathSync(tempRepo), '.nexus-agents', 'sessions', 'foo.jsonl')
    );
  });
});

// Issue #2890: nexusDataPathEnsure() variant auto-creates parent dirs.
describe('nexusDataPathEnsure (issue #2890)', () => {
  let originalCwd: string;
  let originalNexusDataDir: string | undefined;
  let originalRepoPreferred: string | undefined;
  let tempBase: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    originalNexusDataDir = process.env['NEXUS_DATA_DIR'];
    originalRepoPreferred = process.env['NEXUS_REPO_PREFERRED'];
    process.env['NEXUS_REPO_PREFERRED'] = '0'; // homedir-only for these tests
    const { mkdtempSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    tempBase = mkdtempSync(join(tmpdir(), 'nexus-ensure-'));
    process.env['NEXUS_DATA_DIR'] = tempBase;
    const { _resetWritabilityMemoForTests } = await import('./nexus-data-dir.js');
    _resetWritabilityMemoForTests();
  });

  afterEach(async () => {
    if (originalNexusDataDir === undefined) delete process.env['NEXUS_DATA_DIR'];
    else process.env['NEXUS_DATA_DIR'] = originalNexusDataDir;
    if (originalRepoPreferred === undefined) delete process.env['NEXUS_REPO_PREFERRED'];
    else process.env['NEXUS_REPO_PREFERRED'] = originalRepoPreferred;
    process.chdir(originalCwd);
    const { rmSync } = await import('node:fs');
    rmSync(tempBase, { recursive: true, force: true });
  });

  it('creates parent directory when called with a file path', async () => {
    const { nexusDataPathEnsure } = await import('./nexus-data-dir.js');
    const { existsSync } = await import('node:fs');
    const result = nexusDataPathEnsure('learning', 'outcomes.jsonl');
    expect(result).toBe(join(tempBase, 'learning', 'outcomes.jsonl'));
    expect(existsSync(join(tempBase, 'learning'))).toBe(true);
  });

  it('creates the target directory when called with a single segment', async () => {
    const { nexusDataPathEnsure } = await import('./nexus-data-dir.js');
    const { existsSync } = await import('node:fs');
    const result = nexusDataPathEnsure('voting');
    expect(result).toBe(join(tempBase, 'voting'));
    expect(existsSync(join(tempBase, 'voting'))).toBe(true);
  });

  it('is idempotent on existing directories', async () => {
    const { nexusDataPathEnsure } = await import('./nexus-data-dir.js');
    expect(() => {
      nexusDataPathEnsure('weather', 'history.jsonl');
      nexusDataPathEnsure('weather', 'history.jsonl');
      nexusDataPathEnsure('weather', 'history.jsonl');
    }).not.toThrow();
  });
});

describe('sessionsDbPath (#2902)', () => {
  let originalEnv: string | undefined;
  let originalRepoPref: string | undefined;
  let tmp: string;

  beforeEach(async () => {
    const { mkdtempSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { _resetSessionsDbMigrationMemoForTests } = await import('./nexus-data-dir.js');
    originalEnv = process.env['NEXUS_DATA_DIR'];
    originalRepoPref = process.env['NEXUS_REPO_PREFERRED'];
    tmp = mkdtempSync(join(tmpdir(), 'nexus-sessdb-'));
    // NEXUS_DATA_DIR isolates resolution to the temp dir; resetting the
    // per-process memo lets each test exercise the one-time migration.
    process.env['NEXUS_DATA_DIR'] = tmp;
    delete process.env['NEXUS_REPO_PREFERRED'];
    _resetSessionsDbMigrationMemoForTests();
  });

  afterEach(async () => {
    const { rmSync } = await import('node:fs');
    if (originalEnv === undefined) delete process.env['NEXUS_DATA_DIR'];
    else process.env['NEXUS_DATA_DIR'] = originalEnv;
    if (originalRepoPref === undefined) delete process.env['NEXUS_REPO_PREFERRED'];
    else process.env['NEXUS_REPO_PREFERRED'] = originalRepoPref;
    rmSync(tmp, { recursive: true, force: true });
  });

  it('resolves the session DB inside the per-repo sessions/ bucket', async () => {
    const { sessionsDbPath } = await import('./nexus-data-dir.js');
    expect(sessionsDbPath()).toBe(join(tmp, 'sessions', 'sessions.db'));
  });

  it('relocates a legacy cross-repo sessions.db to the new path', async () => {
    const { writeFileSync, existsSync, readFileSync } = await import('node:fs');
    const { sessionsDbPath } = await import('./nexus-data-dir.js');
    const legacy = join(tmp, 'sessions.db');
    writeFileSync(legacy, 'legacy-db-bytes');

    const resolved = sessionsDbPath();

    expect(existsSync(legacy)).toBe(false); // moved, not copied
    expect(existsSync(resolved)).toBe(true);
    expect(readFileSync(resolved, 'utf8')).toBe('legacy-db-bytes');
  });

  it('does not overwrite an existing new-location DB', async () => {
    const { writeFileSync, existsSync, readFileSync, mkdirSync } = await import('node:fs');
    const { sessionsDbPath } = await import('./nexus-data-dir.js');
    const legacy = join(tmp, 'sessions.db');
    const target = join(tmp, 'sessions', 'sessions.db');
    writeFileSync(legacy, 'legacy');
    mkdirSync(join(tmp, 'sessions'), { recursive: true });
    writeFileSync(target, 'current');

    sessionsDbPath();

    // Guard holds: new DB untouched, legacy left in place for manual recovery.
    expect(readFileSync(target, 'utf8')).toBe('current');
    expect(existsSync(legacy)).toBe(true);
  });

  it('is a no-op when no legacy DB exists', async () => {
    const { existsSync } = await import('node:fs');
    const { sessionsDbPath } = await import('./nexus-data-dir.js');
    sessionsDbPath();
    expect(existsSync(join(tmp, 'sessions', 'sessions.db'))).toBe(false);
  });

  it('moves SQLite sidecar files alongside the main DB', async () => {
    const { writeFileSync, existsSync } = await import('node:fs');
    const { sessionsDbPath } = await import('./nexus-data-dir.js');
    writeFileSync(join(tmp, 'sessions.db'), 'db');
    writeFileSync(join(tmp, 'sessions.db-wal'), 'wal');

    sessionsDbPath();

    expect(existsSync(join(tmp, 'sessions', 'sessions.db'))).toBe(true);
    expect(existsSync(join(tmp, 'sessions', 'sessions.db-wal'))).toBe(true);
    expect(existsSync(join(tmp, 'sessions.db-wal'))).toBe(false);
  });

  it('migrates at most once per process (memoized)', async () => {
    const { writeFileSync, existsSync } = await import('node:fs');
    const { sessionsDbPath } = await import('./nexus-data-dir.js');
    sessionsDbPath(); // first call — memoizes, no legacy present

    // A legacy DB appearing after the memo is set is not picked up.
    writeFileSync(join(tmp, 'sessions.db'), 'late');
    sessionsDbPath();
    expect(existsSync(join(tmp, 'sessions.db'))).toBe(true); // not migrated
    expect(existsSync(join(tmp, 'sessions', 'sessions.db'))).toBe(false);
  });
});

// #3991 — a globally-installed MCP server runs with cwd OUTSIDE the repo, so
// the active workspace root (set from the client's MCP `roots`) must take the
// place of findRepoRoot(cwd) when resolving per-repo data dirs.
describe('active workspace root (#3991 — MCP roots)', () => {
  let originalCwd: string;
  let originalRepoPreferred: string | undefined;
  let originalDataDir: string | undefined;
  let originalGitignoreAuto: string | undefined;
  let repoDir: string;
  let cwdOutsideRepo: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    originalRepoPreferred = process.env['NEXUS_REPO_PREFERRED'];
    originalDataDir = process.env['NEXUS_DATA_DIR'];
    originalGitignoreAuto = process.env['NEXUS_GITIGNORE_AUTO'];
    delete process.env['NEXUS_REPO_PREFERRED'];
    delete process.env['NEXUS_DATA_DIR'];
    process.env['NEXUS_GITIGNORE_AUTO'] = '0';

    const { mkdtempSync, mkdirSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    // A repo (has .git) that is NOT an ancestor of cwd — mirrors the global
    // install where the server's cwd is the npm bin dir, not the project.
    repoDir = mkdtempSync(join(tmpdir(), 'nexus-ws-repo-'));
    mkdirSync(join(repoDir, '.git'));
    cwdOutsideRepo = mkdtempOutsideRepo('nexus-ws-cwd-');

    const { _resetActiveWorkspaceRootForTests, _resetGitignoreMemoForTests } =
      await import('./nexus-data-dir.js');
    _resetActiveWorkspaceRootForTests();
    _resetGitignoreMemoForTests();
    process.chdir(cwdOutsideRepo);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    if (originalRepoPreferred === undefined) delete process.env['NEXUS_REPO_PREFERRED'];
    else process.env['NEXUS_REPO_PREFERRED'] = originalRepoPreferred;
    if (originalDataDir === undefined) delete process.env['NEXUS_DATA_DIR'];
    else process.env['NEXUS_DATA_DIR'] = originalDataDir;
    if (originalGitignoreAuto === undefined) delete process.env['NEXUS_GITIGNORE_AUTO'];
    else process.env['NEXUS_GITIGNORE_AUTO'] = originalGitignoreAuto;
    const { _resetActiveWorkspaceRootForTests } = await import('./nexus-data-dir.js');
    _resetActiveWorkspaceRootForTests();
    const { rmSync } = await import('node:fs');
    rmSync(repoDir, { recursive: true, force: true });
    rmSync(cwdOutsideRepo, { recursive: true, force: true });
  });

  it('without an active root, a cwd outside any repo falls back to homedir (null repo dir)', async () => {
    const { getNexusRepoDir } = await import('./nexus-data-dir.js');
    expect(getNexusRepoDir()).toBe(null);
  });

  it('setActiveWorkspaceRoot makes getNexusRepoDir resolve to <root>/.nexus-agents despite cwd', async () => {
    const { setActiveWorkspaceRoot, getNexusRepoDir } = await import('./nexus-data-dir.js');
    const { realpathSync } = await import('node:fs');
    expect(setActiveWorkspaceRoot(repoDir)).toBe(true);
    expect(getNexusRepoDir()).toBe(join(realpathSync(repoDir), '.nexus-agents'));
  });

  it('routes per-repo subdirs to the active root (governance vote-records land in <repo>)', async () => {
    const { setActiveWorkspaceRoot, nexusDataPath } = await import('./nexus-data-dir.js');
    const { realpathSync } = await import('node:fs');
    setActiveWorkspaceRoot(repoDir);
    expect(nexusDataPath('governance', 'vote-records.jsonl')).toBe(
      join(realpathSync(repoDir), '.nexus-agents', 'governance', 'vote-records.jsonl')
    );
  });

  it('canonicalizes the stored root (realpath) and getActiveWorkspaceRoot reflects it', async () => {
    const { setActiveWorkspaceRoot, getActiveWorkspaceRoot } = await import('./nexus-data-dir.js');
    const { realpathSync } = await import('node:fs');
    setActiveWorkspaceRoot(repoDir);
    expect(getActiveWorkspaceRoot()).toBe(realpathSync(repoDir));
  });

  it('rejects a nonexistent path and leaves any prior root untouched', async () => {
    const { setActiveWorkspaceRoot, getActiveWorkspaceRoot } = await import('./nexus-data-dir.js');
    const { realpathSync } = await import('node:fs');
    setActiveWorkspaceRoot(repoDir);
    expect(setActiveWorkspaceRoot(join(repoDir, 'does-not-exist'))).toBe(false);
    expect(getActiveWorkspaceRoot()).toBe(realpathSync(repoDir)); // prior root preserved
  });

  it('rejects a path that points at a file rather than a directory', async () => {
    const { setActiveWorkspaceRoot } = await import('./nexus-data-dir.js');
    const { writeFileSync } = await import('node:fs');
    const filePath = join(cwdOutsideRepo, 'a-file');
    writeFileSync(filePath, 'x');
    expect(setActiveWorkspaceRoot(filePath)).toBe(false);
  });

  it('clears the active root when passed null or empty', async () => {
    const { setActiveWorkspaceRoot, getActiveWorkspaceRoot } = await import('./nexus-data-dir.js');
    setActiveWorkspaceRoot(repoDir);
    expect(setActiveWorkspaceRoot(null)).toBe(false);
    expect(getActiveWorkspaceRoot()).toBe(undefined);
    setActiveWorkspaceRoot(repoDir);
    expect(setActiveWorkspaceRoot('   ')).toBe(false);
    expect(getActiveWorkspaceRoot()).toBe(undefined);
  });

  it('NEXUS_REPO_PREFERRED=0 still opts out even with an active root set', async () => {
    const { setActiveWorkspaceRoot, getNexusRepoDir } = await import('./nexus-data-dir.js');
    setActiveWorkspaceRoot(repoDir);
    process.env['NEXUS_REPO_PREFERRED'] = '0';
    expect(getNexusRepoDir()).toBe(null);
  });

  it('NEXUS_DATA_DIR explicit override still wins over an active root', async () => {
    const { setActiveWorkspaceRoot, getNexusRepoDir } = await import('./nexus-data-dir.js');
    setActiveWorkspaceRoot(repoDir);
    process.env['NEXUS_DATA_DIR'] = '/tmp/explicit-wins';
    expect(getNexusRepoDir()).toBe(null);
  });
});
