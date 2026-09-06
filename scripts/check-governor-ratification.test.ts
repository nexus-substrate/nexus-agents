/**
 * Tests for the governor-path ratification gate (#4635).
 *
 * @module scripts/check-governor-ratification.test
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { governorPathsFromCodeowners } from './check-governor-review.js';
import {
  GOVERNOR_SECTION_END_LINE,
  evaluateRatification,
  governorOwnersFromCodeowners,
  RATIFICATION_LABEL,
  runRatificationGate,
} from './check-governor-ratification.js';

const OWNERS = ['williamzujkowski'];
const GOVERNOR_PATTERNS = governorPathsFromCodeowners(
  [
    "# Governor's own core",
    '/packages/nexus-agents/src/audit/ @owner',
    '/CODEOWNERS @owner',
    '# END governor-owned paths',
  ].join('\n')
);

describe('governorOwnersFromCodeowners', () => {
  const CODEOWNERS = [
    '# Security modules',
    '/packages/nexus-agents/src/security/ @someone-else',
    '',
    "# Governor's own core — never auto-merged",
    '/packages/nexus-agents/src/audit/ @williamzujkowski',
    '/CODEOWNERS @williamzujkowski @second-owner',
    GOVERNOR_SECTION_END_LINE,
  ].join('\n');

  it('reads ratifiers from the governor section only', () => {
    const owners = governorOwnersFromCodeowners(CODEOWNERS);
    expect(owners).toContain('williamzujkowski');
    expect(owners).toContain('second-owner');
    // Owners of non-governor paths cannot ratify a governor change.
    expect(owners).not.toContain('someone-else');
  });

  it('deduplicates a ratifier listed on several paths', () => {
    expect(
      governorOwnersFromCodeowners(CODEOWNERS).filter((o) => o === 'williamzujkowski')
    ).toHaveLength(1);
  });
});

describe('evaluateRatification', () => {
  it('reports not-applicable when no governor path is touched — not "ratified"', () => {
    // The distinction is the whole point: "nothing to ratify" and "ratified"
    // are different measurements, and collapsing them is how a gate starts
    // reporting a pass it never made.
    const verdict = evaluateRatification({
      touchedGovernorFiles: [],
      approvals: [],
      labels: [],
      owners: OWNERS,
      governorPatternCount: GOVERNOR_PATTERNS.length,
    });
    expect(verdict.kind).toBe('not-applicable');
  });

  it('is indeterminate, not not-applicable, when no governor pattern could be parsed (#5576)', () => {
    // "nothing was touched" and "we could not tell what counts as touched" are
    // different measurements. A missing CODEOWNERS start marker yields zero
    // patterns, so every PR looked like the former.
    const verdict = evaluateRatification({
      touchedGovernorFiles: [],
      approvals: [],
      labels: [],
      owners: OWNERS,
      governorPatternCount: 0,
    });
    expect(verdict.kind).toBe('indeterminate');
  });

  it('ratifies on an approving review from a governor-path owner', () => {
    const verdict = evaluateRatification({
      touchedGovernorFiles: ['packages/nexus-agents/src/audit/pr-review-record.ts'],
      approvals: ['williamzujkowski'],
      labels: [],
      owners: OWNERS,
      governorPatternCount: GOVERNOR_PATTERNS.length,
    });
    expect(verdict.kind).toBe('ratified');
    if (verdict.kind === 'ratified') expect(verdict.via).toBe('owner-approval');
  });

  it('ratifies on the explicit ratification label, applied by an owner', () => {
    // #4690 added `labelAppliedBy`. Before that this case passed with no
    // applier at all, which is the gap that change closes — see the
    // attribution suite below.
    const verdict = evaluateRatification({
      governorPatternCount: GOVERNOR_PATTERNS.length,
      touchedGovernorFiles: ['CLAUDE.md'],
      approvals: [],
      labels: ['owner-ratified'],
      owners: OWNERS,
      labelAppliedBy: 'williamzujkowski',
    });
    expect(verdict.kind).toBe('ratified');
    if (verdict.kind === 'ratified') expect(verdict.via).toBe('ratification-label');
  });

  it('does NOT ratify on an approval from a non-owner', () => {
    const verdict = evaluateRatification({
      touchedGovernorFiles: ['packages/nexus-agents/src/audit/x.ts'],
      approvals: ['a-bot', 'some-contributor'],
      labels: [],
      owners: OWNERS,
      governorPatternCount: GOVERNOR_PATTERNS.length,
    });
    expect(verdict.kind).toBe('unratified');
  });

  it('does NOT ratify on an unrelated label', () => {
    const verdict = evaluateRatification({
      touchedGovernorFiles: ['CODEOWNERS'],
      approvals: [],
      labels: ['bug', 'ready-to-merge'],
      owners: OWNERS,
      governorPatternCount: GOVERNOR_PATTERNS.length,
    });
    expect(verdict.kind).toBe('unratified');
  });

  it('is indeterminate — never "unratified" — when no ratifier can be resolved', () => {
    // An empty owner list means CODEOWNERS could not be read or parsed. That is
    // an absence of measurement, and reporting it as a normal unratified verdict
    // would blame the PR for a broken gate.
    const verdict = evaluateRatification({
      governorPatternCount: GOVERNOR_PATTERNS.length,
      touchedGovernorFiles: ['packages/nexus-agents/src/audit/x.ts'],
      approvals: ['williamzujkowski'],
      labels: [],
      owners: [],
    });
    expect(verdict.kind).toBe('indeterminate');
  });

  it('carries the touched files on an unratified verdict so the message can name them', () => {
    const verdict = evaluateRatification({
      touchedGovernorFiles: ['CLAUDE.md', 'packages/nexus-agents/src/audit/x.ts'],
      approvals: [],
      labels: [],
      owners: OWNERS,
      governorPatternCount: GOVERNOR_PATTERNS.length,
    });
    expect(verdict.kind).toBe('unratified');
    if (verdict.kind === 'unratified') expect(verdict.touched).toHaveLength(2);
  });
});

describe('governor section is bounded (#4683)', () => {
  // The section ran from its heading to EOF, and `#` lines are skipped as
  // comments, so a section heading below it could not end it either. Any
  // CODEOWNERS entry appended after the governor section therefore became a
  // governor path AND its owners became ratifiers. Latent only because the
  // governor section happens to be last today.
  const WITH_TRAILING_SECTION = [
    "# Governor's own core — the governance-of-the-governor paths.",
    '/packages/nexus-agents/src/audit/ @owner',
    '/CODEOWNERS @owner',
    GOVERNOR_SECTION_END_LINE,
    '',
    '# Docs — added later by someone with no governor authority',
    '/docs/ @docs-maintainer',
  ].join('\n');

  it('does not let a later section grant ratification rights', () => {
    const owners = governorOwnersFromCodeowners(WITH_TRAILING_SECTION);
    expect(owners).toEqual(['owner']);
    expect(owners).not.toContain('docs-maintainer');
  });

  it('does not absorb a later section into the governor paths', () => {
    const paths = governorPathsFromCodeowners(WITH_TRAILING_SECTION);
    expect(paths).toContain('/packages/nexus-agents/src/audit/');
    expect(paths).not.toContain('/docs/');
  });

  it('yields NO ratifiers when the end marker is missing — fail closed', () => {
    const unterminated = [
      "# Governor's own core — the governance-of-the-governor paths.",
      '/packages/nexus-agents/src/audit/ @owner',
    ].join('\n');
    // No end marker ⇒ the boundary is unknown ⇒ we cannot say who may ratify.
    // `evaluateRatification` turns an empty owner set into `indeterminate`.
    expect(governorOwnersFromCodeowners(unterminated)).toEqual([]);
  });

  it('still protects every governor path when the end marker is missing', () => {
    const unterminated = [
      "# Governor's own core — the governance-of-the-governor paths.",
      '/packages/nexus-agents/src/audit/ @owner',
    ].join('\n');
    // Paths fail closed in the OTHER direction: more protected paths, not fewer.
    expect(governorPathsFromCodeowners(unterminated)).toContain(
      '/packages/nexus-agents/src/audit/'
    );
  });

  it('the real CODEOWNERS carries the end marker', () => {
    const real = readFileSync(resolve(import.meta.dirname, '../CODEOWNERS'), 'utf8');
    expect(real).toContain(GOVERNOR_SECTION_END_LINE);
    expect(governorOwnersFromCodeowners(real).length).toBeGreaterThan(0);
  });
});

describe('the ratification label must be attributed to an owner (#4690)', () => {
  // The label branch checked only that the label was PRESENT — never who
  // applied it — and recorded no attribution, while the sibling approval
  // branch records `approved by @login`. Applying a label is a weaker
  // permission than submitting an owner review, so the weaker route was also
  // the one with no provenance.
  //
  // This was latent for a different reason: the `owner-ratified` label did not
  // exist in the repository at all until 2026-08-24, so the route was dead and
  // owner approval was the only working one. Creating the label to record a
  // real ratification activated it. That is what surfaced this.

  const base = {
    touchedGovernorFiles: ['CODEOWNERS'],
    approvals: [] as string[],
    labels: [RATIFICATION_LABEL],
    owners: OWNERS,
  };

  it('ratifies when a governor-path owner applied the label, and names them', () => {
    const v = evaluateRatification({
      governorPatternCount: GOVERNOR_PATTERNS.length,
      ...base,
      labelAppliedBy: 'williamzujkowski',
    });
    expect(v.kind).toBe('ratified');
    if (v.kind === 'ratified') {
      expect(v.via).toBe('ratification-label');
      // The record must name a person, not just report a label.
      expect(v.detail).toContain('williamzujkowski');
    }
  });

  it('does NOT ratify when a non-owner applied the label', () => {
    const v = evaluateRatification({
      governorPatternCount: GOVERNOR_PATTERNS.length,
      ...base,
      labelAppliedBy: 'drive-by-contributor',
    });
    expect(v.kind).toBe('unratified');
  });

  it('is INDETERMINATE when the label cannot be attributed — never ratified', () => {
    // Timeline unavailable, or a label present with no corresponding event.
    // An unattributable ratification recorded as `ratified` launders an
    // unreviewed governance change as reviewed.
    const v = evaluateRatification({
      governorPatternCount: GOVERNOR_PATTERNS.length,
      ...base,
      labelAppliedBy: undefined,
    });
    expect(v.kind).toBe('indeterminate');
    if (v.kind === 'indeterminate') {
      expect(v.reason).toMatch(/who applied/i);
    }
  });

  it('owner approval still wins without any label attribution', () => {
    const v = evaluateRatification({
      governorPatternCount: GOVERNOR_PATTERNS.length,
      ...base,
      labels: [],
      approvals: ['williamzujkowski'],
      labelAppliedBy: undefined,
    });
    expect(v.kind).toBe('ratified');
    if (v.kind === 'ratified') expect(v.via).toBe('owner-approval');
  });

  it('the applier check is case-insensitive, like the approver check', () => {
    const v = evaluateRatification({
      governorPatternCount: GOVERNOR_PATTERNS.length,
      ...base,
      labelAppliedBy: 'WilliamZujkowski',
    });
    expect(v.kind).toBe('ratified');
  });
});

describe('runRatificationGate with no inputs (#5444)', () => {
  const capture = (): { lines: string[]; restore: () => void } => {
    const lines: string[] = [];
    const push = (...a: unknown[]): void => void lines.push(a.map(String).join(' '));
    const log = vi.spyOn(console, 'log').mockImplementation(push);
    const err = vi.spyOn(console, 'error').mockImplementation(push);
    return {
      lines,
      restore: (): void => {
        log.mockRestore();
        err.mockRestore();
      },
    };
  };

  it('does not claim "not required" when CHANGED_FILES was never supplied', () => {
    // The local invocation. Absent input is not an empty diff; it is an
    // unmeasured state, and the sentence must not read as a verdict. A
    // developer running this before pushing governor files was told, twice in
    // one day, that no ratification was needed.
    const c = capture();
    try {
      const code = runRatificationGate({});
      const out = c.lines.join('\n');
      expect(code).toBe(0);
      expect(out).not.toContain('not required');
      expect(out).toContain('nothing was measured');
    } finally {
      c.restore();
    }
  });

  it('still reports not-applicable when CHANGED_FILES is present but empty', () => {
    // CI semantics unchanged: a PR that touched nothing governor-owned is
    // genuinely not applicable, and the workflow always sets the variable.
    const c = capture();
    try {
      const code = runRatificationGate({ CHANGED_FILES: '' });
      expect(code).toBe(0);
      expect(c.lines.join('\n')).toContain('not required');
    } finally {
      c.restore();
    }
  });
});
