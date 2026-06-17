/**
 * Tests for the pr_review curation pipeline's PURE signal→label logic (#3847).
 *
 * Proves the rubric decision table holds against fixtures (no live gh): a PR
 * with no follow-up fix is proposed `clean`; a confirmed fix/revert in a
 * correctness domain is proposed `buggy` at the `medium` floor with
 * `needsAdjudication`; an ambiguous follow-up (heuristic refine / no-behavior
 * hardening / outside a correctness domain) is proposed `borderline` +
 * `needsAdjudication`, NEVER guessed into buggy/clean. Also covers the
 * harvester's pure signal-extraction helpers (commit-type, source-file filter,
 * follow-up matching).
 *
 * @module scripts/curate-pr-review-labeling.test
 * (Source: Issue #3847, epic #3845; rubric #3846)
 */

import { describe, it, expect } from 'vitest';
import {
  proposeLabel,
  provenanceSourceFor,
  type FollowUpFix,
  type PrSignals,
} from './curate-pr-review-labeling.js';
import { commitType, sourceFilesOf, followUpFixesFor } from './curate-pr-review-harvest.js';

function signals(over: Partial<PrSignals> = {}): PrSignals {
  return {
    number: 100,
    title: 'feat(x): a feature',
    url: 'https://github.com/o/r/pull/100',
    changedSourceFiles: ['packages/nexus-agents/src/x/a.ts'],
    followUpFixes: [],
    reviewDecision: null,
    ...over,
  };
}

function fix(over: Partial<FollowUpFix> = {}): FollowUpFix {
  return {
    fixPrNumber: 200,
    fixType: 'fix',
    overlappingSourceFiles: ['packages/nexus-agents/src/audit/a.ts'],
    ...over,
  };
}

describe('proposeLabel — rubric decision table', () => {
  it('proposes clean when no follow-up fix exists (Rule 3)', () => {
    const l = proposeLabel(signals(), new Map());
    expect(l.class).toBe('clean');
    expect(l.severity).toBeNull();
    expect(l.needsAdjudication).toBe(false);
  });

  it('proposes buggy at the medium floor for a fix in a correctness domain (Rule 5.3)', () => {
    const l = proposeLabel(
      signals({ followUpFixes: [fix()] }),
      new Map([[200, 'fix(audit): correct silent drop']])
    );
    expect(l.class).toBe('buggy');
    expect(l.severity).toBe('medium');
    expect(l.needsAdjudication).toBe(true);
    expect(l.justification).toContain('#200');
  });

  it('never auto-escalates severity above medium', () => {
    const l = proposeLabel(
      signals({
        followUpFixes: [
          fix({ overlappingSourceFiles: ['packages/nexus-agents/src/security/s.ts'] }),
        ],
      }),
      new Map([[200, 'fix(security): patch']])
    );
    expect(l.severity).toBe('medium');
  });

  it('proposes borderline + needsAdjudication for a heuristic refinement (Rule 4)', () => {
    const l = proposeLabel(
      signals({ followUpFixes: [fix()] }),
      new Map([[200, 'fix(governance): refine suggest-signal heuristics']])
    );
    expect(l.class).toBe('borderline');
    expect(l.needsAdjudication).toBe(true);
    expect(l.severity).toBeNull();
  });

  it('proposes borderline for a no-behavior-change hardening', () => {
    const l = proposeLabel(
      signals({ followUpFixes: [fix()] }),
      new Map([[200, 'fix(orchestration): harden router — no live routing change']])
    );
    expect(l.class).toBe('borderline');
  });

  it('proposes borderline when the fix is outside a correctness domain', () => {
    const l = proposeLabel(
      signals({
        followUpFixes: [fix({ overlappingSourceFiles: ['packages/nexus-agents/src/util/u.ts'] })],
      }),
      new Map([[200, 'fix(util): tweak']])
    );
    expect(l.class).toBe('borderline');
    expect(l.needsAdjudication).toBe(true);
  });

  it('treats a revert as a confirmed bug even with a refine-like title', () => {
    const l = proposeLabel(
      signals({ followUpFixes: [fix({ fixType: 'revert' })] }),
      new Map([[200, 'revert: refine xyz']])
    );
    expect(l.class).toBe('buggy');
  });

  it('maps provenance source: clean→historical-clean, else historical', () => {
    expect(
      provenanceSourceFor({
        class: 'clean',
        severity: null,
        needsAdjudication: false,
        confidence: 1,
        justification: '',
      })
    ).toBe('historical-clean');
    expect(
      provenanceSourceFor({
        class: 'buggy',
        severity: 'medium',
        needsAdjudication: true,
        confidence: 1,
        justification: '',
      })
    ).toBe('historical');
    expect(
      provenanceSourceFor({
        class: 'borderline',
        severity: null,
        needsAdjudication: true,
        confidence: 1,
        justification: '',
      })
    ).toBe('historical');
  });
});

describe('harvest signal extraction (pure helpers)', () => {
  it('parses the conventional-commit type', () => {
    expect(commitType('fix(governance): x')).toBe('fix');
    expect(commitType('feat: y')).toBe('feat');
    expect(commitType('revert(core): z')).toBe('revert');
    expect(commitType('no prefix here')).toBe('');
  });

  it('keeps only non-test source files', () => {
    const pr = {
      number: 1,
      title: 't',
      body: '',
      url: '',
      files: [
        { path: 'packages/nexus-agents/src/a.ts' },
        { path: 'packages/nexus-agents/src/a.test.ts' },
        { path: '.changeset/x.md' },
        { path: 'docs/y.md' },
      ],
    };
    expect(sourceFilesOf(pr)).toEqual(['packages/nexus-agents/src/a.ts']);
  });

  it('matches only LATER fix/revert PRs that reference the prior and share a source file', () => {
    const prior = {
      number: 3010,
      title: 'feat: x',
      body: '',
      url: '',
      files: [{ path: 'packages/nexus-agents/src/a.ts' }],
    };
    const all = [
      prior,
      // later fix, references #3010, shares the file → matches
      {
        number: 3020,
        title: 'fix: correct a',
        body: 'follow-up to #3010',
        url: '',
        files: [{ path: 'packages/nexus-agents/src/a.ts' }],
      },
      // later fix, references #3010, but different file → no match
      {
        number: 3021,
        title: 'fix: b',
        body: '#3010',
        url: '',
        files: [{ path: 'packages/nexus-agents/src/b.ts' }],
      },
      // earlier number → not a follow-up
      {
        number: 3005,
        title: 'fix: x',
        body: '#3010',
        url: '',
        files: [{ path: 'packages/nexus-agents/src/a.ts' }],
      },
      // a feat referencing #3010, shares file, but not fix/revert → no match
      {
        number: 3022,
        title: 'feat: more',
        body: '#3010',
        url: '',
        files: [{ path: 'packages/nexus-agents/src/a.ts' }],
      },
    ];
    const fixes = followUpFixesFor(prior, all);
    expect(fixes).toHaveLength(1);
    expect(fixes[0]?.fixPrNumber).toBe(3020);
    expect(fixes[0]?.overlappingSourceFiles).toEqual(['packages/nexus-agents/src/a.ts']);
  });

  it('returns no follow-ups for a PR with no source files', () => {
    const prior = {
      number: 3010,
      title: 'docs: x',
      body: '',
      url: '',
      files: [{ path: 'docs/a.md' }],
    };
    expect(followUpFixesFor(prior, [prior])).toEqual([]);
  });
});
