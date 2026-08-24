/**
 * Tests for the governor-path ratification gate (#4635).
 *
 * @module scripts/check-governor-ratification.test
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { governorPathsFromCodeowners } from './check-governor-review.js';
import {
  GOVERNOR_SECTION_END_LINE,
  evaluateRatification,
  governorOwnersFromCodeowners,
} from './check-governor-ratification.js';

const OWNERS = ['williamzujkowski'];

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
    });
    expect(verdict.kind).toBe('not-applicable');
  });

  it('ratifies on an approving review from a governor-path owner', () => {
    const verdict = evaluateRatification({
      touchedGovernorFiles: ['packages/nexus-agents/src/audit/pr-review-record.ts'],
      approvals: ['williamzujkowski'],
      labels: [],
      owners: OWNERS,
    });
    expect(verdict.kind).toBe('ratified');
    if (verdict.kind === 'ratified') expect(verdict.via).toBe('owner-approval');
  });

  it('ratifies on the explicit ratification label', () => {
    const verdict = evaluateRatification({
      touchedGovernorFiles: ['CLAUDE.md'],
      approvals: [],
      labels: ['owner-ratified'],
      owners: OWNERS,
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
    });
    expect(verdict.kind).toBe('unratified');
  });

  it('does NOT ratify on an unrelated label', () => {
    const verdict = evaluateRatification({
      touchedGovernorFiles: ['CODEOWNERS'],
      approvals: [],
      labels: ['bug', 'ready-to-merge'],
      owners: OWNERS,
    });
    expect(verdict.kind).toBe('unratified');
  });

  it('is indeterminate — never "unratified" — when no ratifier can be resolved', () => {
    // An empty owner list means CODEOWNERS could not be read or parsed. That is
    // an absence of measurement, and reporting it as a normal unratified verdict
    // would blame the PR for a broken gate.
    const verdict = evaluateRatification({
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
