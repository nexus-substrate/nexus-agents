/**
 * Tests for Goodhart-resistant remediation outcome feedback (#3540 inc.2f / #3616).
 * success ≡ human-merge + fitness-recovery; premature/bot/unmerged never count.
 */

import { describe, it, expect } from 'vitest';
import {
  assessRemediationOutcome,
  DEFAULT_REMEDIATION_OUTCOME_CONFIG,
  type RemediationOutcomeInput,
} from './improvement-remediation-outcome.js';

function input(over: Partial<RemediationOutcomeInput> = {}): RemediationOutcomeInput {
  return {
    signalKey: 'tech-debt:fitness-below-floor',
    prMerged: true,
    mergedByHuman: true,
    fitnessBefore: 80,
    fitnessAfter: 92,
    attributionWindowElapsed: true,
    concurrentMerges: 0,
    ...over,
  };
}

describe('assessRemediationOutcome', () => {
  it('counts human-merge + fitness recovery as a high-confidence success', () => {
    const r = assessRemediationOutcome(input());
    expect(r.success).toBe(true);
    expect(r.confidence).toBe('high');
    expect(r.recordable).toBe(true);
    expect(r.fitnessDelta).toBe(12);
  });

  it('never records "PR opened"/unmerged as success — pending + not recordable', () => {
    const r = assessRemediationOutcome(input({ prMerged: false }));
    expect(r.success).toBe(false);
    expect(r.confidence).toBe('pending');
    expect(r.recordable).toBe(false);
  });

  it('is pending while the attribution window is still open', () => {
    const r = assessRemediationOutcome(input({ attributionWindowElapsed: false }));
    expect(r.confidence).toBe('pending');
    expect(r.recordable).toBe(false);
  });

  it('does NOT count a bot/auto-merge as success (Goodhart guard)', () => {
    const r = assessRemediationOutcome(input({ mergedByHuman: false }));
    expect(r.success).toBe(false);
    expect(r.confidence).toBe('high');
    expect(r.recordable).toBe(true); // it's a definitive non-success, worth recording
    expect(r.reason).toMatch(/without human validation/);
  });

  it('marks recovery low-confidence when confounded by concurrent merges', () => {
    const r = assessRemediationOutcome(input({ concurrentMerges: 2 }));
    expect(r.success).toBe(true);
    expect(r.confidence).toBe('low');
    expect(r.reason).toMatch(/confounded by 2 concurrent/);
  });

  it('human-merge without fitness recovery is a recorded non-success', () => {
    const r = assessRemediationOutcome(input({ fitnessBefore: 90, fitnessAfter: 90 }));
    expect(r.success).toBe(false);
    expect(r.confidence).toBe('high');
    expect(r.recordable).toBe(true);
    expect(r.reason).toMatch(/did not recover/);
  });

  it('honors minFitnessDelta — a sub-threshold gain is not a recovery', () => {
    const r = assessRemediationOutcome(input({ fitnessBefore: 90, fitnessAfter: 90.5 }), {
      ...DEFAULT_REMEDIATION_OUTCOME_CONFIG,
      minFitnessDelta: 1,
    });
    expect(r.success).toBe(false);
  });

  it('default minFitnessDelta requires a real (>=1) recovery', () => {
    expect(DEFAULT_REMEDIATION_OUTCOME_CONFIG.minFitnessDelta).toBeGreaterThanOrEqual(1);
  });
});
