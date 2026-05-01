/**
 * Tests for the portable installer (#3a, child of #2301).
 *
 * `npm install` is mocked via `vi.mock('node:child_process')` so unit
 * tests never touch the real network or registry.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    execFile: vi.fn((_cmd: string, _args: readonly string[], _opts: unknown, cb?: unknown) => {
      const callback = typeof cb === 'function' ? (cb as (e: Error | null) => void) : undefined;
      const opts = _opts as { cwd?: string } | undefined;
      // Simulate a successful npm install: create the expected node_modules entry
      const cwd = opts?.cwd;
      if (cwd !== undefined) {
        const nm = path.join(cwd, 'node_modules', 'nexus-agents');
        fs.mkdirSync(nm, { recursive: true });
        fs.writeFileSync(
          path.join(nm, 'package.json'),
          JSON.stringify({ name: 'nexus-agents', version: '99.0.0' }) + '\n'
        );
        fs.mkdirSync(path.join(nm, 'dist'), { recursive: true });
        fs.writeFileSync(path.join(nm, 'dist', 'cli.js'), '// stub\n');
      }
      callback?.(null);
    }),
  };
});

vi.mock('../version.js', () => ({ VERSION: '99.0.0' }));

import {
  CLI_SUBDIR,
  BIN_SUBDIR,
  installPortable,
  uninstallPortable,
  findBinShim,
} from './portable-installer.js';

let dataDir: string;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-portable-'));
});

afterEach(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
  vi.clearAllMocks();
});

describe('installPortable', () => {
  it('installs the running CLI version into <dataDir>/cli/ by default', async () => {
    const result = await installPortable({ dataDir });
    expect(result.success).toBe(true);
    expect(result.version).toBe('99.0.0');
    expect(result.cliDir).toBe(path.join(dataDir, CLI_SUBDIR));
    expect(fs.existsSync(path.join(result.cliDir, 'node_modules', 'nexus-agents'))).toBe(true);
  });

  it('writes the package.json shim before invoking npm', async () => {
    await installPortable({ dataDir });
    const manifest = JSON.parse(
      fs.readFileSync(path.join(dataDir, CLI_SUBDIR, 'package.json'), 'utf-8')
    ) as { dependencies: Record<string, string> };
    expect(manifest.dependencies['nexus-agents']).toBe('99.0.0');
  });

  it('writes the bin shim at <dataDir>/bin/nexus-agents', async () => {
    const result = await installPortable({ dataDir });
    expect(result.shim?.success).toBe(true);
    expect(fs.existsSync(path.join(dataDir, BIN_SUBDIR, 'nexus-agents'))).toBe(true);
  });

  it('skips when already installed and force is not set', async () => {
    await installPortable({ dataDir });
    const r2 = await installPortable({ dataDir });
    expect(r2.success).toBe(true);
    expect(r2.skipped).toBe(true);
  });

  it('reinstalls when force is true', async () => {
    await installPortable({ dataDir });
    const r2 = await installPortable({ dataDir, force: true });
    expect(r2.success).toBe(true);
    expect(r2.skipped).toBe(false);
  });

  it('refuses to install a dev build', async () => {
    const result = await installPortable({ dataDir, version: 'dev' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('dev');
  });

  it('honors a pinned version override', async () => {
    const result = await installPortable({ dataDir, version: '1.2.3' });
    expect(result.success).toBe(true);
    expect(result.version).toBe('1.2.3');
    const manifest = JSON.parse(
      fs.readFileSync(path.join(dataDir, CLI_SUBDIR, 'package.json'), 'utf-8')
    ) as { dependencies: Record<string, string> };
    expect(manifest.dependencies['nexus-agents']).toBe('1.2.3');
  });

  it('dry-run reports success without spawning npm', async () => {
    const result = await installPortable({ dataDir, dryRun: true });
    expect(result.success).toBe(true);
    expect(fs.existsSync(path.join(dataDir, CLI_SUBDIR, 'node_modules'))).toBe(false);
  });

  it('cleans up the cli/ dir if npm fails', async () => {
    const cp = await import('node:child_process');
    const mockedExecFile = cp.execFile as unknown as ReturnType<typeof vi.fn>;
    mockedExecFile.mockImplementationOnce(
      (_cmd: string, _args: readonly string[], _opts: unknown, cb?: unknown) => {
        const callback = typeof cb === 'function' ? (cb as (e: Error) => void) : undefined;
        callback?.(new Error('ENOENT'));
      }
    );
    const result = await installPortable({ dataDir });
    expect(result.success).toBe(false);
    expect(result.error).toContain('npm install failed');
    expect(fs.existsSync(path.join(dataDir, CLI_SUBDIR))).toBe(false);
  });
});

describe('uninstallPortable', () => {
  it('removes cli/ and bin/ but preserves data subdirs', async () => {
    fs.mkdirSync(path.join(dataDir, 'memory'));
    fs.mkdirSync(path.join(dataDir, 'audit'));
    await installPortable({ dataDir });

    const result = uninstallPortable({ dataDir });
    expect(result.success).toBe(true);
    expect(result.removed.length).toBe(2);
    expect(fs.existsSync(path.join(dataDir, CLI_SUBDIR))).toBe(false);
    expect(fs.existsSync(path.join(dataDir, BIN_SUBDIR))).toBe(false);
    // Data subdirs preserved.
    expect(fs.existsSync(path.join(dataDir, 'memory'))).toBe(true);
    expect(fs.existsSync(path.join(dataDir, 'audit'))).toBe(true);
  });

  it('reports notPresent for absent subdirs without erroring', () => {
    const result = uninstallPortable({ dataDir });
    expect(result.success).toBe(true);
    expect(result.removed).toEqual([]);
    expect(result.notPresent.length).toBe(2);
  });

  it('dry-run reports paths without removing them', async () => {
    await installPortable({ dataDir });
    const result = uninstallPortable({ dataDir, dryRun: true });
    expect(result.success).toBe(true);
    expect(result.removed.length).toBe(2);
    expect(fs.existsSync(path.join(dataDir, CLI_SUBDIR))).toBe(true);
  });
});

describe('findBinShim', () => {
  it('returns undefined when no shim is present', () => {
    expect(findBinShim(dataDir)).toBeUndefined();
  });

  it('returns the absolute shim path after install', async () => {
    await installPortable({ dataDir });
    const found = findBinShim(dataDir);
    expect(found).toBe(path.join(dataDir, BIN_SUBDIR, 'nexus-agents'));
  });
});
