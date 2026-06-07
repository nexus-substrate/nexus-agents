/**
 * Tests for the shadow-mode auto-remediation selector (#3540 inc.2a / #3611).
 * The whole point: it OBSERVES, never executes.
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateRemediationShadow,
  recordRemediationShadow,
  createRemediationShadowSink,
  summarizeRemediationShadow,
  getRemediationShadowSink,
  type RemediationShadowRecord,
} from './improvement-remediation-shadow.js';
import type { ImprovementSignal, SignalCategory } from './improvement-review.js';

function signal(over: Partial<ImprovementSignal> = {}): ImprovementSignal {
  return {
    category: 'tech-debt',
    signalKey: 'fitness-floor',
    severity: 'warning',
    title: 'Fitness below floor',
    body: 'Score 82 < floor 90.',
    evidence: {},
    ...over,
  };
}

describe('evaluateRemediationShadow', () => {
  it('would auto-remediate a non-security signal (shadow — no execution)', () => {
    const rec = evaluateRemediationShadow(signal({ category: 'tech-debt' }));
    expect(rec.wouldAutoRemediate).toBe(true);
    expect(rec.taskId).toBe('improvement-fitness-floor');
    expect(rec.reason).toMatch(/not executed/i);
  });

  it('always human-gates a security-category signal (hard exclusion)', () => {
    const rec = evaluateRemediationShadow(signal({ category: 'security', signalKey: 'sec-1' }));
    expect(rec.wouldAutoRemediate).toBe(false);
    expect(rec.reason).toMatch(/security-category — always human-gated/);
  });
});

describe('recordRemediationShadow', () => {
  it('records one decision per signal into the sink (and returns them)', () => {
    const sink = createRemediationShadowSink();
    const records = recordRemediationShadow(
      [signal({ signalKey: 'a' }), signal({ category: 'security', signalKey: 'b' })],
      sink
    );
    expect(records).toHaveLength(2);
    expect(sink.getRecords()).toHaveLength(2);
    expect(sink.getRecords().map((r) => r.wouldAutoRemediate)).toEqual([true, false]);
  });

  it('bounded sink evicts oldest past the cap', () => {
    const sink = createRemediationShadowSink(2);
    for (const k of ['a', 'b', 'c']) recordRemediationShadow([signal({ signalKey: k })], sink);
    expect(sink.getRecords().map((r) => r.signalKey)).toEqual(['b', 'c']);
  });
});

describe('summarizeRemediationShadow', () => {
  it('counts would-remediate vs human-gated and by category', () => {
    const rec = (category: SignalCategory, would: boolean): RemediationShadowRecord => ({
      timestamp: 't',
      signalKey: `${category}-x`,
      taskId: `improvement-${category}-x`,
      category,
      severity: 'warning',
      wouldAutoRemediate: would,
      reason: 'r',
    });
    const summary = summarizeRemediationShadow([
      rec('tech-debt', true),
      rec('bug', true),
      rec('security', false),
    ]);
    expect(summary.total).toBe(3);
    expect(summary.wouldAutoRemediate).toBe(2);
    expect(summary.humanGated).toBe(1);
    expect(summary.byCategory).toEqual({ 'tech-debt': 1, bug: 1, security: 1 });
  });

  it('zero summary for no records', () => {
    expect(summarizeRemediationShadow([])).toEqual({
      total: 0,
      wouldAutoRemediate: 0,
      humanGated: 0,
      byCategory: {},
    });
  });
});

describe('getRemediationShadowSink', () => {
  it('is a stable process-scoped singleton', () => {
    expect(getRemediationShadowSink()).toBe(getRemediationShadowSink());
  });
});
