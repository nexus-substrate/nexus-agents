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
    shadowSelections: 120, // ≥ 100 (#4158)
    judgedSelections: 110, // 91.7% ≥ 80%
    judgedSound: 105, // 95.5% ≥ 90%
    evaluator: 'security-reviewer@example',
    owner: 'williamzujkowski',
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
  });

  it('blocks on missing / blank named owner', () => {
    const missing = evaluateEnforceReadiness({
      shadowSelections: 120,
      judgedSelections: 22,
      judgedSound: 21,
      evaluator: 'rev@example',
    });
    expect(missing.blockers).toContain('named-owner');
    expect(evaluateEnforceReadiness(readyEvidence({ owner: '   ' })).blockers).toContain(
      'named-owner'
    );
  });

  it('honors relaxed config (evaluator/owner not required)', () => {
    const r = evaluateEnforceReadiness(
      { shadowSelections: 120, judgedSelections: 110, judgedSound: 105 },
      {
        ...DEFAULT_ENFORCE_READINESS_CONFIG,
        requireNamedEvaluator: false,
        requireNamedOwner: false,
      }
    );
    expect(r.ready).toBe(true);
  });

  it('default config is a high, conservative bar', () => {
    expect(DEFAULT_ENFORCE_READINESS_CONFIG.minSoundnessRate).toBeGreaterThanOrEqual(0.9);
    // #4158: volume bar matches the comparably-stakes access-policy flip (clawguard ≥100),
    // not the prior 20 — this gate authorizes autonomous REAL code changes.
    expect(DEFAULT_ENFORCE_READINESS_CONFIG.minShadowSelections).toBeGreaterThanOrEqual(100);
    expect(DEFAULT_ENFORCE_READINESS_CONFIG.requireNamedEvaluator).toBe(true);
    expect(DEFAULT_ENFORCE_READINESS_CONFIG.requireNamedOwner).toBe(true);
  });

  it('reports every criterion with a human-readable detail', () => {
    const r = evaluateEnforceReadiness(readyEvidence());
    expect(r.criteria.map((c) => c.name)).toEqual([
      'volume',
      'judged-coverage',
      'soundness',
      'named-evaluator',
      'named-owner',
    ]);
    expect(r.criteria.every((c) => c.detail.length > 0)).toBe(true);
  });
});
