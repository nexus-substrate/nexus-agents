/**
 * Tests for LinUCB warm-start from persisted outcomes (Issue #1015).
 *
 * Verifies that warmStart() replays historical outcomes to reconstruct
 * arm weights, giving the bandit a head start on restart.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LinUCBBandit } from './linucb-bandit.js';
import type { TaskOutcome } from '../orchestration/outcomes/outcome-types.js';

const ARM_NAMES = ['claude', 'gemini', 'codex'] as const;

function makeOutcome(overrides?: Partial<TaskOutcome>): TaskOutcome {
  return {
    id: `out-${String(Date.now())}`,
    cli: 'claude',
    category: 'code_generation',
    model: 'claude-sonnet-4-5',
    success: true,
    durationMs: 1200,
    timestamp: '2026-02-13T10:00:00Z',
    source: 'delegate',
    ...overrides,
  };
}

describe('LinUCBBandit.warmStart()', () => {
  let bandit: LinUCBBandit;

  beforeEach(() => {
    bandit = new LinUCBBandit(ARM_NAMES);
  });

  it('returns 0 for empty outcomes array', () => {
    const replayed = bandit.warmStart([]);
    expect(replayed).toBe(0);
  });

  it('replays outcomes for known arms', () => {
    const outcomes = [
      makeOutcome({ cli: 'claude', success: true }),
      makeOutcome({ cli: 'gemini', success: false }),
      makeOutcome({ cli: 'codex', success: true }),
    ];

    const replayed = bandit.warmStart(outcomes);
    expect(replayed).toBe(3);
  });

  it('skips outcomes for unknown CLIs', () => {
    const outcomes = [
      makeOutcome({ cli: 'claude', success: true }),
      // 'unknown' is not a valid CLI in the arm names, but we cast for testing
      { ...makeOutcome(), cli: 'unknown' as TaskOutcome['cli'] },
    ];

    const replayed = bandit.warmStart(outcomes);
    expect(replayed).toBe(1);
  });

  it('updates arm pull counts after warm-start', () => {
    const outcomes = [
      makeOutcome({ cli: 'claude', success: true }),
      makeOutcome({ cli: 'claude', success: true }),
      makeOutcome({ cli: 'claude', success: false }),
      makeOutcome({ cli: 'gemini', success: true }),
    ];

    bandit.warmStart(outcomes);

    const stats = bandit.getStats();
    const totalPulls = stats.reduce((sum, s) => sum + s.pullCount, 0);
    expect(totalPulls).toBe(4);
    // Claude should have 3 pulls, gemini 1
    const claudeArm = stats.find((s) => s.name === 'claude');
    const geminiArm = stats.find((s) => s.name === 'gemini');
    expect(claudeArm?.pullCount).toBe(3);
    expect(geminiArm?.pullCount).toBe(1);
  });

  it('produces different arm weights than cold-start', () => {
    // Cold-start — all arms have 0 pulls
    const coldBandit = new LinUCBBandit(ARM_NAMES);
    const coldStats = coldBandit.getStats();
    const coldClaudePulls = coldStats.find((s) => s.name === 'claude')?.pullCount ?? 0;
    expect(coldClaudePulls).toBe(0);

    // Warm-started — claude arm has learned weights
    const warmBandit = new LinUCBBandit(ARM_NAMES);
    const outcomes = Array.from({ length: 20 }, () =>
      makeOutcome({ cli: 'claude', success: true })
    );
    warmBandit.warmStart(outcomes);
    const warmStats = warmBandit.getStats();
    const warmClaudePulls = warmStats.find((s) => s.name === 'claude')?.pullCount ?? 0;

    // Warm bandit should have pulls from warm-start
    expect(warmClaudePulls).toBe(20);
    expect(warmClaudePulls).toBeGreaterThan(coldClaudePulls);
  });

  it('assigns lower reward for failed outcomes', () => {
    const failBandit = new LinUCBBandit(ARM_NAMES);
    const failOutcomes = Array.from({ length: 10 }, () =>
      makeOutcome({ cli: 'claude', success: false })
    );
    failBandit.warmStart(failOutcomes);

    const successBandit = new LinUCBBandit(ARM_NAMES);
    const successOutcomes = Array.from({ length: 10 }, () =>
      makeOutcome({ cli: 'claude', success: true })
    );
    successBandit.warmStart(successOutcomes);

    // Compare avg rewards — success bandit should have higher avg for claude
    const failStats = failBandit.getStats();
    const successStats = successBandit.getStats();
    const failClaudeAvg = failStats.find((s) => s.name === 'claude')?.avgReward ?? 0;
    const successClaudeAvg = successStats.find((s) => s.name === 'claude')?.avgReward ?? 0;

    // Success outcomes use reward=0.7, failure uses reward=0.1
    expect(successClaudeAvg).toBeGreaterThan(failClaudeAvg);
    expect(successClaudeAvg).toBeCloseTo(0.7, 1);
    expect(failClaudeAvg).toBeCloseTo(0.1, 1);
  });

  it('handles mixed CLIs across many outcomes', () => {
    const outcomes = [
      ...Array.from({ length: 5 }, () => makeOutcome({ cli: 'claude', success: true })),
      ...Array.from({ length: 3 }, () => makeOutcome({ cli: 'gemini', success: true })),
      ...Array.from({ length: 2 }, () => makeOutcome({ cli: 'codex', success: false })),
    ];

    const replayed = bandit.warmStart(outcomes);
    expect(replayed).toBe(10);

    const stats = bandit.getStats();
    const totalPulls = stats.reduce((sum, s) => sum + s.pullCount, 0);
    expect(totalPulls).toBe(10);
  });
});
