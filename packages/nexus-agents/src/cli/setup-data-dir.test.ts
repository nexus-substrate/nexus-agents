/**
 * Tests for data directory initialization (#1249).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, existsSync, rmSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';

// Must hoist the mock so NEXUS_DATA_DIR picks up the mocked homedir at import time
vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os');
  const td = join(actual.tmpdir(), `nexus-datadir-test-${String(Date.now())}`);
  return { ...actual, homedir: (): string => td, _testDir: td };
});

describe('initDataDirectories (#1249)', () => {
  let dataDirPath: string;
  let originalRepoPreferred: string | undefined;
  let originalGitignoreAuto: string | undefined;
  let originalDataDir: string | undefined;

  beforeEach(async () => {
    // Import after mock is in place
    const os = await import('node:os');
    dataDirPath = os.homedir();
    mkdirSync(dataDirPath, { recursive: true });

    // These tests exercise the homedir-creation path. Disable the
    // repo-preferred tier so per-repo subdirs (sessions, audit, …) still
    // resolve under the mocked homedir. The per-repo routing has its
    // own dedicated test below. Issue #2889 / epic #2887.
    originalRepoPreferred = process.env['NEXUS_REPO_PREFERRED'];
    originalGitignoreAuto = process.env['NEXUS_GITIGNORE_AUTO'];
    process.env['NEXUS_REPO_PREFERRED'] = '0';
    process.env['NEXUS_GITIGNORE_AUTO'] = '0';
    // These tests exercise the HOMEDIR branch of the resolver, and reach it by
    // mocking `homedir()`. `NEXUS_DATA_DIR` outranks that branch, so leaving it
    // set sends every assertion to a directory the mock does not control —
    // which is why the suite could not isolate itself without this (#4722).
    originalDataDir = process.env['NEXUS_DATA_DIR'];
    delete process.env['NEXUS_DATA_DIR'];
  });

  afterEach(() => {
    if (originalRepoPreferred === undefined) delete process.env['NEXUS_REPO_PREFERRED'];
    else process.env['NEXUS_REPO_PREFERRED'] = originalRepoPreferred;
    if (originalGitignoreAuto === undefined) delete process.env['NEXUS_GITIGNORE_AUTO'];
    else process.env['NEXUS_GITIGNORE_AUTO'] = originalGitignoreAuto;
    if (originalDataDir === undefined) delete process.env['NEXUS_DATA_DIR'];
    else process.env['NEXUS_DATA_DIR'] = originalDataDir;
    if (existsSync(dataDirPath)) {
      rmSync(dataDirPath, { recursive: true, force: true });
    }
  });

  it('should create root and subdirectories on fresh system', async () => {
    const { initDataDirectories } = await import('./setup-data-dir.js');
    const result = initDataDirectories();
    expect(result.success).toBe(true);
    expect(result.created.length).toBeGreaterThan(0);
    expect(result.error).toBeNull();

    // Verify key subdirs exist (NEXUS_REPO_PREFERRED=0 → all under homedir)
    const root = join(dataDirPath, '.nexus-agents');
    expect(existsSync(root)).toBe(true);
    expect(existsSync(join(root, 'memory'))).toBe(true);
    expect(existsSync(join(root, 'auth'))).toBe(true);
    expect(existsSync(join(root, 'learning'))).toBe(true);
    expect(existsSync(join(root, 'sessions'))).toBe(true);
  });

  it('should report already existing directories on second run', async () => {
    const { initDataDirectories } = await import('./setup-data-dir.js');
    initDataDirectories();
    const result = initDataDirectories();
    expect(result.success).toBe(true);
    expect(result.created.length).toBe(0);
    expect(result.alreadyExisted.length).toBeGreaterThan(0);
  });

  it('should not create directories in dry-run mode', async () => {
    const { initDataDirectories } = await import('./setup-data-dir.js');
    const result = initDataDirectories(true);
    expect(result.success).toBe(true);
    expect(result.created.length).toBeGreaterThan(0);
    // Directories should NOT actually exist
    expect(existsSync(join(dataDirPath, '.nexus-agents', 'memory'))).toBe(false);
  });

  it('should return rootPath containing .nexus-agents', async () => {
    const { initDataDirectories, NEXUS_DATA_DIR } = await import('./setup-data-dir.js');
    const result = initDataDirectories();
    expect(result.rootPath).toBe(NEXUS_DATA_DIR);
    expect(result.rootPath).toContain('.nexus-agents');
  });

  // Issue #2889: per-repo subdirs (sessions, checkpoints, audit, …) must
  // land in `<repo>/.nexus-agents/`, NOT homedir, when inside a git repo.
  // Before the fix, initDataDirectories() did `join(NEXUS_DATA_DIR, subdir)`
  // which bypassed the per-repo router entirely.
  it('routes per-repo subdirs to the repo and cross-repo subdirs to homedir', async () => {
    const originalCwd = process.cwd();
    const tempRepo = mkdtempSync(join(dataDirPath, '..', 'nexus-setup-repo-'));
    mkdirSync(join(tempRepo, '.git'), { recursive: true });
    // Default-ON repo-preferred (the production default since #2886).
    delete process.env['NEXUS_REPO_PREFERRED'];
    try {
      process.chdir(tempRepo);
      const { initDataDirectories } = await import('./setup-data-dir.js');
      const result = initDataDirectories();
      expect(result.success).toBe(true);

      // Per-repo subdirs land in the repo.
      expect(existsSync(join(tempRepo, '.nexus-agents', 'sessions'))).toBe(true);
      expect(existsSync(join(tempRepo, '.nexus-agents', 'audit'))).toBe(true);
      expect(existsSync(join(tempRepo, '.nexus-agents', 'checkpoints'))).toBe(true);

      // Cross-repo subdirs stay in the (mocked) homedir.
      const home = join(dataDirPath, '.nexus-agents');
      expect(existsSync(join(home, 'learning'))).toBe(true);
      expect(existsSync(join(home, 'auth'))).toBe(true);
      expect(existsSync(join(home, 'research'))).toBe(true);

      // Per-repo subdirs must NOT have been created in homedir.
      expect(existsSync(join(home, 'sessions'))).toBe(false);
    } finally {
      process.chdir(originalCwd);
      rmSync(tempRepo, { recursive: true, force: true });
    }
  });
});

// ============================================================================
// doctor --fix reporting (#4851)
// ============================================================================

describe('describeDataDirFix (#4851)', () => {
  const base = { rootPath: '/tmp/x', alreadyExisted: [], error: null };

  it('does not claim a fix when nothing was created', async () => {
    const { describeDataDirFix } = await import('./setup-data-dir.js');
    // The exact case that triggers the fix: `doctor --fix` runs when a
    // subdirectory is missing OR not writable, but `ensureDir` returns early
    // for an existing path and never checks writability — so an unwritable
    // directory yields success with an empty `created`. Doctor printed
    // "✓ Created missing data directories" and counted it.
    const outcome = describeDataDirFix({ ...base, success: true, created: [] });

    expect(outcome.counted).toBe(false);
    expect(outcome.line).toContain('not writable');
  });

  it('claims a fix when directories were actually created', async () => {
    const { describeDataDirFix } = await import('./setup-data-dir.js');
    // The pair: never counting would make --fix report nothing it does.
    const outcome = describeDataDirFix({ ...base, success: true, created: ['/tmp/x/memory'] });

    expect(outcome.counted).toBe(true);
    expect(outcome.line).toContain('Created 1');
  });

  it('reports an outright failure as a failure, not a fix', async () => {
    const { describeDataDirFix } = await import('./setup-data-dir.js');
    const outcome = describeDataDirFix({
      ...base,
      success: false,
      created: [],
      error: 'EACCES',
    });

    expect(outcome.counted).toBe(false);
    expect(outcome.line).toContain('EACCES');
  });
});
