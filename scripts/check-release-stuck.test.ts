import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_GRACE_SEC,
  STALL_ISSUE_MARKER,
  assessReleaseStall,
  changesetAgeSec,
  pendingChangesets,
  stallIssueBody,
} from './check-release-stuck.js';

/** Grace for the verdict tests; a round number so the ages below read as clearly inside or outside it. */
const GRACE_SEC = 1800;

describe('pendingChangesets', () => {
  it('counts only real changeset files', () => {
    expect(pendingChangesets(['README.md', 'config.json', 'brave-pugs-sing.md'])).toEqual([
      'brave-pugs-sing.md',
    ]);
  });

  it('returns empty when only the scaffolding files are present', () => {
    expect(pendingChangesets(['README.md', 'config.json'])).toEqual([]);
  });

  it('ignores non-markdown entries', () => {
    expect(pendingChangesets(['notes.txt', 'real-one.md'])).toEqual(['real-one.md']);
  });
});

describe('assessReleaseStall', () => {
  it('flags changesets older than the grace period with no open version PR', () => {
    const verdict = assessReleaseStall({
      pendingChangesets: [
        { file: 'a.md', ageSec: 7200 },
        { file: 'b.md', ageSec: 3600 },
      ],
      hasOpenVersionPr: false,
      graceSec: GRACE_SEC,
    });

    expect(verdict.stalled).toBe(true);
    expect(verdict.reason).toContain('2');
  });

  it('is clear when a version PR is open, however many changesets are queued', () => {
    // The PR is what consumes them; its existence means the release is moving.
    const verdict = assessReleaseStall({
      pendingChangesets: [{ file: 'a.md', ageSec: 7200 }],
      hasOpenVersionPr: true,
      graceSec: GRACE_SEC,
    });

    expect(verdict.stalled).toBe(false);
  });

  it('is clear, and names the youngest age, while the newest changeset is inside the grace period', () => {
    // #6215: the 03:59Z run filed #6196 two minutes after a squash-merge landed
    // a changeset; release.yml opened the version PR moments later. The newest
    // changeset is the one release.yml is still working on, so its age is the
    // only one that matters.
    const verdict = assessReleaseStall({
      pendingChangesets: [
        { file: 'old.md', ageSec: 7200 },
        { file: 'fresh.md', ageSec: 120 },
      ],
      hasOpenVersionPr: false,
      graceSec: GRACE_SEC,
    });

    expect(verdict.stalled).toBe(false);
    expect(verdict.reason).toContain('120');
    expect(verdict.reason).toContain(String(GRACE_SEC));
  });

  it('reports once the newest changeset is past the grace period, not at it', () => {
    // Boundary: age == grace is still inside (release.yml gets the whole
    // window); one second more is a stall.
    const at = assessReleaseStall({
      pendingChangesets: [{ file: 'a.md', ageSec: GRACE_SEC }],
      hasOpenVersionPr: false,
      graceSec: GRACE_SEC,
    });
    const past = assessReleaseStall({
      pendingChangesets: [{ file: 'a.md', ageSec: GRACE_SEC + 1 }],
      hasOpenVersionPr: false,
      graceSec: GRACE_SEC,
    });

    expect(at.stalled).toBe(false);
    expect(past.stalled).toBe(true);
  });

  it('is clear when there is nothing to release, and says so', () => {
    // Named empty case: Math.min over no ages is Infinity, which would read as
    // "older than any grace" and report a stall over an empty directory.
    const verdict = assessReleaseStall({
      pendingChangesets: [],
      hasOpenVersionPr: false,
      graceSec: GRACE_SEC,
    });

    expect(verdict.stalled).toBe(false);
    expect(verdict.reason).toMatch(/no unconsumed changesets/i);
  });

  it('is clear when there is nothing to release and a PR is somehow open', () => {
    expect(
      assessReleaseStall({ pendingChangesets: [], hasOpenVersionPr: true, graceSec: GRACE_SEC })
        .stalled
    ).toBe(false);
  });

  it('does not depend on the release run outcome', () => {
    // Keyed on durable state, deliberately: a run can go GREEN and still
    // produce no PR, which an outcome-keyed check would miss entirely (#4500).
    const verdict = assessReleaseStall({
      pendingChangesets: [{ file: 'a.md', ageSec: 7200 }],
      hasOpenVersionPr: false,
      graceSec: GRACE_SEC,
    });

    expect(verdict.stalled).toBe(true);
    expect(Object.keys(verdict)).not.toContain('runConclusion');
  });
});

describe('DEFAULT_GRACE_SEC', () => {
  it('is at least 3x the max measured push-to-version-PR latency, floored at 30 minutes', () => {
    // Measured 2026-09-14 over the 12 most recent releases (#6185..#6212):
    // push-triggered release.yml run createdAt -> version PR createdAt, max 182s.
    const MAX_OBSERVED_LATENCY_SEC = 182;
    expect(DEFAULT_GRACE_SEC).toBeGreaterThanOrEqual(3 * MAX_OBSERVED_LATENCY_SEC);
    expect(DEFAULT_GRACE_SEC).toBeGreaterThanOrEqual(30 * 60);
  });
});

describe('changesetAgeSec', () => {
  const scratch: string[] = [];

  afterEach(() => {
    for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  function scm(dir: string, args: readonly string[], env: NodeJS.ProcessEnv = {}): string {
    return execFileSync('git', ['-C', dir, ...args], {
      encoding: 'utf-8',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 't',
        GIT_AUTHOR_EMAIL: 't@example.invalid',
        GIT_COMMITTER_NAME: 't',
        GIT_COMMITTER_EMAIL: 't@example.invalid',
        ...env,
      },
    });
  }

  /** A repo whose `.changeset/<file>` was committed `ageSec` seconds before `nowSec`. */
  function repoWithChangeset(file: string, ageSec: number, nowSec: number): string {
    const dir = mkdtempSync(join(tmpdir(), 'stall-age-'));
    scratch.push(dir);
    scm(dir, ['init', '-q', '-b', 'main']);
    mkdirSync(join(dir, '.changeset'));
    writeFileSync(join(dir, '.changeset', file), '---\n---\nx\n', 'utf-8');
    scm(dir, ['add', '.']);
    const when = `${String(nowSec - ageSec)} +0000`;
    scm(dir, ['commit', '-q', '-m', 'add changeset'], {
      GIT_AUTHOR_DATE: when,
      GIT_COMMITTER_DATE: when,
    });
    return dir;
  }

  it('reads the age from the commit that added the file, not the checkout mtime', () => {
    const nowSec = 1_800_000_000;
    const dir = repoWithChangeset('old-one.md', 7200, nowSec);
    // The working-tree file was written moments ago; only the commit says 7200s.
    expect(changesetAgeSec(dir, 'old-one.md', nowSec)).toBe(7200);
  });

  it('fails loud when the file has no commit, rather than reading as fresh or ancient', () => {
    const nowSec = 1_800_000_000;
    const dir = repoWithChangeset('committed.md', 60, nowSec);
    writeFileSync(join(dir, '.changeset', 'untracked.md'), '---\n---\ny\n', 'utf-8');
    expect(() => changesetAgeSec(dir, 'untracked.md', nowSec)).toThrow(/untracked\.md/);
  });

  it('refuses a shallow clone, where every file would look as young as HEAD', () => {
    const nowSec = 1_800_000_000;
    const src = repoWithChangeset('first.md', 7200, nowSec);
    writeFileSync(join(src, 'README.md'), 'later\n', 'utf-8');
    scm(src, ['add', '.']);
    const when = `${String(nowSec - 60)} +0000`;
    scm(src, ['commit', '-q', '-m', 'later'], { GIT_AUTHOR_DATE: when, GIT_COMMITTER_DATE: when });
    const shallow = mkdtempSync(join(tmpdir(), 'stall-age-shallow-'));
    scratch.push(shallow);
    execFileSync('git', ['clone', '-q', '--depth', '1', `file://${src}`, shallow]);
    expect(() => changesetAgeSec(shallow, 'first.md', nowSec)).toThrow(/shallow/i);
  });
});

describe('stallIssueBody', () => {
  it('names the pending changesets so the issue is actionable', () => {
    const body = stallIssueBody(['brave-pugs-sing.md', 'lucky-cats-nap.md']);

    expect(body).toContain('brave-pugs-sing.md');
    expect(body).toContain('lucky-cats-nap.md');
  });

  it('carries a stable marker so the detector updates one issue instead of spamming', () => {
    expect(stallIssueBody(['a.md'])).toContain(STALL_ISSUE_MARKER);
  });

  it('does not tell the operator to re-run the failed run', () => {
    // Re-running the same run has never recovered this; the panel was explicit
    // that the detector must not push a remedy the evidence contradicts.
    expect(stallIssueBody(['a.md']).toLowerCase()).not.toContain('re-run the failed');
  });
});
