/**
 * Tests for the non-empty changeset counter (#4646).
 *
 * @module scripts/count-pending-changesets.test
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { countNonEmptyChangesetsAt } from './count-pending-changesets.js';

const created: string[] = [];

afterEach(() => {
  while (created.length > 0) {
    const dir = created.pop();
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
  }
});

/** A throwaway git repo whose HEAD commit holds the given changeset files. */
function repoWithChangesets(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'cs-count-'));
  created.push(dir);
  const git = (...args: string[]): void => {
    execFileSync('git', ['-C', dir, ...args], { stdio: 'pipe' });
  };
  git('init', '-q');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'test');
  mkdirSync(join(dir, '.changeset'), { recursive: true });
  writeFileSync(join(dir, '.changeset', 'config.json'), JSON.stringify({ changelog: false }));
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(dir, '.changeset', name), body, 'utf-8');
  }
  git('add', '-A');
  git('commit', '-qm', 'fixture');
  return dir;
}

const REAL = "---\n'nexus-agents': patch\n---\n\nA real change\n";
// Exactly what `pnpm changeset --empty` writes — verified against the generator.
const EMPTY = '---\n---\n';

describe('countNonEmptyChangesetsAt', () => {
  it('counts a changeset that declares a release', async () => {
    const dir = repoWithChangesets({ 'real.md': REAL });
    await expect(countNonEmptyChangesetsAt(dir, 'HEAD')).resolves.toBe(1);
  });

  it('does NOT count an empty changeset', async () => {
    // The whole bug: the old file-count treated this as pending, so the
    // fallback stood down waiting for a release PR the action never created.
    const dir = repoWithChangesets({ 'empty.md': EMPTY });
    await expect(countNonEmptyChangesetsAt(dir, 'HEAD')).resolves.toBe(0);
  });

  it('counts only the non-empty ones in a mixed directory', async () => {
    const dir = repoWithChangesets({ 'real.md': REAL, 'empty.md': EMPTY });
    await expect(countNonEmptyChangesetsAt(dir, 'HEAD')).resolves.toBe(1);
  });

  it('ignores README.md and config.json', async () => {
    const dir = repoWithChangesets({ 'README.md': '# Changesets\n' });
    await expect(countNonEmptyChangesetsAt(dir, 'HEAD')).resolves.toBe(0);
  });

  it('reports zero for a directory with no changesets at all', async () => {
    // Distinct from "only empty ones" in cause, identical in consequence —
    // both mean nothing is pending, so the fallback may publish.
    const dir = repoWithChangesets({});
    await expect(countNonEmptyChangesetsAt(dir, 'HEAD')).resolves.toBe(0);
  });

  it('reads the named commit, not the working tree', async () => {
    // #4625's hardening: the decision must come from the immutable commit, so
    // an uncommitted bump left in the tree by changesets/action cannot sway it.
    const dir = repoWithChangesets({ 'real.md': REAL });
    writeFileSync(join(dir, '.changeset', 'sneaky.md'), REAL, 'utf-8');
    await expect(countNonEmptyChangesetsAt(dir, 'HEAD')).resolves.toBe(1);
  });
});
