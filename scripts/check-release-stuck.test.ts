import { describe, expect, it } from 'vitest';

import {
  STALL_ISSUE_MARKER,
  assessReleaseStall,
  pendingChangesets,
  stallIssueBody,
} from './check-release-stuck.js';

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
  it('flags changesets on main with no open version PR', () => {
    const verdict = assessReleaseStall({
      pendingChangesets: ['a.md', 'b.md'],
      hasOpenVersionPr: false,
    });

    expect(verdict.stalled).toBe(true);
    expect(verdict.reason).toContain('2');
  });

  it('is clear when a version PR is open, however many changesets are queued', () => {
    // The PR is what consumes them; its existence means the release is moving.
    const verdict = assessReleaseStall({
      pendingChangesets: ['a.md'],
      hasOpenVersionPr: true,
    });

    expect(verdict.stalled).toBe(false);
  });

  it('is clear when there is nothing to release', () => {
    expect(assessReleaseStall({ pendingChangesets: [], hasOpenVersionPr: false }).stalled).toBe(
      false
    );
  });

  it('is clear when there is nothing to release and a PR is somehow open', () => {
    expect(assessReleaseStall({ pendingChangesets: [], hasOpenVersionPr: true }).stalled).toBe(
      false
    );
  });

  it('does not depend on the release run outcome', () => {
    // Keyed on durable state, deliberately: a run can go GREEN and still
    // produce no PR, which an outcome-keyed check would miss entirely (#4500).
    const verdict = assessReleaseStall({
      pendingChangesets: ['a.md'],
      hasOpenVersionPr: false,
    });

    expect(verdict.stalled).toBe(true);
    expect(Object.keys(verdict)).not.toContain('runConclusion');
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
