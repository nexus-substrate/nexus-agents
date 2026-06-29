/**
 * Tests for the deterministic ClawGuard violation FP-rate + precision scorer
 * (#4104, epic #4094, PART 2 of #4097).
 */

import { describe, it, expect } from 'vitest';

import { computeClawGuardFalsePositiveRate, type ClawGuardCorpusEntry } from './clawguard-eval.js';
import { CLAWGUARD_CORPUS } from './clawguard-eval-corpus.js';

describe('computeClawGuardFalsePositiveRate — deterministic FP/precision scorer (#4104)', () => {
  it('is fully deterministic (same corpus → identical result)', () => {
    const a = computeClawGuardFalsePositiveRate(CLAWGUARD_CORPUS);
    const b = computeClawGuardFalsePositiveRate(CLAWGUARD_CORPUS);
    expect(a).toEqual(b);
  });

  it('produces valid numbers over the starter corpus', () => {
    const r = computeClawGuardFalsePositiveRate(CLAWGUARD_CORPUS);
    expect(r.total).toBe(CLAWGUARD_CORPUS.length);
    expect(r.truePositives + r.falsePositives).toBe(r.total);
    expect(r.falsePositiveRate).toBeGreaterThanOrEqual(0);
    expect(r.falsePositiveRate).toBeLessThanOrEqual(1);
    expect(r.precision).toBe(r.truePositives / (r.truePositives + r.falsePositives));
    // precision is exactly 1 − falsePositiveRate for a fired-violation corpus.
    expect(r.precision).toBeCloseTo(1 - r.falsePositiveRate, 10);
    // Surface the headline number (the #2077-decision proxy metric).
    // eslint-disable-next-line no-console
    console.log(
      `[clawguard-eval #4104] fpRate=${r.falsePositiveRate.toFixed(2)} ` +
        `precision=${r.precision.toFixed(2)} (n=${String(r.total)})`
    );
  });

  it('REGRESSION GUARD: the starter corpus FP-rate stays in a sane band', () => {
    // Precision regression guard: a jump here means the hand-labeled fixtures drifted
    // (or the tally broke). Floor set conservatively below the observed value (0.2);
    // tighten as the corpus grows toward the live judged-event volume.
    const r = computeClawGuardFalsePositiveRate(CLAWGUARD_CORPUS);
    expect(r.falsePositiveRate).toBeGreaterThanOrEqual(0);
    expect(r.falsePositiveRate).toBeLessThanOrEqual(0.4);
  });

  it('handles an empty corpus without dividing by zero', () => {
    const empty: ClawGuardCorpusEntry[] = [];
    const r = computeClawGuardFalsePositiveRate(empty);
    expect(r).toEqual({
      total: 0,
      truePositives: 0,
      falsePositives: 0,
      falsePositiveRate: 0,
      precision: 0,
    });
  });

  it('SELF-CONSISTENCY: every entry carries a boolean label and non-empty context/rationale', () => {
    for (const entry of CLAWGUARD_CORPUS) {
      expect(typeof entry.isFalsePositive).toBe('boolean');
      expect(entry.taskContext.length).toBeGreaterThan(0);
      expect(entry.rationale.length).toBeGreaterThan(0);
      expect(entry.rule.length).toBeGreaterThan(0);
      expect(entry.warning.length).toBeGreaterThan(0);
    }
  });
});
