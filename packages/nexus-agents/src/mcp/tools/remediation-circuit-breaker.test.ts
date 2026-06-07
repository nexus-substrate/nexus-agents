/**
 * Tests for the remediation circuit-breaker (#3653 condition 3).
 * Trips after K consecutive failures; success resets the streak; reset un-trips.
 */

import { describe, it, expect } from 'vitest';
import {
  RemediationCircuitBreaker,
  getRemediationCircuitBreaker,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
} from './remediation-circuit-breaker.js';

describe('RemediationCircuitBreaker', () => {
  it('starts untripped', () => {
    expect(new RemediationCircuitBreaker().isTripped()).toBe(false);
  });

  it('trips after threshold consecutive failures', () => {
    const b = new RemediationCircuitBreaker({ threshold: 3 });
    b.recordFailure();
    b.recordFailure();
    expect(b.isTripped()).toBe(false);
    b.recordFailure();
    expect(b.isTripped()).toBe(true);
    expect(b.state().consecutiveFailures).toBe(3);
  });

  it('a success resets the streak (so non-consecutive failures do not trip)', () => {
    const b = new RemediationCircuitBreaker({ threshold: 3 });
    b.recordFailure();
    b.recordFailure();
    b.recordSuccess(); // streak cleared
    b.recordFailure();
    b.recordFailure();
    expect(b.isTripped()).toBe(false);
  });

  it('record(result) routes to success/failure', () => {
    const b = new RemediationCircuitBreaker({ threshold: 2 });
    b.record('failure');
    b.record('failure');
    expect(b.isTripped()).toBe(true);
  });

  it('reset un-trips and clears the streak (re-vote re-enable)', () => {
    const b = new RemediationCircuitBreaker({ threshold: 1 });
    b.recordFailure();
    expect(b.isTripped()).toBe(true);
    b.reset();
    expect(b.isTripped()).toBe(false);
    expect(b.state().consecutiveFailures).toBe(0);
  });

  it('a success after tripping does NOT auto-un-trip (only reset/re-vote does)', () => {
    const b = new RemediationCircuitBreaker({ threshold: 1 });
    b.recordFailure();
    b.recordSuccess(); // clears streak but the breaker stays tripped
    expect(b.isTripped()).toBe(true);
  });

  it('default threshold is 3', () => {
    expect(DEFAULT_CIRCUIT_BREAKER_CONFIG.threshold).toBe(3);
  });
});

describe('getRemediationCircuitBreaker', () => {
  it('is a stable process singleton', () => {
    expect(getRemediationCircuitBreaker()).toBe(getRemediationCircuitBreaker());
  });
});
