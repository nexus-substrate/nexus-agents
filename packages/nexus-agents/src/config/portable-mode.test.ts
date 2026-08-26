/**
 * Tests for portable-mode (#2471).
 */

import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import * as fs from 'node:fs';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { applyPortableMode, detectPortableMode, _resetDetectedForTests } from './portable-mode.js';

const SANDBOX_VARS = [
  'KUBERNETES_SERVICE_HOST',
  'DOCKER_CONTAINER',
  'ECS_CONTAINER_METADATA_URI',
  'ECS_CONTAINER_METADATA_URI_V4',
  'SANDBOX',
  'NEXUS_SANDBOX',
  // #5026: the declared root now shapes the data dir, so it must be cleared
  // between tests or one case's root leaks into the next one's expectation.
  'NEXUS_SANDBOX_ROOT',
];

function clearAllPortableEnv(): void {
  delete process.env['NEXUS_DATA_DIR'];
  delete process.env['NEXUS_PORTABLE_MODE'];
  // Setting a literal-keyed env var to undefined is the lint-clean way to
  // clear computed-key entries (the dynamic-delete rule blocks `delete obj[k]`
  // for non-literal `k`). Empty string is treated as "not set" by callers.
  for (const v of SANDBOX_VARS) {
    process.env[v] = '';
  }
}

describe('detectPortableMode (#2471)', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'portable-test-'));
    clearAllPortableEnv();
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
    clearAllPortableEnv();
  });

  it('respects NEXUS_DATA_DIR explicit set', () => {
    process.env['NEXUS_DATA_DIR'] = tmp;
    const result = detectPortableMode(tmp);
    expect(result.portable).toBe(false);
    expect(result.reason).toBe('env-data-dir');
  });

  it('honors NEXUS_PORTABLE_MODE=0 opt-out (no auto-detect)', () => {
    process.env['NEXUS_PORTABLE_MODE'] = '0';
    process.env['SANDBOX'] = '1'; // would normally trigger
    const result = detectPortableMode(tmp);
    expect(result.portable).toBe(false);
    expect(result.reason).toBe('env-opt-out');
  });

  it('honors NEXUS_PORTABLE_MODE=1 opt-in (no need for heuristics)', () => {
    process.env['NEXUS_PORTABLE_MODE'] = '1';
    const result = detectPortableMode(tmp);
    expect(result.portable).toBe(true);
    expect(result.dataDir).toBe(join(tmp, '.nexus-agents'));
    expect(result.reason).toBe('env-opt-in');
  });

  it('detects container env vars (KUBERNETES_SERVICE_HOST)', () => {
    process.env['KUBERNETES_SERVICE_HOST'] = 'kube-host';
    const result = detectPortableMode(tmp);
    expect(result.portable).toBe(true);
    expect(result.reason).toBe('container-env');
  });

  it('detects DOCKER_CONTAINER env var', () => {
    process.env['DOCKER_CONTAINER'] = '1';
    const result = detectPortableMode(tmp);
    expect(result.portable).toBe(true);
    expect(result.reason).toBe('container-env');
  });

  it('uses NEXUS_SANDBOX_ROOT as the data-dir base when declared (#5026)', () => {
    // `NEXUS_SANDBOX` is itself one of SANDBOX_ENV_VARS, so setting it makes
    // this heuristic fire and stamp `<cwd>/.nexus-agents` — which then
    // short-circuits `getNexusDataDir`'s own sandbox branch before it can
    // honour the declared root. The documented purpose of NEXUS_SANDBOX_ROOT
    // ("default NEXUS_DATA_DIR to the multi-repo root") therefore never
    // happened, and state fragmented per working directory.
    process.env['NEXUS_SANDBOX'] = 'docker-opencode';
    process.env['NEXUS_SANDBOX_ROOT'] = '/work';

    const result = detectPortableMode(tmp);

    expect(result.portable).toBe(true);
    expect(result.reason).toBe('container-env');
    expect(result.dataDir).toBe(join('/work', '.nexus-agents'));
  });

  it('falls back to cwd when the sandbox declares no root', () => {
    // The pair: a container with no declared root must still get a working
    // data dir rather than an empty base.
    process.env['NEXUS_SANDBOX'] = 'docker-opencode';

    const result = detectPortableMode(tmp);

    expect(result.dataDir).toBe(join(tmp, '.nexus-agents'));
  });

  it('treats empty container env vars as not-set', () => {
    process.env['SANDBOX'] = '';
    const result = detectPortableMode(tmp);
    expect(result.reason).toBe('default');
  });

  it('returns default (not portable) when nothing matches', () => {
    const result = detectPortableMode(tmp);
    expect(result.portable).toBe(false);
    expect(result.reason).toBe('default');
  });

  it('NEXUS_DATA_DIR wins over container env (operator override)', () => {
    process.env['NEXUS_DATA_DIR'] = tmp;
    process.env['DOCKER_CONTAINER'] = '1';
    const result = detectPortableMode(tmp);
    expect(result.portable).toBe(false);
    expect(result.reason).toBe('env-data-dir');
  });

  it('NEXUS_PORTABLE_MODE=0 wins over container env', () => {
    process.env['NEXUS_PORTABLE_MODE'] = '0';
    process.env['DOCKER_CONTAINER'] = '1';
    const result = detectPortableMode(tmp);
    expect(result.portable).toBe(false);
    expect(result.reason).toBe('env-opt-out');
  });
});

describe('applyPortableMode (#2471)', () => {
  let tmp: string;
  let stderrSpy: MockInstance;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'portable-apply-'));
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    _resetDetectedForTests();
    clearAllPortableEnv();
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
    stderrSpy.mockRestore();
    clearAllPortableEnv();
  });

  it('sets NEXUS_DATA_DIR when sandbox detected via container env', () => {
    process.env['SANDBOX'] = '1';
    applyPortableMode(tmp);
    expect(process.env['NEXUS_DATA_DIR']).toBe(join(tmp, '.nexus-agents'));
  });

  it('announces on stderr when sandbox auto-detected', () => {
    process.env['SANDBOX'] = '1';
    applyPortableMode(tmp);
    expect(stderrSpy).toHaveBeenCalled();
    const msg = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(msg).toContain('[portable-mode]');
    expect(msg).toContain('container-env');
    expect(msg).toContain('NEXUS_PORTABLE_MODE=0');
  });

  it('does NOT announce when operator opts in via NEXUS_PORTABLE_MODE=1', () => {
    process.env['NEXUS_PORTABLE_MODE'] = '1';
    applyPortableMode(tmp);
    // Operator already knows; silent is correct.
    const msg = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(msg).not.toContain('Sandbox detected');
  });

  it('is idempotent — second call is a no-op', () => {
    process.env['SANDBOX'] = '1';
    applyPortableMode(tmp);
    const callsAfterFirst = stderrSpy.mock.calls.length;
    applyPortableMode(tmp);
    expect(stderrSpy.mock.calls.length).toBe(callsAfterFirst);
  });

  it('does nothing when not portable', () => {
    applyPortableMode(tmp);
    expect(process.env['NEXUS_DATA_DIR']).toBeUndefined();
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('appends .nexus-agents/ to .gitignore when in a git repo and portable', () => {
    fs.mkdirSync(join(tmp, '.git'), { recursive: true });
    process.env['SANDBOX'] = '1';
    applyPortableMode(tmp);
    const gitignore = fs.readFileSync(join(tmp, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('.nexus-agents/');
  });

  it('does not duplicate the gitignore entry on repeat calls', () => {
    fs.mkdirSync(join(tmp, '.git'), { recursive: true });
    writeFileSync(join(tmp, '.gitignore'), '.nexus-agents/\n');
    process.env['SANDBOX'] = '1';
    applyPortableMode(tmp);
    const gitignore = fs.readFileSync(join(tmp, '.gitignore'), 'utf-8');
    const occurrences = gitignore.split('\n').filter((l) => l.trim() === '.nexus-agents/').length;
    expect(occurrences).toBe(1);
  });

  it('does not touch .gitignore when not in a git repo', () => {
    process.env['SANDBOX'] = '1';
    applyPortableMode(tmp);
    expect(fs.existsSync(join(tmp, '.gitignore'))).toBe(false);
  });
});
