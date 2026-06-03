/**
 * End-to-end integration test for the self-eval → OutcomeStore →
 * improvement_review signal flow (#3244).
 *
 * Existing self-eval / improvement-review tests are unit-only and mock the
 * store. This test exercises the REAL wiring landed in #3219: a self-eval
 * `AggregatedResult` is converted by {@link aggregatedResultToOutcome}, appended
 * to the live {@link getOutcomeStore} singleton, and then read back by
 * {@link runImprovementReview} (which calls `getOutcomeStore().query()` directly,
 * not a mock). The meaningful assertion proves the self-eval signal genuinely
 * affects `runImprovementReview` output: a panel of failing (`deprecate`/
 * `refactor`) self-eval outcomes on `claude::code_review` drives the success
 * rate below the 60% performance floor, which makes `detectCliPerformanceFloor`
 * emit a `routing` signal naming the `code_review` category — and that signal is
 * absent when only `retain` (success) outcomes are present.
 *
 * @module self-eval/self-eval-integration.test
 * (Source: Issue #3244 — close the eval→log→review loop integration gap)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { AggregatedResult } from './aggregation-logic.js';
import type { Recommendation } from './evaluation-agents.js';
import {
  aggregatedResultToOutcome,
  selfEvalOutcomeId,
  SELF_EVAL_MARKER,
} from './outcome-adapter.js';
import { getOutcomeStore, resetOutcomeStore } from '../orchestration/outcomes/outcome-store.js';
import {
  runImprovementReview,
  type ImprovementReviewInput,
} from '../mcp/tools/improvement-review.js';
import { createLogger } from '../core/index.js';

/**
 * Build a minimal-but-realistic self-eval `AggregatedResult`. Only the fields
 * read by `aggregatedResultToOutcome` (component, finalRecommendation,
 * confidence, evidenceQuality, timestamp) carry meaning; votes/dissent/audit
 * are intentionally empty — the adapter never inspects them, and we don't need
 * to run the real scanner/evaluator to validate the wiring.
 */
function makeResult(
  component: string,
  finalRecommendation: Recommendation,
  timestamp: Date
): AggregatedResult {
  return {
    component,
    finalRecommendation,
    confidence: 0.9,
    votes: [],
    dissent: [],
    auditTrail: [],
    evidenceQuality: 0.85,
    isRecommendation: true,
    timestamp,
  };
}

/** Append a list of self-eval results to the live OutcomeStore via the adapter. */
function appendSelfEvalResults(results: readonly AggregatedResult[]): void {
  const store = getOutcomeStore();
  for (const result of results) {
    store.append(aggregatedResultToOutcome(result));
  }
}

/** Minimal valid improvement-review input. minSampleSize lowered so a small,
 * deterministic panel can trip the CLI performance floor. */
const REVIEW_INPUT: ImprovementReviewInput = {
  lookbackDays: 7,
  fileIssues: false,
  minSampleSize: 5,
  fitnessFloor: 90,
};

const logger = createLogger({ component: 'self-eval-integration-test' });

describe('self-eval → OutcomeStore → improvement_review integration (#3244)', () => {
  beforeEach(() => {
    resetOutcomeStore();
  });

  afterEach(() => {
    resetOutcomeStore();
  });

  it('routes self-eval outcomes into the OutcomeStore with the self-eval marker', () => {
    const now = new Date();
    appendSelfEvalResults([
      makeResult('src/foo.ts', 'deprecate', now),
      makeResult('src/bar.ts', 'retain', now),
    ]);

    const stored = getOutcomeStore().query();
    expect(stored).toHaveLength(2);

    // Every self-eval outcome carries the marker + the code_review category,
    // proving the adapter's mapping survived the round-trip through the store.
    for (const outcome of stored) {
      expect(outcome.category).toBe('code_review');
      expect(outcome.cli).toBe('claude');
      expect(outcome.source).toBe('manual');
      expect(outcome.qualitySignals ?? []).toContain(SELF_EVAL_MARKER);
    }

    // deprecate → failure (errorMessage note); retain → success.
    const deprecate = stored.find((o) => o.id === selfEvalOutcomeId('src/foo.ts'));
    const retain = stored.find((o) => o.id === selfEvalOutcomeId('src/bar.ts'));
    expect(deprecate?.success).toBe(false);
    expect(deprecate?.errorMessage).toContain('deprecate');
    expect(retain?.success).toBe(true);
  });

  it('failing self-eval outcomes drive a routing signal in runImprovementReview output', async () => {
    const now = new Date();
    // 5 failing (deprecate/refactor) + 1 retain on claude::code_review →
    // success rate 1/6 ≈ 17% < 60% floor with ≥5 samples → routing signal.
    appendSelfEvalResults([
      makeResult('src/a.ts', 'deprecate', now),
      makeResult('src/b.ts', 'refactor', now),
      makeResult('src/c.ts', 'deprecate', now),
      makeResult('src/d.ts', 'refactor', now),
      makeResult('src/e.ts', 'deprecate', now),
      makeResult('src/f.ts', 'retain', now),
    ]);

    const response = await runImprovementReview(REVIEW_INPUT, { logger });

    // The store data flowed through: all 6 self-eval outcomes counted.
    expect(response.totalOutcomes).toBe(6);

    // The MEANINGFUL assertion: the failing self-eval panel produced a routing
    // signal naming the code_review category — this only exists because the
    // self-eval outcomes reached runImprovementReview via the real store.
    const routingSignal = response.signals.find(
      (s) => s.category === 'routing' && s.signalKey.includes('code_review')
    );
    expect(routingSignal).toBeDefined();
    expect(routingSignal?.title).toContain('code_review');
    expect(routingSignal?.evidence.samples).toBe(6);
  });

  it('produces NO routing signal when self-eval outcomes are all retain (with/without contrast)', async () => {
    const now = new Date();
    // Same component count, but all retain → 100% success → no floor breach.
    appendSelfEvalResults([
      makeResult('src/a.ts', 'retain', now),
      makeResult('src/b.ts', 'retain', now),
      makeResult('src/c.ts', 'retain', now),
      makeResult('src/d.ts', 'retain', now),
      makeResult('src/e.ts', 'retain', now),
      makeResult('src/f.ts', 'retain', now),
    ]);

    const response = await runImprovementReview(REVIEW_INPUT, { logger });

    expect(response.totalOutcomes).toBe(6);
    const routingSignal = response.signals.find(
      (s) => s.category === 'routing' && s.signalKey.includes('code_review')
    );
    // Contrast vs. the failing-panel test above: presence of failing self-eval
    // outcomes is load-bearing — flip them all to retain and the signal vanishes.
    expect(routingSignal).toBeUndefined();
  });
});
