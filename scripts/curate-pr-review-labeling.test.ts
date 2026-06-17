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

  it('escalates to high (never critical) on a clear integrity-domain defect-fix (#3847)', () => {
    // A confirmed defect-fix touching an integrity domain (security path +
    // a guard/validation signal) escalates from the medium floor to high, but
    // NEVER auto-criticals — that needs an explicit exploit rationale.
    const l = proposeLabel(
      signals({
        followUpFixes: [
          fix({ overlappingSourceFiles: ['packages/nexus-agents/src/security/s.ts'] }),
        ],
      }),
      new Map([[200, 'fix(security): add missing guard so the check resolves']])
    );
    expect(l.class).toBe('buggy');
    expect(l.severity).toBe('high');
  });

  it('stays at the medium floor when there is no integrity signal (#3847)', () => {
    const l = proposeLabel(
      signals({
        followUpFixes: [
          fix({ overlappingSourceFiles: ['packages/nexus-agents/src/cost/persist.ts'] }),
        ],
      }),
      new Map([[200, 'fix(cost): fail loud on a silently dropped cost record']])
    );
    expect(l.severity).toBe('medium');
  });

  it('proposes clean for a heuristic refinement, even in a correctness path (#3847)', () => {
    // A `fix(` whose KIND is a refinement (tunes heuristics) is NOT a bug
    // correction — the prior PR was not buggy. The path is irrelevant.
    const l = proposeLabel(
      signals({ followUpFixes: [fix()] }),
      new Map([[200, 'fix(governance): refine suggest-signal heuristics']])
    );
    expect(l.class).toBe('clean');
    expect(l.needsAdjudication).toBe(false);
    expect(l.severity).toBeNull();
  });

  it('proposes clean for a no-behavior-change hardening (#3847)', () => {
    const l = proposeLabel(
      signals({ followUpFixes: [fix()] }),
      new Map([[200, 'fix(orchestration): harden router — no live routing change']])
    );
    expect(l.class).toBe('clean');
  });

  it('detects a real bug-fix OUTSIDE the old correctness-path allowlist (#3847)', () => {
    // Pre-#3847 this was borderline purely because the path was not allowlisted.
    // The corrective KIND (adds a guard for a silent drop) now drives `buggy`.
    const l = proposeLabel(
      signals({
        followUpFixes: [fix({ overlappingSourceFiles: ['packages/nexus-agents/src/util/u.ts'] })],
      }),
      new Map([[200, 'fix(util): guard against a silently dropped result']])
    );
    expect(l.class).toBe('buggy');
    expect(l.severity).toBe('medium');
    expect(l.needsAdjudication).toBe(true);
  });

  it('leaves a bare fix with no defect/refinement marker borderline (Rule 4)', () => {
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

  // #3935 review (Contrarian): the keyword sets must not produce confident-WRONG
  // labels on title collisions. A refinement word must NOT mask a real defect-fix
  // (→ borderline, not a false 'clean'), and 'cosmetic' means trivial (→ clean,
  // not a false 'buggy'). These two are the adversarial counterexamples.
  it('does NOT label a real defect-fix clean just because the title also says "tune" (collision → borderline)', () => {
    const l = proposeLabel(
      signals({ followUpFixes: [fix()] }),
      new Map([[200, 'fix(memory): tune GC to prevent OOM crash']])
    );
    // defect markers (oom/crash) + refinement marker (tune) → ambiguous, NOT clean.
    expect(l.class).toBe('borderline');
    expect(l.needsAdjudication).toBe(true);
  });

  it('does NOT label a bare "cosmetic" fix buggy — the word is ambiguous → borderline, never a false buggy', () => {
    // "cosmetic" is in NEITHER marker set (it means trivial in "cosmetic padding"
    // but non-functional in "cosmetic gate made to resolve"). With no other
    // marker it falls to borderline+adjudication, NOT a confident buggy label.
    const l = proposeLabel(
      signals({ followUpFixes: [fix()] }),
      new Map([[200, 'fix(ui): cosmetic padding adjustment']])
    );
    expect(l.class).toBe('borderline');
    expect(l.needsAdjudication).toBe(true);
    expect(l.severity).toBeNull();
  });

  // ==========================================================================
  // Held-out regression cases — the 5 pilot PRs from the independent
  // adjudication (#3847). The fixtures encode each corrective PR's OBJECTIVE
  // signals (type prefix + title keywords + overlapping path); the tuned,
  // GENERALIZED rule must return the adjudicated ground truth. No PR number is
  // referenced by the labeler logic — the numbers live only here, as fixtures.
  // ==========================================================================
  describe('#3847 held-out adjudication ground truth', () => {
    it('#3915 → buggy/medium: fail-loud + rate-limit for a SILENT cost-persist drop', () => {
      const l = proposeLabel(
        signals({
          number: 3915,
          followUpFixes: [
            fix({
              fixPrNumber: 3918,
              overlappingSourceFiles: ['packages/nexus-agents/src/cost/persist.ts'],
            }),
          ],
        }),
        new Map([[3918, 'fix(cost): fail-loud + rate-limit a silently dropped audit/cost record']])
      );
      expect(l.class).toBe('buggy');
      expect(l.severity).toBe('medium');
    });

    it('#3900 → clean: the later PR only REFINED signal heuristics (quality)', () => {
      const l = proposeLabel(
        signals({
          number: 3900,
          followUpFixes: [
            fix({
              fixPrNumber: 3929,
              overlappingSourceFiles: ['packages/nexus-agents/src/governance/fitness.ts'],
            }),
          ],
        }),
        new Map([[3929, 'fix(governance): refine tool-fitness suggest-signal heuristics']])
      );
      expect(l.class).toBe('clean');
    });

    it('#3893 → buggy/high: a cosmetic governance gate made to actually resolve its ref', () => {
      const l = proposeLabel(
        signals({
          number: 3893,
          followUpFixes: [
            fix({
              fixPrNumber: 3895,
              overlappingSourceFiles: ['packages/nexus-agents/src/governance/gate.ts'],
            }),
          ],
        }),
        new Map([[3895, 'fix(governance): make the cosmetic gate actually resolve its ref']])
      );
      expect(l.class).toBe('buggy');
      expect(l.severity).toBe('high');
    });

    it('#3886 → buggy/high: router split-brain / missing rule-guard / silent tie-break', () => {
      const l = proposeLabel(
        signals({
          number: 3886,
          followUpFixes: [
            fix({
              fixPrNumber: 3892,
              overlappingSourceFiles: ['packages/nexus-agents/src/orchestration/router.ts'],
            }),
          ],
        }),
        new Map([
          [
            3892,
            'fix(orchestration): correct router split-brain, add rule-guard, fix silent tie-break',
          ],
        ])
      );
      expect(l.class).toBe('buggy');
      expect(l.severity).toBe('high');
    });

    it('#3873 → buggy/high: a CI gate made to actually read the doc it claimed to check', () => {
      const l = proposeLabel(
        signals({
          number: 3873,
          followUpFixes: [
            fix({
              fixPrNumber: 3884,
              overlappingSourceFiles: ['packages/nexus-agents/src/checks/doc-gate.ts'],
            }),
          ],
        }),
        new Map([
          [3884, 'fix(ci): make the gate actually read & validate the doc it claims to check'],
        ])
      );
      expect(l.class).toBe('buggy');
      expect(l.severity).toBe('high');
    });
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
