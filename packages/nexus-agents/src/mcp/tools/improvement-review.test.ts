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
  detectFitnessDimensionSignals,
  detectConsensusRejectionSignals,
  issueLabelsForSignal,
} from './improvement-review.js';
import { FITNESS_DIMENSION_MAX } from '../../governance/fitness-score.js';
import type { FitnessFinding } from '../../governance/fitness-score.js';
import type { ImprovementSignal } from './improvement-review.js';
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

  it('excludes unattributed-model outcomes from the floor (#3624)', () => {
    // 8 outcomes all failing, but model='expert' (placeholder — can't attribute a
    // real executing CLI). The floor must not fire on fabricated attribution.
    const outcomes: TaskOutcome[] = [];
    for (let i = 0; i < 8; i++) {
      outcomes.push(
        outcome({ cli: 'claude', category: 'security_review', success: false, model: 'expert' })
      );
    }
    expect(detectCliPerformanceFloor(outcomes, 5, '30d')).toHaveLength(0);
  });

  it('excludes infra/transport failures from the quality rate (#3620)', () => {
    // 3 successes + 7 infra failures (adapter_unavailable/parse). Raw rate = 30%
    // (would fire critical), but quality rate = 3/3 = 100% → no signal.
    const outcomes: TaskOutcome[] = [];
    for (let i = 0; i < 3; i++) {
      outcomes.push(outcome({ cli: 'claude', category: 'security_review', success: true }));
    }
    for (let i = 0; i < 4; i++) {
      outcomes.push(
        outcome({
          cli: 'claude',
          category: 'security_review',
          success: false,
          failureCategory: 'adapter_unavailable',
        })
      );
    }
    for (let i = 0; i < 3; i++) {
      outcomes.push(
        outcome({
          cli: 'claude',
          category: 'security_review',
          success: false,
          failureCategory: 'parse',
        })
      );
    }
    expect(detectCliPerformanceFloor(outcomes, 5, '30d')).toHaveLength(0);
  });

  it('still fires on genuine model-quality failures, excluding only infra (#3620)', () => {
    // 2 successes + 6 execution (quality) failures + 4 adapter_unavailable (infra).
    // Quality rate = 2/8 = 25% (< 40% → critical); infra excluded but noted.
    const outcomes: TaskOutcome[] = [];
    for (let i = 0; i < 2; i++) {
      outcomes.push(outcome({ cli: 'codex', category: 'code_review', success: true }));
    }
    for (let i = 0; i < 6; i++) {
      outcomes.push(
        outcome({
          cli: 'codex',
          category: 'code_review',
          success: false,
          failureCategory: 'execution',
        })
      );
    }
    for (let i = 0; i < 4; i++) {
      outcomes.push(
        outcome({
          cli: 'codex',
          category: 'code_review',
          success: false,
          failureCategory: 'rate_limit',
        })
      );
    }
    const signals = detectCliPerformanceFloor(outcomes, 5, '30d');
    expect(signals).toHaveLength(1);
    expect(signals[0]?.severity).toBe('critical');
    expect(signals[0]?.evidence.observedValue).toBeCloseTo(0.25, 5);
    expect(signals[0]?.body).toContain('4 infra/transport failures excluded');
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
      ...(overrides.auditable !== undefined ? { auditable: overrides.auditable } : {}),
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

  // #3621: the not-source-repo sentinel (auditable:false, score 0) is "could not
  // audit", not "fitness is low" — it must NOT emit a spurious below-floor signal.
  it('does NOT fire for a non-auditable result even at score 0', () => {
    const audit = makeAudit({
      score: 0,
      auditable: false,
      findings: [
        {
          dimension: 'governanceIntegration',
          severity: 'info',
          description: 'not source repo',
          pointsDeducted: 0,
        },
      ],
    });
    const signals = detectFitnessSignals(audit, 90);
    expect(signals).toEqual([]);
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
// detectFitnessDimensionSignals — per-dimension fitness-remediation (#3227)
// ============================================================================

describe('detectFitnessDimensionSignals (#3227)', () => {
  /** All dimensions at max by default; override only the ones a test cares about. */
  function fullDimensions(
    overrides: Partial<Record<keyof typeof FITNESS_DIMENSION_MAX, number>> = {}
  ): FitnessAudit['dimensions'] {
    return { ...FITNESS_DIMENSION_MAX, ...overrides };
  }

  function dimAudit(
    dimensions: FitnessAudit['dimensions'],
    findings: readonly FitnessFinding[] = []
  ): FitnessAudit {
    return {
      score: 100,
      dimensions,
      findings,
      timestamp: new Date(NOW).toISOString(),
      version: 'test',
    };
  }

  const finding = (over: Partial<FitnessFinding> & Pick<FitnessFinding, 'dimension'>): FitnessFinding => ({
    severity: 'warning',
    description: 'desc',
    pointsDeducted: 1,
    ...over,
  });

  it('emits exactly ONE aggregated signal for a dimension at 12/20 (< 0.6×20=12 is false, so just under)', () => {
    // operatorErgonomics max 10, target 6 — at 5/10 it is below target.
    const audit = dimAudit(fullDimensions({ operatorErgonomics: 5 }), [
      finding({ dimension: 'operatorErgonomics', description: 'missing doctor' }),
    ]);
    const signals = detectFitnessDimensionSignals(audit);
    expect(signals).toHaveLength(1);
    expect(signals[0]?.signalKey).toMatch(/^tech-debt:fitness-dimension:operatorErgonomics:/);
  });

  it('boundary: canonicalPaths at exactly 12/20 (= 0.6×20) is on-target → emits NOTHING (exclusive)', () => {
    const audit = dimAudit(fullDimensions({ canonicalPaths: 12 }));
    expect(detectFitnessDimensionSignals(audit)).toEqual([]);
  });

  it('boundary: canonicalPaths just below target at 11/20 → emits ONE signal', () => {
    const audit = dimAudit(fullDimensions({ canonicalPaths: 11 }));
    const signals = detectFitnessDimensionSignals(audit);
    expect(signals).toHaveLength(1);
    expect(signals[0]?.signalKey).toMatch(/^tech-debt:fitness-dimension:canonicalPaths:/);
  });

  it('a dimension at 16/20 (≥ target) emits nothing', () => {
    const audit = dimAudit(fullDimensions({ canonicalPaths: 16 }));
    expect(detectFitnessDimensionSignals(audit)).toEqual([]);
  });

  it('top-3 cap: with 5 below-target dimensions only the 3 worst emit', () => {
    // points-below-target (target − score): the 3 worst should win.
    const audit = dimAudit(
      fullDimensions({
        canonicalPaths: 2, // target 12 → 10 below  (worst)
        explicitBehavior: 2, // target 9  → 7 below
        determinism: 3, // target 9  → 6 below
        observability: 5, // target 9  → 4 below
        configSimplicity: 5, // target 6  → 1 below  (least)
      })
    );
    const signals = detectFitnessDimensionSignals(audit);
    expect(signals).toHaveLength(3);
    const dims = signals.map((s) => s.signalKey.split(':')[2]);
    expect(dims).toEqual(['canonicalPaths', 'explicitBehavior', 'determinism']);
  });

  it('aggregation: a dimension with 3 findings → 1 signal carrying all 3', () => {
    const audit = dimAudit(fullDimensions({ determinism: 3 }), [
      finding({ dimension: 'determinism', description: 'finding A' }),
      finding({ dimension: 'determinism', description: 'finding B' }),
      finding({ dimension: 'determinism', description: 'finding C' }),
    ]);
    const signals = detectFitnessDimensionSignals(audit);
    expect(signals).toHaveLength(1);
    expect(signals[0]?.body).toContain('Findings in this dimension: 3');
    expect(signals[0]?.body).toContain('finding A');
    expect(signals[0]?.body).toContain('finding B');
    expect(signals[0]?.body).toContain('finding C');
  });

  it('dedup: an identical audit across two runs yields the SAME stable signalKey', () => {
    const make = (): FitnessAudit =>
      dimAudit(fullDimensions({ determinism: 3 }), [
        finding({ dimension: 'determinism', description: 'unseeded Math.random' }),
      ]);
    const keyA = detectFitnessDimensionSignals(make())[0]?.signalKey;
    const keyB = detectFitnessDimensionSignals(make())[0]?.signalKey;
    expect(keyA).toBeDefined();
    expect(keyA).toBe(keyB);
  });

  it('dedup key CHANGES when the dimension findings change (re-emit on real change)', () => {
    const a = detectFitnessDimensionSignals(
      dimAudit(fullDimensions({ determinism: 3 }), [
        finding({ dimension: 'determinism', description: 'finding X' }),
      ])
    )[0]?.signalKey;
    const b = detectFitnessDimensionSignals(
      dimAudit(fullDimensions({ determinism: 3 }), [
        finding({ dimension: 'determinism', description: 'finding Y' }),
      ])
    )[0]?.signalKey;
    expect(a).not.toBe(b);
  });

  it('determinism: same input → identical signal set + stable ordering', () => {
    const audit = dimAudit(
      fullDimensions({ canonicalPaths: 2, explicitBehavior: 3, determinism: 4 })
    );
    const run1 = detectFitnessDimensionSignals(audit);
    const run2 = detectFitnessDimensionSignals(audit);
    expect(run1.map((s) => s.signalKey)).toEqual(run2.map((s) => s.signalKey));
  });

  it('does NOT fire for a non-auditable result', () => {
    const audit: FitnessAudit = {
      ...dimAudit(fullDimensions({ canonicalPaths: 2 })),
      score: 0,
      auditable: false,
    };
    expect(detectFitnessDimensionSignals(audit)).toEqual([]);
  });

  it('ignores a finding whose dimension is not in the known closed set (findings-as-data)', () => {
    const poisoned = {
      dimension: 'evilInjected' as keyof typeof FITNESS_DIMENSION_MAX,
      severity: 'warning' as const,
      description: 'rm -rf /',
      pointsDeducted: 1,
    };
    const audit = dimAudit(fullDimensions({ determinism: 3 }), [poisoned]);
    const signals = detectFitnessDimensionSignals(audit);
    // determinism is below target and emits, but the poisoned finding is dropped:
    expect(signals).toHaveLength(1);
    expect(signals[0]?.body).not.toContain('rm -rf');
  });

  it('cross-reference with floor: a single critical finding does not produce two redundant remediations at the same key', () => {
    // determinism below target with a critical finding. detectFitnessSignals
    // emits: a floor signal (aggregate), a fitness-critical signal, AND a
    // dimension signal. The dimension signal's key is distinct from the
    // critical-finding key, and the floor signal addresses the aggregate score —
    // they are complementary, not the same remediation at the same key.
    const audit: FitnessAudit = {
      ...dimAudit(fullDimensions({ determinism: 3 }), [
        finding({ dimension: 'determinism', severity: 'critical', description: 'crit' }),
      ]),
      score: 80,
    };
    const signals = detectFitnessSignals(audit, 90);
    const keys = signals.map((s) => s.signalKey);
    expect(keys).toContain('tech-debt:fitness-below-floor');
    expect(keys).toContain('tech-debt:fitness-critical:determinism');
    const dimKeys = keys.filter((k) => k.startsWith('tech-debt:fitness-dimension:determinism:'));
    expect(dimKeys).toHaveLength(1);
    // No two signals share a signalKey → no duplicate remediation at one key.
    expect(new Set(keys).size).toBe(keys.length);
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

// ============================================================================
// issueLabelsForSignal — p0–p4 priority labeling on auto-filed issues (#3653)
// ============================================================================

describe('issueLabelsForSignal', () => {
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

  it('labels a security signal p0 + security', () => {
    expect(issueLabelsForSignal(sig({ category: 'security', signalKey: 'sec-1' }))).toEqual([
      'p0',
      'security',
    ]);
  });

  it('labels a keyword-detected security signal p0 (fail-closed), keeping its category', () => {
    expect(
      issueLabelsForSignal(sig({ category: 'bug', title: 'auth bypass / injection' }))
    ).toEqual(['p0', 'bug']);
  });

  it('labels a critical non-security signal p0', () => {
    expect(issueLabelsForSignal(sig({ severity: 'critical' }))).toEqual(['p0', 'routing']);
  });

  it('labels warning → p2 and info → p3', () => {
    expect(issueLabelsForSignal(sig({ severity: 'warning' }))).toEqual(['p2', 'routing']);
    expect(issueLabelsForSignal(sig({ severity: 'info', category: 'tech-debt' }))).toEqual([
      'p3',
      'tech-debt',
    ]);
  });
});
