/**
 * Tests for the `nexus-agents migrate` command (#2879, epic #2872).
 *
 * Uses real temp directories rather than fs mocks because the migration
 * exercises actual `cpSync` / `existsSync` semantics and the per-repo
 * vs cross-repo split is the contract under test.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { formatMigrationResult, runMigrate } from './migrate-command.js';

describe('runMigrate (#2879)', () => {
  let workspace: string;
  let homedirState: string;
  let repoRoot: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), 'nexus-migrate-test-'));
    homedirState = join(workspace, 'home-nexus-agents');
    repoRoot = join(workspace, 'project');
    mkdirSync(repoRoot, { recursive: true });
    mkdirSync(join(repoRoot, '.git'));
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  function seed(subdir: string, files: Record<string, string>): void {
    const dir = join(homedirState, subdir);
    mkdirSync(dir, { recursive: true });
    for (const [name, body] of Object.entries(files)) {
      writeFileSync(join(dir, name), body);
    }
  }

  it('returns success with empty plan when source homedir is missing', () => {
    const result = runMigrate({ from: homedirState, cwd: repoRoot });
    expect(result.success).toBe(true);
    expect(result.subdirs).toHaveLength(0);
    expect(result.summary).toContain('Nothing to migrate');
  });

  it('copies a per-repo subdir (sessions) to <repo>/.nexus-agents/', () => {
    seed('sessions', { 'journal-1.jsonl': '{"x":1}\n' });

    const result = runMigrate({ from: homedirState, cwd: repoRoot });

    expect(result.success).toBe(true);
    const sessions = result.subdirs.find((s) => s.subdir === 'sessions');
    expect(sessions?.status).toBe('copied');
    expect(sessions?.itemsCopied).toBe(1);
    expect(existsSync(join(repoRoot, '.nexus-agents', 'sessions', 'journal-1.jsonl'))).toBe(true);
    // Source untouched
    expect(existsSync(join(homedirState, 'sessions', 'journal-1.jsonl'))).toBe(true);
  });

  it('skips cross-repo subdirs (learning) with explicit status', () => {
    seed('learning', { 'outcomes.jsonl': '{"y":2}\n' });

    const result = runMigrate({ from: homedirState, cwd: repoRoot });

    const learning = result.subdirs.find((s) => s.subdir === 'learning');
    expect(learning?.status).toBe('skipped-not-per-repo');
    // Cross-repo subdir is NEVER copied — confirms the state-split contract.
    expect(existsSync(join(repoRoot, '.nexus-agents', 'learning'))).toBe(false);
  });

  it('skips per-repo subdirs that already have state at the destination', () => {
    seed('checkpoints', { 'cp-1.jsonl': '{}\n' });
    const targetSub = join(repoRoot, '.nexus-agents', 'checkpoints');
    mkdirSync(targetSub, { recursive: true });
    writeFileSync(join(targetSub, 'existing.jsonl'), '{"existing":true}\n');

    const result = runMigrate({ from: homedirState, cwd: repoRoot });

    const cp = result.subdirs.find((s) => s.subdir === 'checkpoints');
    expect(cp?.status).toBe('skipped-exists');
    // Existing file preserved, no merge attempted.
    expect(readFileSync(join(targetSub, 'existing.jsonl'), 'utf-8')).toBe('{"existing":true}\n');
    expect(existsSync(join(targetSub, 'cp-1.jsonl'))).toBe(false);
  });

  it('skips empty per-repo subdirs', () => {
    mkdirSync(join(homedirState, 'traces'), { recursive: true });

    const result = runMigrate({ from: homedirState, cwd: repoRoot });

    const traces = result.subdirs.find((s) => s.subdir === 'traces');
    expect(traces?.status).toBe('skipped-empty');
    expect(existsSync(join(repoRoot, '.nexus-agents', 'traces'))).toBe(false);
  });

  it('dry-run writes nothing but reports the plan', () => {
    seed('runs', { 'r-1.jsonl': '{"r":1}\n' });
    seed('checkpoints', { 'c-1.jsonl': '{}\n' });

    const result = runMigrate({ from: homedirState, cwd: repoRoot, dryRun: true });

    expect(result.dryRun).toBe(true);
    expect(result.summary).toContain('Dry run');
    expect(result.subdirs.filter((s) => s.status === 'copied')).toHaveLength(2);
    // Nothing actually written
    expect(existsSync(join(repoRoot, '.nexus-agents'))).toBe(false);
  });

  it('fails when no repo can be detected and --to is absent', () => {
    seed('sessions', { 'x.jsonl': '{}\n' });
    const nonRepoCwd = mkdtempSync(join(tmpdir(), 'nexus-migrate-no-repo-'));
    try {
      const result = runMigrate({ from: homedirState, cwd: nonRepoCwd });
      expect(result.success).toBe(false);
      expect(result.summary).toContain('No git repo detected');
      expect(result.subdirs).toHaveLength(0);
    } finally {
      rmSync(nonRepoCwd, { recursive: true, force: true });
    }
  });

  it('respects explicit --to override even outside a repo', () => {
    seed('sessions', { 's-1.jsonl': '{}\n' });
    const explicitTarget = join(workspace, 'explicit-target');
    const nonRepoCwd = mkdtempSync(join(tmpdir(), 'nexus-migrate-no-repo-'));
    try {
      const result = runMigrate({
        from: homedirState,
        cwd: nonRepoCwd,
        to: explicitTarget,
      });
      expect(result.success).toBe(true);
      expect(existsSync(join(explicitTarget, 'sessions', 's-1.jsonl'))).toBe(true);
    } finally {
      rmSync(nonRepoCwd, { recursive: true, force: true });
    }
  });

  it('copies every per-repo subdir but no cross-repo subdir in a mixed source', () => {
    // Per-repo subdirs: should be copied
    seed('sessions', { 's.jsonl': '{}' });
    seed('checkpoints', { 'c.jsonl': '{}' });
    seed('traces', { 't.jsonl': '{}' });
    seed('runs', { 'r.jsonl': '{}' });
    // Cross-repo subdirs: should NOT be copied
    seed('learning', { 'l.jsonl': '{}' });
    seed('voting', { 'v.json': '{}' });
    seed('memory', { 'm.json': '{}' });
    seed('research', { 'rs.json': '{}' });

    const result = runMigrate({ from: homedirState, cwd: repoRoot });

    const copied = result.subdirs.filter((s) => s.status === 'copied').map((s) => s.subdir);
    const skipped = result.subdirs
      .filter((s) => s.status === 'skipped-not-per-repo')
      .map((s) => s.subdir);

    expect(copied.sort()).toEqual(['checkpoints', 'runs', 'sessions', 'traces']);
    expect(skipped.sort()).toEqual(['learning', 'memory', 'research', 'voting']);
  });
});

describe('formatMigrationResult', () => {
  it('formats a successful copy with checkmark + next-steps hint', () => {
    const output = formatMigrationResult({
      fromBase: '/home/u/.nexus-agents',
      toBase: '/repo/.nexus-agents',
      dryRun: false,
      subdirs: [
        {
          subdir: 'sessions',
          status: 'copied',
          source: '/home/u/.nexus-agents/sessions',
          target: '/repo/.nexus-agents/sessions',
          itemsCopied: 3,
        },
      ],
      success: true,
      summary: 'Copied 1 per-repo subdir(s) from /home/u/.nexus-agents → /repo/.nexus-agents.',
    });
    expect(output).toContain('✓ sessions (3 item(s))');
    expect(output).toContain('export NEXUS_REPO_PREFERRED=1');
  });

  it('formats a dry-run without the next-steps hint', () => {
    const output = formatMigrationResult({
      fromBase: '/a',
      toBase: '/b',
      dryRun: true,
      subdirs: [
        {
          subdir: 'runs',
          status: 'copied',
          source: '/a/runs',
          target: '/b/runs',
          itemsCopied: 1,
        },
      ],
      success: true,
      summary: 'Dry run: would copy 1 per-repo subdir(s) from /a → /b.',
    });
    expect(output).toContain('Dry run');
    expect(output).not.toContain('export NEXUS_REPO_PREFERRED=1');
  });

  it('formats a failure case with the summary verbatim', () => {
    const output = formatMigrationResult({
      fromBase: '/x',
      toBase: '',
      dryRun: false,
      subdirs: [],
      success: false,
      summary: 'No git repo detected from cwd.',
    });
    expect(output).toContain('migrate: No git repo detected');
  });
});
