/**
 * Tests for the deterministic research adapter (#3648).
 * Produces a strict, parseable typed plan from a signal — no untrusted read.
 */

import { describe, it, expect } from 'vitest';
import { buildRemediationPlanFromSignal } from './remediation-research.js';
import { parseRemediationPlan } from './improvement-remediation-capability.js';
import type { ImprovementSignal } from './improvement-review.js';

function sig(over: Partial<ImprovementSignal> = {}): ImprovementSignal {
  return {
    category: 'routing',
    signalKey: 'routing:cli-floor:codex:docs',
    severity: 'warning',
    title: 'routing: codex 30% on docs',
    body: 'floor breach',
    evidence: {},
    ...over,
  };
}

describe('buildRemediationPlanFromSignal', () => {
  it('produces a plan that passes the strict boundary parser', () => {
    const plan = buildRemediationPlanFromSignal(sig());
    expect(() => parseRemediationPlan(plan)).not.toThrow();
    expect(plan.signalKey).toBe(sig().signalKey);
    expect(plan.category).toBe('routing');
  });

  it('maps category → primary action (investigate → action → add-test)', () => {
    const kinds = (c: ImprovementSignal['category']): string[] =>
      buildRemediationPlanFromSignal(sig({ category: c })).steps.map((s) => s.kind);
    expect(kinds('routing')).toEqual(['investigate', 'adjust-routing', 'add-test']);
    expect(kinds('bug')).toEqual(['investigate', 'fix-bug', 'add-test']);
    expect(kinds('tech-debt')).toEqual(['investigate', 'refactor', 'add-test']);
    expect(kinds('security')).toEqual(['investigate', 'investigate', 'add-test']);
    expect(kinds('consensus')).toEqual(['investigate', 'investigate', 'add-test']);
  });

  it('clips an over-long title into a schema-safe summary/description', () => {
    const plan = buildRemediationPlanFromSignal(sig({ title: 'x'.repeat(2000) }));
    expect(() => parseRemediationPlan(plan)).not.toThrow();
    expect(plan.summary.length).toBeLessThanOrEqual(1000);
    expect(plan.steps.every((s) => s.description.length <= 500)).toBe(true);
  });

  it('is deterministic (no untrusted read / randomness)', () => {
    expect(buildRemediationPlanFromSignal(sig())).toEqual(buildRemediationPlanFromSignal(sig()));
  });

  it('populates sourceContext with bounded description and valid digest (#7429)', () => {
    const s = sig({
      body: 'a'.repeat(1500),
    });
    const plan = buildRemediationPlanFromSignal(s);
    expect(plan.sourceContext?.description).toHaveLength(1200);
    expect(plan.sourceContext?.digest).toBeDefined();
    expect(() => parseRemediationPlan(plan)).not.toThrow();
  });

  it('populates sourceContext with bounded evidence fields (#7429)', () => {
    const s = sig({
      evidence: {
        samples: 42,
        window: 'w'.repeat(300),
        observedValue: 0.12,
        threshold: 0.9,
      },
    });
    const plan = buildRemediationPlanFromSignal(s);
    const evid = plan.sourceContext?.evidence;
    expect(evid?.window).toHaveLength(200);
    expect(evid?.samples).toBe(42);
    expect(evid?.observedValue).toBe(0.12);
    expect(evid?.threshold).toBe(0.9);
    expect(() => parseRemediationPlan(plan)).not.toThrow();
  });

  it('drops non-finite evidence values during normalization', () => {
    const s = sig({
      body: 'valid body',
      evidence: {
        samples: NaN,
        observedValue: Infinity,
        threshold: -Infinity,
      },
    });
    const plan = buildRemediationPlanFromSignal(s);
    expect(plan.sourceContext?.evidence?.samples).toBeUndefined();
    expect(plan.sourceContext?.evidence?.observedValue).toBeUndefined();
    expect(plan.sourceContext?.evidence?.threshold).toBeUndefined();
    expect(() => parseRemediationPlan(plan)).not.toThrow();
  });

  it('omits sourceContext when body is empty and evidence is empty', () => {
    const s = sig({ body: '', evidence: {} });
    const plan = buildRemediationPlanFromSignal(s);
    expect(plan.sourceContext).toBeUndefined();
    expect(() => parseRemediationPlan(plan)).not.toThrow();
  });
});
