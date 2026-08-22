import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { detectPackageManager, resolveCheckCommand } from './quality-gate-commands.js';

/** A throwaway project dir with the given files. */
function project(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'qgate-'));
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(dir, name), body, 'utf-8');
  }
  return dir;
}

const pkg = (scripts: Record<string, string>): string => JSON.stringify({ scripts });

describe('detectPackageManager', () => {
  it('picks pnpm from a pnpm lockfile', () => {
    expect(detectPackageManager(project({ 'pnpm-lock.yaml': '' }))).toBe('pnpm');
  });

  it('picks npm from a package-lock', () => {
    expect(detectPackageManager(project({ 'package-lock.json': '{}' }))).toBe('npm');
  });

  it('picks yarn from a yarn lockfile', () => {
    expect(detectPackageManager(project({ 'yarn.lock': '' }))).toBe('yarn');
  });

  it('picks bun from a bun lockfile', () => {
    expect(detectPackageManager(project({ 'bun.lockb': '' }))).toBe('bun');
  });

  it('falls back to npm when no lockfile is present', () => {
    // npm is the one manager guaranteed to exist alongside node, so it is the
    // safest guess — and it still only ever runs a DECLARED script.
    expect(detectPackageManager(project({}))).toBe('npm');
  });
});

describe('resolveCheckCommand', () => {
  it('runs the declared lint script through the lockfile-selected manager', () => {
    const dir = project({ 'package.json': pkg({ lint: 'oxlint' }), 'package-lock.json': '{}' });

    const resolved = resolveCheckCommand(dir, 'lint');

    expect(resolved).toEqual({
      kind: 'command',
      command: 'npm',
      args: ['run', '--silent', 'lint'],
      script: 'lint',
    });
  });

  it('does NOT invent a linter when the project declares none', () => {
    // The #4355 report: an Oxlint project got `npx eslint`, which downloaded an
    // undeclared, unpinned ESLint and failed a repo whose own lint was green.
    const dir = project({ 'package.json': pkg({ build: 'vite build' }) });

    const resolved = resolveCheckCommand(dir, 'lint');

    expect(resolved.kind).toBe('unconfigured');
    if (resolved.kind !== 'unconfigured') return;
    expect(resolved.reason).toContain('lint');
  });

  it('never resolves to npx', () => {
    // Downloading a checker during a quality check is an unpinned execution on
    // the security path, whatever the check would have concluded.
    const dir = project({ 'package.json': pkg({ lint: 'eslint .' }), 'pnpm-lock.yaml': '' });

    const resolved = resolveCheckCommand(dir, 'lint');

    expect(resolved.kind).toBe('command');
    if (resolved.kind !== 'command') return;
    expect(resolved.command).not.toBe('npx');
  });

  it('accepts an alternate spelling of the typecheck script', () => {
    const dir = project({ 'package.json': pkg({ 'type-check': 'tsc --noEmit' }) });

    const resolved = resolveCheckCommand(dir, 'typecheck');

    expect(resolved.kind).toBe('command');
    if (resolved.kind !== 'command') return;
    expect(resolved.script).toBe('type-check');
  });

  it('prefers the canonical script name over an alternate', () => {
    const dir = project({
      'package.json': pkg({ typecheck: 'tsc --noEmit', 'type-check': 'echo stale' }),
    });

    const resolved = resolveCheckCommand(dir, 'typecheck');

    expect(resolved.kind).toBe('command');
    if (resolved.kind !== 'command') return;
    expect(resolved.script).toBe('typecheck');
  });

  it('reports unconfigured rather than guessing when package.json is unreadable', () => {
    const dir = project({ 'package.json': 'not json at all' });

    expect(resolveCheckCommand(dir, 'lint').kind).toBe('unconfigured');
  });

  it('reports unconfigured when there is no package.json', () => {
    expect(resolveCheckCommand(project({}), 'build').kind).toBe('unconfigured');
  });

  it('treats an empty script body as undeclared', () => {
    const dir = project({ 'package.json': pkg({ lint: '   ' }) });

    expect(resolveCheckCommand(dir, 'lint').kind).toBe('unconfigured');
  });
});
