/**
 * Tests for the repo-scoped scratch directory (#4412).
 *
 * Five production call sites built throwaway worktrees, prompt files, and MCP
 * configs straight into `os.tmpdir()`. That is a shared, unbounded, unowned
 * space: when something else on the box filled it, this repo's own test suite
 * failed to COLLECT ~1,100 files with zero assertion failures — a disk fault
 * that reads exactly like a code fault. Scratch belongs inside the tree we
 * already own and already gitignore.
 *
 * @module config/nexus-tmp-dir.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { getNexusTmpDir, nexusMkdtempSync, nexusMkdtemp } from './nexus-tmp-dir.js';

const ENV_KEY = 'NEXUS_TMPDIR';

describe('getNexusTmpDir (#4412)', () => {
  const saved = process.env[ENV_KEY];
  const scratch = join(tmpdir(), `nexus-tmp-dir-test-${String(process.pid)}`);

  beforeEach(() => {
    delete process.env['NEXUS_TMPDIR'];
  });

  afterEach(() => {
    if (saved === undefined) delete process.env['NEXUS_TMPDIR'];
    else process.env[ENV_KEY] = saved;
    rmSync(scratch, { recursive: true, force: true });
  });

  it('resolves somewhere that exists', () => {
    // The whole point is that callers can mkdtemp into it immediately.
    expect(existsSync(getNexusTmpDir())).toBe(true);
  });

  it('lands under the gitignored .nexus-agents tree by default', () => {
    // `.nexus-agents/` is already in .gitignore, so scratch is ignored by
    // construction rather than by a second entry someone has to maintain.
    expect(getNexusTmpDir()).toContain(`.nexus-agents${sep}`);
  });

  it('is a tmp/ subdir, not the data root', () => {
    // Scratch must be separately reapable — `rm -rf` on it must not take
    // sessions, traces, or the audit chain with it.
    expect(getNexusTmpDir().endsWith(`${sep}tmp`)).toBe(true);
  });

  it('honors an explicit NEXUS_TMPDIR override', () => {
    process.env[ENV_KEY] = scratch;

    expect(getNexusTmpDir()).toBe(scratch);
    expect(existsSync(scratch)).toBe(true);
  });

  it('creates the override directory rather than assuming it exists', () => {
    process.env[ENV_KEY] = join(scratch, 'deep', 'nested');

    expect(existsSync(getNexusTmpDir())).toBe(true);
  });

  it('ignores a whitespace-only override', () => {
    // An unset var exported as "" is common in CI; treat it as absent, not as
    // a request to mkdtemp into the process CWD.
    process.env[ENV_KEY] = '   ';

    expect(getNexusTmpDir()).toContain('.nexus-agents');
  });

  it('falls back to the OS tmpdir when the target cannot be created', () => {
    // Fail-open: scratch space is a convenience. A read-only checkout must
    // degrade to `/tmp`, not take down every adapter that needs a temp file.
    writeFileSync(scratch, 'not a directory', 'utf8');
    process.env[ENV_KEY] = join(scratch, 'child');

    expect(getNexusTmpDir()).toBe(tmpdir());
  });
});

describe('nexusMkdtemp helpers (#4412)', () => {
  const made: string[] = [];

  afterEach(() => {
    for (const d of made) rmSync(d, { recursive: true, force: true });
    made.length = 0;
  });

  it('creates a real unique directory (sync)', () => {
    const a = nexusMkdtempSync('probe-');
    const b = nexusMkdtempSync('probe-');
    made.push(a, b);

    expect(existsSync(a)).toBe(true);
    expect(a).not.toBe(b);
  });

  it('keeps the caller prefix so a stray dir is attributable', () => {
    // A leaked dir is only debuggable if its name says who made it.
    const dir = nexusMkdtempSync('nexus-codex-sysprompt-');
    made.push(dir);

    expect(dir).toContain('nexus-codex-sysprompt-');
  });

  it('creates under the resolved scratch root, not the OS tmpdir', () => {
    const dir = nexusMkdtempSync('probe-');
    made.push(dir);

    expect(dir.startsWith(getNexusTmpDir())).toBe(true);
  });

  it('creates a real unique directory (async)', async () => {
    const dir = await nexusMkdtemp('probe-async-');
    made.push(dir);

    expect(existsSync(dir)).toBe(true);
  });
});
