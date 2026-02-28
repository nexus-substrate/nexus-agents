/**
 * Tests for data directory initialization (#1249).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

// Must hoist the mock so NEXUS_DATA_DIR picks up the mocked homedir at import time
vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os');
  const td = join(actual.tmpdir(), `nexus-datadir-test-${String(Date.now())}`);
  return { ...actual, homedir: (): string => td, _testDir: td };
});

describe('initDataDirectories (#1249)', () => {
  let dataDirPath: string;

  beforeEach(async () => {
    // Import after mock is in place
    const os = await import('node:os');
    dataDirPath = os.homedir();
    mkdirSync(dataDirPath, { recursive: true });
  });

  afterEach(() => {
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

    // Verify key subdirs exist
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
});
