/**
 * Tests for the shadow→enforce exit criterion (#3540 inc.2b / #3612).
 * Falsifiable, fail-closed: ready only when EVERY criterion passes.
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateEnforceReadiness,
  DEFAULT_ENFORCE_READINESS_CONFIG,
  type EnforceReadinessEvidence,
} from './improvement-enforce-readiness.js';

/** Evidence that satisfies every default criterion. */
function readyEvidence(over: Partial<EnforceReadinessEvidence> = {}): EnforceReadinessEvidence {
  return {
    shadowSelections: 120,
    rawPanelRows: over.panel?.n ?? over.judgedSelections ?? 110,
    rawOwnerSampleRows: 0, // ≥ 100 (#4158)
    judgedSelections: 110, // 91.7% ≥ 80%
    judgedSound: 105, // 95.5% ≥ 90%
    evaluator: 'security-reviewer@example',
    owner: 'williamzujkowski',
    human: { n: 0, disagreements: 0 },
    panel: { n: over.judgedSelections ?? 110, disagreements: 0 },
    sampleExists: true,
    sampledSelections: 10,
    ...{ sampleFresh: true },
    sample: { n: 10, disagreements: 0 },
    ...over,
  };
}

describe('evaluateEnforceReadiness', () => {
  it('is ready when every criterion is met', () => {
    const r = evaluateEnforceReadiness(readyEvidence());
    expect(r.ready).toBe(true);
    expect(r.blockers).toEqual([]);
  });

  it('blocks on insufficient volume', () => {
    const r = evaluateEnforceReadiness(
      readyEvidence({ shadowSelections: 5, judgedSelections: 5, judgedSound: 5 })
    );
    expect(r.ready).toBe(false);
    expect(r.blockers).toContain('volume');
  });

  it('blocks on insufficient judged coverage', () => {
    const r = evaluateEnforceReadiness(
      readyEvidence({ shadowSelections: 120, judgedSelections: 10 })
    );
    expect(r.ready).toBe(false);
    expect(r.blockers).toContain('judged-coverage');
  });

  it('blocks on insufficient soundness rate', () => {
    const r = evaluateEnforceReadiness(readyEvidence({ judgedSelections: 22, judgedSound: 10 }));
    expect(r.ready).toBe(false);
    expect(r.blockers).toContain('soundness');
  });

  it('is ready at EXACTLY the threshold rates (>= boundary — catches an off-by-one flip)', () => {
    // judged 80/100 = exactly 0.80; sound 72/80 = exactly 0.90; volume 100 ≥ 100.
    // A `>=`→`>` regression on the gate that authorizes autonomous writes would
    // flip this to not-ready.
    const r = evaluateEnforceReadiness(
      readyEvidence({ shadowSelections: 100, judgedSelections: 80, judgedSound: 72 })
    );
    expect(r.ready).toBe(true);
  });

  it('is ready at EXACTLY the minimum volume (>= boundary)', () => {
    const r = evaluateEnforceReadiness(
      readyEvidence({ shadowSelections: 100, judgedSelections: 100, judgedSound: 100 })
    );
    expect(r.ready).toBe(true);
  });

  it('soundness fails closed when there are zero reviews (no divide-by-zero pass)', () => {
    const r = evaluateEnforceReadiness(
      readyEvidence({ shadowSelections: 120, judgedSelections: 0, judgedSound: 0 })
    );
    expect(r.ready).toBe(false);
    expect(r.blockers).toEqual(expect.arrayContaining(['judged-coverage', 'soundness']));
  });

  it('blocks on missing named evaluator', () => {
    // Omit evaluator entirely (exactOptionalPropertyTypes — no explicit undefined).
    const r = evaluateEnforceReadiness({
      shadowSelections: 120,
      judgedSelections: 22,
      judgedSound: 21,
      owner: 'williamzujkowski',
    });
    expect(r.ready).toBe(false);
    expect(r.blockers).toContain('named-evaluator');
    // #4181: pin THIS copy's wording. readiness-verdict.ts documents that the two
    // presenceCriterion copies deliberately diverge ("no named {label}" here vs
    // "no {label}" in codepr-enable-readiness) — do not unify.
    expect(r.criteria.find((c) => c.name === 'named-evaluator')?.detail).toBe('no named evaluator');
  });

  it('blocks on missing / blank named owner', () => {
    const missing = evaluateEnforceReadiness({
      shadowSelections: 120,
      judgedSelections: 22,
      judgedSound: 21,
      evaluator: 'rev@example',
    });
    expect(missing.blockers).toContain('named-owner');
    // #4181: pin this copy's deliberate "no named {label}" wording (see readiness-verdict.ts).
    expect(missing.criteria.find((c) => c.name === 'named-owner')?.detail).toBe('no named owner');
    const blank = evaluateEnforceReadiness(readyEvidence({ owner: '   ' }));
    expect(blank.blockers).toContain('named-owner');
    expect(blank.criteria.find((c) => c.name === 'named-owner')?.detail).toBe('no named owner');
  });

  it('honors relaxed config (evaluator/owner not required)', () => {
    const r = evaluateEnforceReadiness(readyEvidence({ evaluator: '', owner: '' }), {
      ...DEFAULT_ENFORCE_READINESS_CONFIG,
      requireNamedEvaluator: false,
      requireNamedOwner: false,
    });
    expect(r.ready).toBe(true);
  });

  it('blocks when no owner sample exists despite otherwise ready evidence', () => {
    const r = evaluateEnforceReadiness(readyEvidence({ sampleExists: false }));
    expect(r.ready).toBe(false);
    expect(r.blockers).toContain('owner-agreement');
  });

  it('blocks when fewer than ten sampled refs have owner judgments', () => {
    const r = evaluateEnforceReadiness(readyEvidence({ sample: { n: 9, disagreements: 0 } }));
    expect(r.ready).toBe(false);
    expect(r.blockers).toContain('owner-agreement');
  });

  it('an incomplete sample blocks even with ten judgments and a prior owner sign-off', () => {
    const r = evaluateEnforceReadiness(readyEvidence({ sampledSelections: 11 }));
    expect(r.ready).toBe(false);
    expect(r.blockers).toContain('owner-agreement');
    expect(r.criteria.find((c) => c.name === 'owner-agreement')?.detail).toContain('10 of 11');
  });

  it('one sampled disagreement blocks enforcement', () => {
    const r = evaluateEnforceReadiness(readyEvidence({ sample: { n: 10, disagreements: 1 } }));
    expect(r.ready).toBe(false);
    expect(r.blockers).toContain('owner-agreement');
  });

  it('any historical owner disagreement blocks even with a relaxed disagreement allowance', () => {
    const report = evaluateEnforceReadiness(
      readyEvidence({ sample: { n: 10, disagreements: 1 } }),
      { ...DEFAULT_ENFORCE_READINESS_CONFIG, maxSampleDisagreements: 1 }
    );
    expect(report.blockers).toContain('owner-agreement');
    expect(report.criteria.find((c) => c.name === 'owner-agreement')?.detail).toContain(
      'allow ≤ 0'
    );
  });

  it('counts human and panel judgments while excluding owner samples from coverage', () => {
    const r = evaluateEnforceReadiness(
      readyEvidence({
        judgedSelections: 120,
        human: { n: 30, disagreements: 0 },
        panel: { n: 60, disagreements: 0 },
        sample: { n: 10, disagreements: 0 },
      })
    );
    expect(r.blockers).toContain('judged-coverage');
    expect(r.criteria.find((c) => c.name === 'judged-coverage')?.detail).toContain('75%');
  });

  it('never accepts a panel id as the named evaluator', () => {
    const report = evaluateEnforceReadiness(readyEvidence({ evaluator: 'panel:vote-123' }));
    expect(report.blockers).toContain('named-evaluator');
  });

  it('rejects a real evaluator name without any human or owner judgment on structured evidence', () => {
    const report = evaluateEnforceReadiness(
      readyEvidence({
        evaluator: 'Alice',
        human: { n: 0, disagreements: 0 },
        sample: { n: 0, disagreements: 0 },
      })
    );
    expect(report.blockers).toContain('named-evaluator');
  });

  it('accepts a real owner evaluator from historical samples after a redraw', () => {
    const report = evaluateEnforceReadiness({
      ...readyEvidence({ sample: { n: 0, disagreements: 0 } }),
      ...{ namedEvaluatorJudgments: 1 },
    });
    expect(report.blockers).not.toContain('named-evaluator');
  });

  it('keeps the all-human path READY with no owner sample: n/a — no current panel judgments', () => {
    const report = evaluateEnforceReadiness(
      readyEvidence({
        human: { n: 110, disagreements: 0 },
        panel: { n: 0, disagreements: 0 },
        sample: { n: 0, disagreements: 0 },
        sampleExists: false,
      })
    );
    expect(report.ready).toBe(true);
    expect(report.criteria.find((c) => c.name === 'owner-agreement')).toEqual({
      name: 'owner-agreement',
      met: true,
      detail: 'n/a — no current panel judgments',
    });
  });

  it('names owner-agreement as n/a for the empty review set while other gates fail', () => {
    const report = evaluateEnforceReadiness(
      readyEvidence({
        human: { n: 0, disagreements: 0 },
        panel: { n: 0, disagreements: 0 },
        sample: { n: 0, disagreements: 0 },
        sampleExists: false,
        judgedSelections: 0,
        judgedSound: 0,
      })
    );
    expect(report.ready).toBe(false);
    expect(report.criteria.find((c) => c.name === 'owner-agreement')).toEqual({
      name: 'owner-agreement',
      met: true,
      detail: 'n/a — no current panel judgments',
    });
  });

  it('blocks a sample older than the latest current panel batch with a named stale reason', () => {
    const report = evaluateEnforceReadiness({ ...readyEvidence(), ...{ sampleFresh: false } });
    expect(report.blockers).toContain('owner-agreement');
    expect(report.criteria.find((c) => c.name === 'owner-agreement')?.detail).toBe(
      'stale owner sample — drawn before or at the latest panel judgment'
    );
  });

  it('fails unmeasured freshness rather than certifying a sample without draw evidence', () => {
    const evidence = { ...readyEvidence() };
    Reflect.deleteProperty(evidence, 'sampleFresh');
    const report = evaluateEnforceReadiness(evidence);
    expect(report.blockers).toContain('owner-agreement');
    expect(report.criteria.find((c) => c.name === 'owner-agreement')?.detail).toBe(
      'unmeasured owner sample freshness'
    );
  });

  it('fails missing sample cardinality as unmeasured instead of inferring it from judgments', () => {
    const evidence = { ...readyEvidence() };
    Reflect.deleteProperty(evidence, 'sampledSelections');
    const report = evaluateEnforceReadiness(evidence);
    expect(report.blockers).toContain('owner-agreement');
    expect(report.criteria.find((c) => c.name === 'owner-agreement')?.detail).toBe(
      'unmeasured owner sample size'
    );
  });

  it('default config is a high, conservative bar', () => {
    expect(DEFAULT_ENFORCE_READINESS_CONFIG.minSoundnessRate).toBeGreaterThanOrEqual(0.9);
    // #4158: volume bar matches the comparably-stakes access-policy flip (clawguard ≥100),
    // not the prior 20 — this gate authorizes autonomous REAL code changes.
    expect(DEFAULT_ENFORCE_READINESS_CONFIG.minShadowSelections).toBeGreaterThanOrEqual(100);
    expect(DEFAULT_ENFORCE_READINESS_CONFIG.requireNamedEvaluator).toBe(true);
    expect(DEFAULT_ENFORCE_READINESS_CONFIG.requireNamedOwner).toBe(true);
  });

  it('reports every criterion with the exact human-readable detail (#4181)', () => {
    // 110/120 judged = 91.7% → rounds to 92; 105/110 sound = 95.5% → rounds to 95.
    const r = evaluateEnforceReadiness(readyEvidence());
    expect(r.criteria).toEqual([
      { name: 'volume', met: true, detail: '120 shadow selections (need ≥ 100)' },
      {
        name: 'judged-coverage',
        met: true,
        detail: '92% reviewed (need ≥ 80%); 0 unverifiable and 0 evicted panel rows',
      },
      {
        name: 'soundness',
        met: true,
        detail: '95% of reviewed judged sound (need ≥ 90%, with reviews present)',
      },
      { name: 'named-evaluator', met: true, detail: 'evaluator: security-reviewer@example' },
      { name: 'named-owner', met: true, detail: 'owner: williamzujkowski' },
      {
        name: 'owner-agreement',
        met: true,
        detail: '10 of 10 owner sample judgments (need ≥ 10); 0 disagreements (allow ≤ 0)',
      },
    ]);
  });
});

describe('owner agreement applicability follows raw evidence', () => {
  it('reports historical owner marks alone as n/a when no current panels remain', () => {
    // Previously this asserted a missing sample: history alone no longer requires freshness.
    const report = evaluateEnforceReadiness(
      readyEvidence({
        human: { n: 110, disagreements: 0 },
        panel: { n: 0, disagreements: 0 },
        sampleExists: false,
        sample: { n: 0, disagreements: 0 },
        rawPanelRows: 0,
        rawOwnerSampleRows: 1,
      })
    );
    expect(report.ready).toBe(true);
    expect(report.criteria.find((criterion) => criterion.name === 'owner-agreement')).toMatchObject(
      {
        met: true,
        detail: 'n/a — no current panel judgments',
      }
    );
  });

  it.each([
    [{ rawPanelRows: 1 }, 'no owner sample'],
    [{ rawPanelRows: 1, unverifiablePanelRows: 1 }, 'unverifiable panel'],
    [{ rawPanelRows: 1, evictedPanelRows: 1 }, 'evicted panel'],
    [{ rawPanelRows: 0, sample: { n: 0, disagreements: 1 } }, 'owner disagreements'],
  ])('fails rather than claiming n/a for retained raw evidence: %j', (extra, reason) => {
    const evidence = readyEvidence({
      human: { n: 110, disagreements: 0 },
      panel: { n: 0, disagreements: 0 },
      sampleExists: false,
      sample: { n: 0, disagreements: 0 },
      ...extra,
    });
    const result = evaluateEnforceReadiness(evidence);
    expect(result.ready).toBe(false);
    expect(result.criteria.find((c) => c.name === 'owner-agreement')).toMatchObject({
      met: false,
      detail: expect.stringContaining(reason),
    });
  });
});
