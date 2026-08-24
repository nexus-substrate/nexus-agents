/**
 * Tests for the CLI-spawn guard's pure logic (#4639).
 *
 * The interception itself is verified end-to-end by the PATH-shim harness, not
 * here — a unit test cannot meaningfully assert that a mock it installed is
 * installed.
 *
 * @module testing/cli-spawn-guard.test
 */

import { afterEach, describe, expect, it } from 'vitest';

import {
  GUARDED_CLI_BINARIES,
  binaryNameFrom,
  guardedSpawnError,
  realCliSpawnsAllowed,
  takeSpawnViolations,
} from './cli-spawn-guard.js';

describe('binaryNameFrom', () => {
  it('reads a bare binary, the execFile shape', () => {
    expect(binaryNameFrom('opencode')).toBe('opencode');
  });

  it('reads the FIRST token of a command line, the exec shape', () => {
    // `base-adapter.ts:294` uses exec('opencode --version'). Taking the last
    // token yields '--version', which is not a guarded name — the guard would
    // then pass its own tests while letting that spawn straight through.
    expect(binaryNameFrom('opencode --version')).toBe('opencode');
  });

  it('strips a directory prefix', () => {
    expect(binaryNameFrom('/usr/local/bin/opencode')).toBe('opencode');
  });

  it('strips a Windows executable suffix', () => {
    expect(binaryNameFrom('opencode.exe')).toBe('opencode');
  });

  it('returns empty for absent or non-string input rather than throwing', () => {
    expect(binaryNameFrom(undefined)).toBe('');
    expect(binaryNameFrom('')).toBe('');
    // A URL or fd is never a guarded binary; stringifying it would yield
    // '[object Object]' and could never match, but silently.
    expect(binaryNameFrom({ toString: () => 'opencode' })).toBe('');
  });

  it('does not mistake a non-CLI binary for a guarded one', () => {
    expect(GUARDED_CLI_BINARIES.has(binaryNameFrom('git rev-parse HEAD'))).toBe(false);
    expect(GUARDED_CLI_BINARIES.has(binaryNameFrom('node --version'))).toBe(false);
  });
});

describe('GUARDED_CLI_BINARIES', () => {
  it('covers every routing-arm CLI', () => {
    for (const cli of ['claude', 'gemini', 'codex', 'opencode']) {
      expect(GUARDED_CLI_BINARIES.has(cli)).toBe(true);
    }
  });

  it('covers agy, which is probed as a binary but is not a routing arm', () => {
    expect(GUARDED_CLI_BINARIES.has('agy')).toBe(true);
  });

  it('does not block ordinary tooling', () => {
    for (const bin of ['git', 'node', 'npm', 'pnpm', 'sh']) {
      expect(GUARDED_CLI_BINARIES.has(bin)).toBe(false);
    }
  });
});

describe('realCliSpawnsAllowed', () => {
  it('is false with no opt-in — the default must fail closed', () => {
    expect(realCliSpawnsAllowed({})).toBe(false);
  });

  it('is true when a *_E2E flag is set', () => {
    expect(realCliSpawnsAllowed({ OPENCODE_E2E: 'true' })).toBe(true);
  });

  it('accepts a future gated suite without a code change', () => {
    expect(realCliSpawnsAllowed({ CLAUDE_E2E: '1' })).toBe(true);
  });

  it('treats an empty or false-valued flag as not opted in', () => {
    expect(realCliSpawnsAllowed({ OPENCODE_E2E: '' })).toBe(false);
    expect(realCliSpawnsAllowed({ OPENCODE_E2E: 'false' })).toBe(false);
  });

  it('ignores an unrelated env var that merely contains E2E', () => {
    expect(realCliSpawnsAllowed({ E2E_REPORT_DIR: '/tmp/x' })).toBe(false);
  });
});

describe('guardedSpawnError', () => {
  it('names the binary and the function that spawned it', () => {
    const message = guardedSpawnError('opencode', 'execFile').message;
    expect(message).toContain("'opencode'");
    expect(message).toContain('execFile()');
  });

  it('tells the reader how to fix it, including the wholesale-mock trap', () => {
    const message = guardedSpawnError('opencode', 'exec').message;
    expect(message).toContain('WHOLESALE');
    expect(message).toContain('_E2E');
  });
});

describe('the installed guard (integration — the setup file is active here)', () => {
  // These tests trigger the guard on purpose, so they must consume the
  // violation record; otherwise the setup file's afterEach re-raises it and
  // fails the very tests proving the guard works. Consuming it here is also an
  // assertion in its own right — it proves the attempt WAS recorded, which is
  // what makes the guard un-swallowable.
  afterEach(() => {
    takeSpawnViolations();
  });

  it('blocks a direct execFile call', async () => {
    const { execFile } = await import('node:child_process');
    expect(() => execFile('opencode', ['--version'], () => undefined)).toThrow(/cli-spawn-guard/);
    expect(takeSpawnViolations()).toEqual(['opencode (via execFile)']);
  });

  it('blocks the promisified form, which bypasses a Proxy apply trap', async () => {
    // The mechanism that made the first implementation useless: promisify()
    // resolves via util.promisify.custom, so a proxy-only guard let every
    // `promisify(execFile)` caller straight through — 13 modules, including the
    // one responsible for 17 of the 23 spawns in #4629.
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    await expect(promisify(execFile)('opencode', ['--version'])).rejects.toThrow(/cli-spawn-guard/);
  });

  it('blocks the exec command-line form', async () => {
    const { exec } = await import('node:child_process');
    expect(() => exec('opencode --version', () => undefined)).toThrow(/cli-spawn-guard/);
  });

  it('lets ordinary tooling through untouched', async () => {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const { stdout } = await promisify(execFile)('node', ['--version']);
    expect(stdout).toMatch(/^v\d+/);
  });
});

// #4682: the guard wrapped a hand-picked subset of node:child_process entry
// points and its comment claimed that subset was "only the entry points this
// tree uses to reach a CLI". `execFileSync` was missing — and it is the SECOND
// most used spawner in production (23 call sites), including
// `detectCliBinary`, which calls `execFileSync(name, ['--version'])` with a
// guarded CLI name. So the guard silently let a real CLI spawn through.
//
// These probes run under the real setupFile, so they exercise the actual
// wrapper rather than a reimplementation of it.
describe('every spawning entry point is guarded (#4682)', () => {
  const GUARDED_BINARY = 'opencode';

  async function attempt(
    fn: (cp: typeof import('node:child_process')) => unknown
  ): Promise<string> {
    const cp = await import('node:child_process');
    try {
      const out = fn(cp);
      if (out instanceof Promise) await out;
      return 'NO THROW';
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  }

  it.each([
    [
      'execFileSync',
      (cp: typeof import('node:child_process')) =>
        cp.execFileSync(GUARDED_BINARY, ['--version'], { stdio: 'pipe' }),
    ],
    [
      'execSync',
      (cp: typeof import('node:child_process')) =>
        cp.execSync(`${GUARDED_BINARY} --version`, { stdio: 'pipe' }),
    ],
    [
      'spawnSync',
      (cp: typeof import('node:child_process')) =>
        cp.spawnSync(GUARDED_BINARY, ['--version'], { stdio: 'pipe' }),
    ],
  ])('blocks %s', async (_name, fn) => {
    const message = await attempt(fn);
    // These probes deliberately trip the guard, so drain the recorded
    // violation — otherwise the setup's afterEach re-raises our own probe.
    takeSpawnViolations();
    expect(message).toContain('cli-spawn-guard');
  });
});
