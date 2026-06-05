/**
 * Tests for the improvement_review threshold detectors.
 *
 * (Source: Issue #2402)
 *
 * Pure-function tests for the threshold logic — no fs, no gh CLI calls.
 */

import { describe, it, expect } from 'vitest';
import {
  ImprovementReviewInputSchema,
  filterByLookback,
  detectCliPerformanceFloor,
  detectFailureCategoryConcentration,
  detectFitnessSignals,
  detectConsensusRejectionSignals,
} from './improvement-review.js';
import type { TaskOutcome } from '../../orchestration/outcomes/outcome-types.js';
import type { FitnessAudit } from '../../governance/fitness-score.js';
import type { VoteRejectedSignalEvent } from '../../pipeline/event-types.js';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const NOW = 1_700_000_000_000;

type OutcomeOverrides = Omit<Partial<TaskOutcome>, 'timestamp'> & {
  timestamp?: number | string;
};

function outcome(overrides: OutcomeOverrides = {}): TaskOutcome {
  const ts = overrides.timestamp ?? NOW;
  const isoTs = typeof ts === 'number' ? new Date(ts).toISOString() : ts;
  return {
    id: overrides.id ?? `outcome-${Math.random().toString(36).slice(2, 10)}`,
    cli: overrides.cli ?? 'claude',
    category: overrides.category ?? 'code_generation',
    success: overrides.success ?? true,
    durationMs: overrides.durationMs ?? 100,
    ...overrides,
    timestamp: isoTs,
  } as TaskOutcome;
}

// ============================================================================
// Input schema
// ============================================================================

describe('ImprovementReviewInputSchema', () => {
  it('accepts empty input and applies defaults', () => {
    const result = ImprovementReviewInputSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.lookbackDays).toBe(7);
      expect(result.data.fileIssues).toBe(false);
      expect(result.data.minSampleSize).toBe(5);
      expect(result.data.fitnessFloor).toBe(90);
    }
  });

  it('rejects lookback > 90', () => {
    expect(ImprovementReviewInputSchema.safeParse({ lookbackDays: 100 }).success).toBe(false);
  });

  it('rejects fitnessFloor > 100', () => {
    expect(ImprovementReviewInputSchema.safeParse({ fitnessFloor: 101 }).success).toBe(false);
  });
});

// ============================================================================
// filterByLookback
// ============================================================================

describe('filterByLookback', () => {
  it('keeps outcomes within window', () => {
    const within = outcome({ timestamp: NOW - 3 * DAY_MS });
    const outside = outcome({ timestamp: NOW - 10 * DAY_MS });
    const result = filterByLookback([within, outside], 7, NOW);
    expect(result).toHaveLength(1);
    expect(Date.parse(result[0]?.timestamp ?? '')).toBe(NOW - 3 * DAY_MS);
  });

  it('returns empty when all outcomes are stale', () => {
    const result = filterByLookback([outcome({ timestamp: NOW - 100 * DAY_MS })], 7, NOW);
    expect(result).toHaveLength(0);
  });
});

// ============================================================================
// detectCliPerformanceFloor
// ============================================================================

describe('detectCliPerformanceFloor', () => {
  it('fires critical when CLI success rate < 40% with enough samples', () => {
    const outcomes: TaskOutcome[] = [];
    // 10 samples, 3 successes = 30% success rate → critical band.
    for (let i = 0; i < 3; i++) {
      outcomes.push(outcome({ cli: 'codex', category: 'security_review', success: true }));
    }
    for (let i = 0; i < 7; i++) {
      outcomes.push(outcome({ cli: 'codex', category: 'security_review', success: false }));
    }

    const signals = detectCliPerformanceFloor(outcomes, 5, '7d');
    expect(signals).toHaveLength(1);
    expect(signals[0]?.signalKey).toBe('routing:cli-floor:codex:security_review');
    expect(signals[0]?.severity).toBe('critical');
    expect(signals[0]?.evidence.observedValue).toBeCloseTo(0.3, 5);
  });

  it('does NOT fire when sample size below threshold', () => {
    const outcomes: TaskOutcome[] = [
      outcome({ cli: 'codex', category: 'security_review', success: false }),
      outcome({ cli: 'codex', category: 'security_review', success: false }),
    ];
    expect(detectCliPerformanceFloor(outcomes, 5, '7d')).toHaveLength(0);
  });

  it('does NOT fire when success rate is at or above 60%', () => {
    const outcomes: TaskOutcome[] = [];
    for (let i = 0; i < 3; i++) outcomes.push(outcome({ success: true }));
    for (let i = 0; i < 2; i++) outcomes.push(outcome({ success: false }));
    expect(detectCliPerformanceFloor(outcomes, 5, '7d')).toHaveLength(0);
  });

  it('uses warning severity for 40-60% range, critical for < 40%', () => {
    const warningOutcomes: TaskOutcome[] = [];
    for (let i = 0; i < 5; i++) {
      warningOutcomes.push(outcome({ cli: 'gemini', category: 'documentation', success: i < 2 }));
    }
    const warningSignals = detectCliPerformanceFloor(warningOutcomes, 5, '7d');
    expect(warningSignals[0]?.severity).toBe('warning');

    const criticalOutcomes: TaskOutcome[] = [];
    for (let i = 0; i < 10; i++) {
      criticalOutcomes.push(outcome({ cli: 'gemini', category: 'documentation', success: i < 2 }));
    }
    const criticalSignals = detectCliPerformanceFloor(criticalOutcomes, 5, '7d');
    expect(criticalSignals[0]?.severity).toBe('critical');
  });

  it('separates by CLI × category buckets', () => {
    const outcomes: TaskOutcome[] = [];
    // claude on architecture: 0% success, 5 samples
    for (let i = 0; i < 5; i++) {
      outcomes.push(outcome({ cli: 'claude', category: 'architecture', success: false }));
    }
    // gemini on architecture: 100%, 5 samples
    for (let i = 0; i < 5; i++) {
      outcomes.push(outcome({ cli: 'gemini', category: 'architecture', success: true }));
    }

    const signals = detectCliPerformanceFloor(outcomes, 5, '7d');
    expect(signals).toHaveLength(1);
    expect(signals[0]?.signalKey).toContain('claude');
    expect(signals[0]?.signalKey).not.toContain('gemini');
  });
});

// ============================================================================
// detectFailureCategoryConcentration
// ============================================================================

describe('detectFailureCategoryConcentration', () => {
  it('fires when one category > 50% of failures with ≥10 failures', () => {
    const outcomes: TaskOutcome[] = [];
    // 11 failures, 7 with 'rate_limit', 4 with 'execution'.
    for (let i = 0; i < 7; i++) {
      outcomes.push(outcome({ success: false, failureCategory: 'rate_limit' }));
    }
    for (let i = 0; i < 4; i++) {
      outcomes.push(outcome({ success: false, failureCategory: 'execution' }));
    }

    const signals = detectFailureCategoryConcentration(outcomes, '7d');
    expect(signals).toHaveLength(1);
    expect(signals[0]?.signalKey).toBe('bug:failure-concentration:rate_limit');
  });

  it('does NOT fire below 10 failures', () => {
    const outcomes: TaskOutcome[] = [];
    for (let i = 0; i < 8; i++) {
      outcomes.push(outcome({ success: false, failureCategory: 'rate_limit' }));
    }
    expect(detectFailureCategoryConcentration(outcomes, '7d')).toHaveLength(0);
  });

  it('does NOT fire when concentration is at or below 50%', () => {
    const outcomes: TaskOutcome[] = [];
    for (let i = 0; i < 5; i++) {
      outcomes.push(outcome({ success: false, failureCategory: 'rate_limit' }));
    }
    for (let i = 0; i < 5; i++) {
      outcomes.push(outcome({ success: false, failureCategory: 'execution' }));
    }
    expect(detectFailureCategoryConcentration(outcomes, '7d')).toHaveLength(0);
  });

  it('classifies undefined failureCategory as "unknown"', () => {
    const outcomes: TaskOutcome[] = [];
    for (let i = 0; i < 11; i++) {
      outcomes.push(outcome({ success: false, failureCategory: undefined }));
    }
    const signals = detectFailureCategoryConcentration(outcomes, '7d');
    expect(signals[0]?.signalKey).toBe('bug:failure-concentration:unknown');
  });
});

// ============================================================================
// detectFitnessSignals
// ============================================================================

describe('detectFitnessSignals', () => {
  function makeAudit(overrides: Partial<FitnessAudit>): FitnessAudit {
    return {
      score: overrides.score ?? 100,
      dimensions: overrides.dimensions ?? ({} as FitnessAudit['dimensions']),
      findings: overrides.findings ?? [],
      timestamp: overrides.timestamp ?? new Date(NOW).toISOString(),
      version: overrides.version ?? 'test',
    };
  }

  it('fires when score below floor', () => {
    const audit = makeAudit({ score: 85 });
    const signals = detectFitnessSignals(audit, 90);
    expect(signals.some((s) => s.signalKey === 'tech-debt:fitness-below-floor')).toBe(true);
  });

  it('does NOT fire when score at or above floor', () => {
    const audit = makeAudit({ score: 90 });
    const signals = detectFitnessSignals(audit, 90);
    expect(signals.some((s) => s.signalKey === 'tech-debt:fitness-below-floor')).toBe(false);
  });

  it('uses critical severity when score below 70', () => {
    const audit = makeAudit({ score: 65 });
    const signals = detectFitnessSignals(audit, 90);
    const floorSig = signals.find((s) => s.signalKey === 'tech-debt:fitness-below-floor');
    expect(floorSig?.severity).toBe('critical');
  });

  it('fires per-finding for each critical finding', () => {
    const audit = makeAudit({
      score: 95,
      findings: [
        {
          dimension: 'layerSeparation',
          severity: 'critical',
          description: 'Layer violation in adapters/',
          pointsDeducted: 5,
        },
        {
          dimension: 'configSimplicity',
          severity: 'warning',
          description: '16 schemas vs target ≤10',
          pointsDeducted: 2,
        },
      ],
    });
    const signals = detectFitnessSignals(audit, 90);
    const criticalFindings = signals.filter((s) =>
      s.signalKey.startsWith('tech-debt:fitness-critical:')
    );
    expect(criticalFindings).toHaveLength(1);
    expect(criticalFindings[0]?.signalKey).toBe('tech-debt:fitness-critical:layerSeparation');
  });
});

// ============================================================================
// detectConsensusRejectionSignals (#3259)
// ============================================================================

function rejection(over: Partial<VoteRejectedSignalEvent> = {}): VoteRejectedSignalEvent {
  return {
    type: 'signal.vote_rejected',
    timestamp: NOW,
    proposalId: over.proposalId ?? `prop-${Math.random().toString(36).slice(2, 8)}`,
    approvalPercentage: over.approvalPercentage ?? 33,
    ...over,
  };
}

describe('detectConsensusRejectionSignals', () => {
  it('returns no signals for an empty event list', () => {
    expect(detectConsensusRejectionSignals([], '7d')).toHaveLength(0);
  });

  it('does not fire below the recurrence threshold (≥3 rejections sharing a rule)', () => {
    const events = [
      rejection({ rejectionRules: ['DRY_VIOLATION'] }),
      rejection({ rejectionRules: ['DRY_VIOLATION'] }),
    ];
    expect(detectConsensusRejectionSignals(events, '7d')).toHaveLength(0);
  });

  it('fires a consensus signal when one rule recurs across ≥3 rejected plans', () => {
    const events = [
      rejection({ rejectionRules: ['OVER_ENGINEERING'] }),
      rejection({ rejectionRules: ['OVER_ENGINEERING', 'SCOPE_CREEP'] }),
      rejection({ rejectionRules: ['OVER_ENGINEERING'] }),
    ];
    const signals = detectConsensusRejectionSignals(events, '7d');
    const overEng = signals.find(
      (s) => s.signalKey === 'consensus:rejection-pattern:OVER_ENGINEERING'
    );
    expect(overEng).toBeDefined();
    expect(overEng?.category).toBe('consensus');
    expect(overEng?.evidence.samples).toBe(3);
    // SCOPE_CREEP appeared only once → below threshold → no signal.
    expect(signals.some((s) => s.signalKey.endsWith('SCOPE_CREEP'))).toBe(false);
  });

  it('escalates severity from info to warning at 2× the threshold', () => {
    const six = Array.from({ length: 6 }, () => rejection({ rejectionRules: ['DRY_VIOLATION'] }));
    const three = Array.from({ length: 3 }, () => rejection({ rejectionRules: ['DRY_VIOLATION'] }));
    expect(detectConsensusRejectionSignals(six, '7d')[0]?.severity).toBe('warning');
    expect(detectConsensusRejectionSignals(three, '7d')[0]?.severity).toBe('info');
  });

  it('ignores events with no rejectionRules (un-categorized rejections)', () => {
    const events = [rejection({}), rejection({}), rejection({})];
    expect(detectConsensusRejectionSignals(events, '7d')).toHaveLength(0);
  });

  it('drops rules outside the ADR-0016 allowlist (defense-in-depth)', () => {
    // A poisoned/free-form rule that is NOT one of the 7 canonical categories
    // must never reach a signal (and thus never an issue title/body).
    const events = Array.from({ length: 4 }, () =>
      rejection({ rejectionRules: ['NOT_A_REAL_RULE; rm -rf'] })
    );
    expect(detectConsensusRejectionSignals(events, '7d')).toHaveLength(0);
  });
});
