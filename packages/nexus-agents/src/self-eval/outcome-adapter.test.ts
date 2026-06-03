/**
 * Tests for the self-eval -> TaskOutcome adapter.
 * (Source: Issues #3219, #3235, #3241)
 */

import { describe, it, expect } from 'vitest';
import {
  aggregatedResultToOutcome,
  selfEvalOutcomeId,
  SELF_EVAL_MARKER,
} from './outcome-adapter.js';
import { TaskOutcomeSchema } from '../orchestration/outcomes/outcome-types.js';
import type { AggregatedResult } from './aggregation-logic.js';
import type { Recommendation } from './evaluation-agents.js';

function makeResult(overrides: Partial<AggregatedResult> = {}): AggregatedResult {
  return {
    component: 'src/foo/bar.ts',
    finalRecommendation: 'retain',
    confidence: 0.8,
    votes: [],
    dissent: [],
    auditTrail: [],
    evidenceQuality: 0.5,
    isRecommendation: true,
    timestamp: new Date('2026-06-03T00:00:00.000Z'),
    ...overrides,
  };
}

describe('selfEvalOutcomeId', () => {
  it('derives a stable id from the component path', () => {
    expect(selfEvalOutcomeId('src/foo/bar.ts')).toBe('self-eval-src/foo/bar.ts');
  });

  it('is deterministic across calls (re-run upsert semantics)', () => {
    expect(selfEvalOutcomeId('src/a.ts')).toBe(selfEvalOutcomeId('src/a.ts'));
  });

  it('sanitizes unexpected characters', () => {
    expect(selfEvalOutcomeId('src/weird name!.ts')).toBe('self-eval-src/weird_name_.ts');
  });
});

describe('aggregatedResultToOutcome', () => {
  it('maps retain -> success=true with no error note', () => {
    const outcome = aggregatedResultToOutcome(makeResult({ finalRecommendation: 'retain' }));
    expect(outcome.success).toBe(true);
    expect(outcome.errorMessage).toBeUndefined();
  });

  it.each<Recommendation>(['review', 'refactor', 'deprecate'])(
    'maps %s -> success=false and carries the recommendation as a note',
    (rec) => {
      const outcome = aggregatedResultToOutcome(makeResult({ finalRecommendation: rec }));
      expect(outcome.success).toBe(false);
      expect(outcome.errorMessage).toContain(rec);
    }
  );

  it('carries the recommendation + marker in qualitySignals', () => {
    const outcome = aggregatedResultToOutcome(makeResult({ finalRecommendation: 'refactor' }));
    expect(outcome.qualitySignals).toContain(SELF_EVAL_MARKER);
    expect(outcome.qualitySignals).toContain('recommendation:refactor');
  });

  it('derives a stable id from the component path', () => {
    const outcome = aggregatedResultToOutcome(makeResult({ component: 'src/x.ts' }));
    expect(outcome.id).toBe('self-eval-src/x.ts');
  });

  it('produces a schema-valid TaskOutcome', () => {
    const outcome = aggregatedResultToOutcome(makeResult());
    expect(() => TaskOutcomeSchema.parse(outcome)).not.toThrow();
  });

  it('uses the aggregation timestamp as an ISO string', () => {
    const outcome = aggregatedResultToOutcome(
      makeResult({ timestamp: new Date('2026-06-03T00:00:00.000Z') })
    );
    expect(outcome.timestamp).toBe('2026-06-03T00:00:00.000Z');
  });
});
