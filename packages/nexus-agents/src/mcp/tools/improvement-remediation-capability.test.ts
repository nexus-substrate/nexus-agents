/**
 * Tests for the Rule-of-Two capability boundary primitives (#3540 inc.2c / #3613).
 * Fail-closed: capabilities denied unless a phase grants them; no phase holds all 3;
 * the plan artifact is strict (no smuggling across the boundary).
 */

import { describe, it, expect } from 'vitest';
import {
  CapabilityLedger,
  RuleOfTwoViolation,
  PHASE_CAPABILITIES,
  RULE_OF_TWO_LEGS,
  assertPhaseCapabilitiesSound,
  parseRemediationPlan,
  RemediationPlanSchema,
  type RemediationPlan,
} from './improvement-remediation-capability.js';

describe('PHASE_CAPABILITIES invariant', () => {
  it('no phase declares all three Rule-of-Two legs', () => {
    for (const caps of Object.values(PHASE_CAPABILITIES)) {
      expect(RULE_OF_TWO_LEGS.every((leg) => caps.has(leg))).toBe(false);
    }
  });

  it('assertPhaseCapabilitiesSound passes for the shipped config', () => {
    expect(() => {
      assertPhaseCapabilitiesSound();
    }).not.toThrow();
  });

  it('research has no write; implement has no untrusted-input', () => {
    expect(PHASE_CAPABILITIES.research.has('repo-write')).toBe(false);
    expect(PHASE_CAPABILITIES.implement.has('untrusted-input')).toBe(false);
  });
});

describe('CapabilityLedger (fail-closed)', () => {
  /** Wrap a void assertCapability call so the arrow isn't a void-returning shorthand. */
  const cap =
    (led: CapabilityLedger, c: Parameters<CapabilityLedger['assertCapability']>[0]) => (): void => {
      led.assertCapability(c);
    };

  it('denies every capability before any phase is entered', () => {
    const led = new CapabilityLedger();
    expect(cap(led, 'secrets')).toThrow(RuleOfTwoViolation);
    expect(cap(led, 'repo-write')).toThrow(RuleOfTwoViolation);
    expect(cap(led, 'untrusted-input')).toThrow(RuleOfTwoViolation);
  });

  it('RESEARCH grants untrusted-input + secrets, denies repo-write', () => {
    const led = new CapabilityLedger();
    led.enterPhase('research');
    expect(cap(led, 'untrusted-input')).not.toThrow();
    expect(cap(led, 'secrets')).not.toThrow();
    expect(cap(led, 'repo-write')).toThrow(RuleOfTwoViolation);
  });

  it('IMPLEMENT grants repo-write + secrets, denies untrusted-input', () => {
    const led = new CapabilityLedger();
    led.enterPhase('implement');
    expect(cap(led, 'repo-write')).not.toThrow();
    expect(cap(led, 'secrets')).not.toThrow();
    expect(cap(led, 'untrusted-input')).toThrow(RuleOfTwoViolation);
  });

  it('the forbidden third leg is always denied in whatever phase is active', () => {
    // Whichever phase we are in, at most two legs are grantable; the third throws.
    const research = new CapabilityLedger();
    research.enterPhase('research');
    expect(cap(research, 'repo-write')).toThrow(); // write denied during untrusted-read phase
    const implement = new CapabilityLedger();
    implement.enterPhase('implement');
    expect(cap(implement, 'untrusted-input')).toThrow(); // fresh untrusted denied during write phase
  });
});

describe('RemediationPlanSchema (strict boundary artifact)', () => {
  const valid: RemediationPlan = {
    signalKey: 'tech-debt:fitness-below-floor',
    category: 'tech-debt',
    summary: 'Restore fitness by addressing the failing dimension.',
    steps: [{ kind: 'add-test', description: 'cover the regressed path' }],
  };

  it('accepts a valid typed plan', () => {
    expect(() => parseRemediationPlan(valid)).not.toThrow();
    expect(parseRemediationPlan(valid).signalKey).toBe(valid.signalKey);
  });

  it('rejects unknown keys (no free-form smuggling across the boundary)', () => {
    const smuggled = { ...valid, shellCommand: 'rm -rf /' };
    expect(() => parseRemediationPlan(smuggled)).toThrow(RuleOfTwoViolation);
    expect(RemediationPlanSchema.safeParse(smuggled).success).toBe(false);
  });

  it('rejects an unknown action kind', () => {
    const bad = { ...valid, steps: [{ kind: 'exec-arbitrary', description: 'x' }] };
    expect(() => parseRemediationPlan(bad)).toThrow(RuleOfTwoViolation);
  });

  it('rejects an over-long (free-form overflow) description', () => {
    const bad = { ...valid, steps: [{ kind: 'refactor', description: 'x'.repeat(501) }] };
    expect(() => parseRemediationPlan(bad)).toThrow(RuleOfTwoViolation);
  });

  it('rejects empty steps (a plan must propose at least one typed action)', () => {
    expect(() => parseRemediationPlan({ ...valid, steps: [] })).toThrow(RuleOfTwoViolation);
  });

  it('rejects unknown keys inside a step', () => {
    const bad = { ...valid, steps: [{ kind: 'fix-bug', description: 'x', patch: 'diff…' }] };
    expect(() => parseRemediationPlan(bad)).toThrow(RuleOfTwoViolation);
  });
});
