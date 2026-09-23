import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  STAGE_MARKER,
  stageMismatches,
  treeFingerprint,
  writeStageMarker,
  type StageMarker,
} from './check-publish-stage.js';
import { ROOT } from './script-paths.js';

const HEAD: StageMarker = { commit: 'a'.repeat(40), version: '9.9.9', tree: 'f'.repeat(64) };

describe('stageMismatches', () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  function stageWith(marker: string | undefined, version = '9.9.9'): string {
    dir = mkdtempSync(join(tmpdir(), 'check-stage-'));
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x', version }));
    if (marker !== undefined) writeFileSync(join(dir, STAGE_MARKER), marker);
    return dir;
  }

  it('accepts a stage whose marker and manifest match the checkout', () => {
    const stage = stageWith(undefined);
    writeStageMarker(stage, HEAD);
    expect(stageMismatches(stage, HEAD)).toEqual([]);
  });

  it('refuses a stage built from another commit, naming both', () => {
    const stage = stageWith(JSON.stringify({ ...HEAD, commit: 'b'.repeat(40) }));
    const reasons = stageMismatches(stage, HEAD);
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toMatch(/commit.*b{40}.*a{40}/);
  });

  it('refuses a stage built from a different working tree at the same commit', () => {
    const stage = stageWith(JSON.stringify({ ...HEAD, tree: '0'.repeat(64) }));
    expect(stageMismatches(stage, HEAD).join('\n')).toMatch(/working tree/);
  });

  it('refuses a marker whose version differs from the source manifest', () => {
    const stage = stageWith(JSON.stringify({ ...HEAD, version: '1.0.0' }));
    expect(stageMismatches(stage, HEAD).join('\n')).toMatch(/version.*1\.0\.0.*9\.9\.9/);
  });

  it('refuses a staged manifest whose version differs, even with a matching marker', () => {
    const stage = stageWith(JSON.stringify(HEAD), '1.0.0');
    expect(stageMismatches(stage, HEAD).join('\n')).toMatch(/staged package\.json.*1\.0\.0/);
  });

  it('refuses a stage with no marker — a partial stage from a failed run', () => {
    const stage = stageWith(undefined);
    expect(stageMismatches(stage, HEAD).join('\n')).toMatch(/no .*\.stage-commit/);
  });

  it('refuses a malformed marker instead of throwing past the check', () => {
    expect(stageMismatches(stageWith('not json'), HEAD).join('\n')).toMatch(/unreadable/);
    expect(stageMismatches(stageWith('{"commit":1}'), HEAD).join('\n')).toMatch(/unreadable/);
  });

  it('refuses when there is no stage at all', () => {
    dir = mkdtempSync(join(tmpdir(), 'check-stage-'));
    expect(stageMismatches(join(dir, 'absent'), HEAD).join('\n')).toMatch(/no stage/);
  });
});

describe('treeFingerprint', () => {
  let repo: string | undefined;
  afterEach(() => {
    if (repo !== undefined) rmSync(repo, { recursive: true, force: true });
    repo = undefined;
  });

  function git(cwd: string, ...args: string[]): void {
    execFileSync('git', args, { cwd, stdio: 'ignore' });
  }

  it('changes when a tracked file is edited or an untracked one appears, and not on ignored files', () => {
    repo = mkdtempSync(join(tmpdir(), 'fingerprint-'));
    git(repo, 'init', '-q');
    writeFileSync(join(repo, 'a.txt'), 'one\n');
    writeFileSync(join(repo, '.gitignore'), 'ignored/\n');
    git(repo, 'add', '.');
    git(repo, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init');
    const clean = treeFingerprint(repo);

    mkdirSync(join(repo, 'ignored'));
    writeFileSync(join(repo, 'ignored', 'x'), 'build output');
    expect(treeFingerprint(repo)).toBe(clean);

    writeFileSync(join(repo, 'a.txt'), 'two\n');
    const edited = treeFingerprint(repo);
    expect(edited).not.toBe(clean);
    writeFileSync(join(repo, 'a.txt'), 'three\n');
    expect(treeFingerprint(repo)).not.toBe(edited);

    writeFileSync(join(repo, 'a.txt'), 'one\n');
    expect(treeFingerprint(repo)).toBe(clean);
    writeFileSync(join(repo, 'new.txt'), 'x');
    const untracked = treeFingerprint(repo);
    expect(untracked).not.toBe(clean);
    writeFileSync(join(repo, 'new.txt'), 'y');
    expect(treeFingerprint(repo)).not.toBe(untracked);
  });
});

describe('the real package manifest', () => {
  it('runs the stage check from prepublishOnly, after the rebuild', () => {
    const manifest = JSON.parse(
      readFileSync(join(ROOT, 'packages/nexus-agents/package.json'), 'utf8')
    ) as { scripts: Record<string, string> };
    expect(manifest.scripts['prepublishOnly']).toMatch(
      /^pnpm run build && pnpm exec tsx \.\.\/\.\.\/scripts\/check-publish-stage\.ts$/
    );
  });
});
