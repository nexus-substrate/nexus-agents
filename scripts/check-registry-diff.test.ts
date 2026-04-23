/**
 * Tests for check-registry-diff — bounded-diff guardrail (#2180).
 */

import { describe, expect, it } from 'vitest';

import {
  checkGuardrails,
  computeDiff,
  DELETION_RATE_THRESHOLD,
  formatDiffMarkdown,
  PRICE_RATIO_THRESHOLD,
} from './check-registry-diff.js';

function entry(overrides: { id: string; input?: number; output?: number; ctx?: number }): {
  id: string;
  provider: string;
  contextWindow: number;
  pricing?: { inputPer1M: number; outputPer1M: number };
} {
  return {
    id: overrides.id,
    provider: 'x',
    contextWindow: overrides.ctx ?? 200_000,
    ...(overrides.input !== undefined && overrides.output !== undefined
      ? { pricing: { inputPer1M: overrides.input, outputPer1M: overrides.output } }
      : {}),
  };
}

describe('computeDiff', () => {
  it('counts a clean no-op diff', () => {
    const reg = { entries: [entry({ id: 'a' }), entry({ id: 'b' })] };
    const summary = computeDiff(reg, reg);
    expect(summary.added).toHaveLength(0);
    expect(summary.removed).toHaveLength(0);
    expect(summary.changed).toHaveLength(0);
    expect(summary.unchanged).toHaveLength(2);
    expect(summary.deletionRate).toBe(0);
  });

  it('counts additions and removals', () => {
    const oldReg = { entries: [entry({ id: 'a' }), entry({ id: 'b' })] };
    const newReg = { entries: [entry({ id: 'b' }), entry({ id: 'c' })] };
    const summary = computeDiff(oldReg, newReg);
    expect(summary.added).toEqual(['c']);
    expect(summary.removed).toEqual(['a']);
    expect(summary.deletionRate).toBeCloseTo(0.5);
  });

  it('detects a context-window change as changed', () => {
    const oldReg = { entries: [entry({ id: 'a', ctx: 100_000 })] };
    const newReg = { entries: [entry({ id: 'a', ctx: 200_000 })] };
    const summary = computeDiff(oldReg, newReg);
    expect(summary.changed).toEqual(['a']);
    expect(summary.perModel[0]!.contextWindowChanged).toBe(true);
  });

  it('computes the max price-change ratio', () => {
    const oldReg = {
      entries: [entry({ id: 'a', input: 1, output: 1 }), entry({ id: 'b', input: 1, output: 1 })],
    };
    const newReg = {
      entries: [entry({ id: 'a', input: 1, output: 1 }), entry({ id: 'b', input: 15, output: 2 })],
    };
    const summary = computeDiff(oldReg, newReg);
    expect(summary.maxPriceChangeRatio).toBe(15);
    expect(summary.changed).toContain('b');
    expect(summary.unchanged).toContain('a');
  });

  it('treats zero-to-non-zero pricing as a 1x ratio (not infinity)', () => {
    const oldReg = { entries: [entry({ id: 'a', input: 0, output: 0 })] };
    const newReg = { entries: [entry({ id: 'a', input: 5, output: 10 })] };
    const summary = computeDiff(oldReg, newReg);
    expect(summary.maxPriceChangeRatio).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('checkGuardrails', () => {
  it('passes a tiny diff', () => {
    const oldReg = {
      entries: Array.from({ length: 100 }, (_, i) => entry({ id: `m-${String(i)}` })),
    };
    const newReg = { entries: oldReg.entries.slice(0, 98) }; // 2% removed
    const summary = computeDiff(oldReg, newReg);
    const verdict = checkGuardrails(summary);
    expect(verdict.requiresHumanReview).toBe(false);
    expect(summary.deletionRate).toBeLessThan(DELETION_RATE_THRESHOLD);
  });

  it('flags deletion rate above the 5% threshold', () => {
    const oldReg = {
      entries: Array.from({ length: 100 }, (_, i) => entry({ id: `m-${String(i)}` })),
    };
    const newReg = { entries: oldReg.entries.slice(0, 90) }; // 10% removed
    const summary = computeDiff(oldReg, newReg);
    const verdict = checkGuardrails(summary);
    expect(verdict.requiresHumanReview).toBe(true);
    expect(verdict.reasons.some((r) => r.includes('deletion rate'))).toBe(true);
  });

  it('flags a single entry with a 10x+ price bump', () => {
    const oldReg = { entries: [entry({ id: 'a', input: 1, output: 1 })] };
    const newReg = { entries: [entry({ id: 'a', input: 15, output: 1 })] };
    const summary = computeDiff(oldReg, newReg);
    const verdict = checkGuardrails(summary);
    expect(verdict.requiresHumanReview).toBe(true);
    expect(verdict.reasons.some((r) => r.includes('price change ratio'))).toBe(true);
    expect(summary.maxPriceChangeRatio).toBeGreaterThan(PRICE_RATIO_THRESHOLD);
  });

  it('requires multiple reasons when multiple guardrails trip', () => {
    const oldReg = {
      entries: [
        entry({ id: 'a', input: 1, output: 1 }),
        ...Array.from({ length: 100 }, (_, i) => entry({ id: `m-${String(i)}` })),
      ],
    };
    const newReg = { entries: [entry({ id: 'a', input: 100, output: 1 })] };
    const summary = computeDiff(oldReg, newReg);
    const verdict = checkGuardrails(summary);
    expect(verdict.requiresHumanReview).toBe(true);
    expect(verdict.reasons.length).toBe(2);
  });
});

describe('formatDiffMarkdown', () => {
  it('includes headline totals and the needs-review banner when tripped', () => {
    const oldReg = {
      entries: Array.from({ length: 100 }, (_, i) => entry({ id: `m-${String(i)}` })),
    };
    const newReg = { entries: oldReg.entries.slice(0, 50) };
    const summary = computeDiff(oldReg, newReg);
    const verdict = checkGuardrails(summary);
    const md = formatDiffMarkdown(summary, verdict);
    expect(md).toMatch(/Total entries: 100 → 50/);
    expect(md).toMatch(/Requires human review/);
    expect(md).toMatch(/Removed entries/);
  });

  it('omits the needs-review banner on clean diffs', () => {
    const reg = { entries: [entry({ id: 'a' }), entry({ id: 'b' })] };
    const summary = computeDiff(reg, reg);
    const verdict = checkGuardrails(summary);
    const md = formatDiffMarkdown(summary, verdict);
    expect(md).not.toMatch(/Requires human review/);
  });

  it('caps the per-category entry list at 100 and notes the overflow', () => {
    const oldReg = {
      entries: Array.from({ length: 150 }, (_, i) => entry({ id: `m-${String(i)}` })),
    };
    const newReg = { entries: [] };
    const summary = computeDiff(oldReg, newReg);
    const verdict = checkGuardrails(summary);
    const md = formatDiffMarkdown(summary, verdict);
    expect(md).toMatch(/and 50 more/);
  });
});
