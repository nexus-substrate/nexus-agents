/**
 * Tests for the runaway-loop guard (#3540 inc.2g / #3617).
 * Each axis (cooldown/idempotency, depth, rate) blocks independently, fail-closed.
 */

import { describe, it, expect } from 'vitest';
import {
  RemediationGuard,
  getRemediationGuard,
  DEFAULT_REMEDIATION_GUARD_CONFIG,
} from './improvement-remediation-guard.js';

const T0 = 1_700_000_000_000;

describe('RemediationGuard — cooldown / idempotency', () => {
  it('allows a first attempt for a signal', () => {
    const g = new RemediationGuard();
    const d = g.canRemediate('tech-debt:fitness-below-floor', T0);
    expect(d.allowed).toBe(true);
  });

  it('blocks the SAME signal again within the cooldown (the recursive-retrigger case)', () => {
    const g = new RemediationGuard({ cooldownMs: 1000 });
    g.recordAttempt('tech-debt:fitness-below-floor', T0);
    const d = g.canRemediate('tech-debt:fitness-below-floor', T0 + 500);
    expect(d.allowed).toBe(false);
    expect(d.blockReason).toBe('cooldown');
  });

  it('allows the same signal again AFTER the cooldown elapses', () => {
    const g = new RemediationGuard({ cooldownMs: 1000 });
    g.recordAttempt('sig', T0);
    expect(g.canRemediate('sig', T0 + 1001).allowed).toBe(true);
  });

  it('cooldown is per-signal — a different signal is unaffected', () => {
    const g = new RemediationGuard({ cooldownMs: 10_000 });
    g.recordAttempt('sig-a', T0);
    expect(g.canRemediate('sig-b', T0 + 1).allowed).toBe(true);
  });
});

describe('RemediationGuard — depth / generation', () => {
  it('blocks a remediation deeper than maxGenerations (runaway chain)', () => {
    const g = new RemediationGuard({ maxGenerations: 1 });
    expect(g.canRemediate('sig', T0, 1).allowed).toBe(true);
    const d = g.canRemediate('sig', T0, 2);
    expect(d.allowed).toBe(false);
    expect(d.blockReason).toBe('depth');
  });

  it('root (generation 0) is always within depth', () => {
    const g = new RemediationGuard({ maxGenerations: 0 });
    expect(g.canRemediate('sig', T0, 0).allowed).toBe(true);
    expect(g.canRemediate('sig', T0, 1).allowed).toBe(false);
  });
});

describe('RemediationGuard — rate cap', () => {
  it('blocks once maxPerWindow attempts have occurred in the window', () => {
    const g = new RemediationGuard({ maxPerWindow: 3, windowMs: 10_000, cooldownMs: 0 });
    for (let i = 0; i < 3; i++) g.recordAttempt(`sig-${String(i)}`, T0 + i);
    const d = g.canRemediate('sig-new', T0 + 4);
    expect(d.allowed).toBe(false);
    expect(d.blockReason).toBe('rate');
  });

  it('attempts outside the window do not count toward the cap', () => {
    const g = new RemediationGuard({ maxPerWindow: 2, windowMs: 1000, cooldownMs: 0 });
    g.recordAttempt('a', T0);
    g.recordAttempt('b', T0 + 1);
    // both are now older than windowMs at T0 + 2000
    expect(g.canRemediate('c', T0 + 2000).allowed).toBe(true);
  });
});

describe('RemediationGuard — precedence + bounds', () => {
  it('depth is checked before cooldown/rate (fail-closed ordering is irrelevant to the verdict)', () => {
    const g = new RemediationGuard({ maxGenerations: 0, cooldownMs: 1000 });
    g.recordAttempt('sig', T0);
    const d = g.canRemediate('sig', T0 + 1, 5);
    expect(d.allowed).toBe(false);
    expect(d.blockReason).toBe('depth');
  });

  it('bounds attempt history to maxHistory', () => {
    const g = new RemediationGuard({ maxHistory: 2, cooldownMs: 0, maxPerWindow: 1000 });
    for (const k of ['a', 'b', 'c']) g.recordAttempt(k, T0);
    // 'a' was evicted, so it is allowed again despite cooldown semantics
    expect(g.canRemediate('a', T0).allowed).toBe(true);
  });

  it('default config mirrors MAX_ISSUES_PER_RUN and is conservative', () => {
    expect(DEFAULT_REMEDIATION_GUARD_CONFIG.maxPerWindow).toBe(5);
    expect(DEFAULT_REMEDIATION_GUARD_CONFIG.maxGenerations).toBeLessThanOrEqual(1);
  });
});

describe('getRemediationGuard', () => {
  it('is a stable process-scoped singleton', () => {
    expect(getRemediationGuard()).toBe(getRemediationGuard());
  });
});
