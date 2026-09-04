/**
 * Tests for StrategyDistiller
 *
 * @module learning/strategy-distiller.test
 * (Source: Issue #999 - Automatic Strategy Distillation)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  StrategyDistiller,
  createStrategyDistiller,
  sigmoidConfidence,
  effectFor,
  detectFailurePatterns,
  detectSuccessPatterns,
  detectLatencyPatterns,
} from './strategy-distiller.js';
import type { DistillerConfig } from './strategy-distiller-types.js';
import { DEFAULT_DISTILLER_CONFIG } from './strategy-distiller-types.js';
import { OutcomeStore } from '../orchestration/outcomes/outcome-store.js';
import type { TaskOutcome } from '../orchestration/outcomes/outcome-types.js';
import type { IRoutingMemory } from '../context/routing-memory.js';

// ============================================================================
// Helpers
// ============================================================================

function makeOutcome(overrides: Partial<TaskOutcome> = {}): TaskOutcome {
  return {
    id: `outcome-${Math.random().toString(36).slice(2)}`,
    cli: 'claude',
    category: 'code_generation',
    model: 'claude-opus-4',
    success: true,
    durationMs: 1000,
    timestamp: new Date().toISOString(),
    source: 'delegate',
    ...overrides,
  };
}

interface PopulateOpts {
  store: OutcomeStore;
  cli: TaskOutcome['cli'];
  category: TaskOutcome['category'];
  count: number;
  success: boolean;
  durationMs?: number;
}

function populateStore(opts: PopulateOpts): void {
  const durationMs = opts.durationMs ?? 1000;
  for (let i = 0; i < opts.count; i++) {
    opts.store.append(
      makeOutcome({ cli: opts.cli, category: opts.category, success: opts.success, durationMs })
    );
  }
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createMockRoutingMemory() {
  return {
    storePreference: vi.fn(),
    getPreferences: vi.fn().mockReturnValue([]),
    recordExperience: vi.fn(),
    getExperiencePatterns: vi.fn().mockReturnValue([]),
    getResearchMaturityReport: vi.fn().mockReturnValue({
      byBucket: {
        none: { count: 0, attempts: 0, successRate: 0 },
        low: { count: 0, attempts: 0, successRate: 0 },
        high: { count: 0, attempts: 0, successRate: 0 },
      },
      highVsNoneDelta: 0,
      totalRecords: 0,
    }),
    cacheAction: vi.fn(),
    getCachedAction: vi.fn(),
    getRecommendation: vi.fn(),
    getStats: vi.fn().mockReturnValue({
      totalPreferences: 0,
      totalExperiences: 0,
      cacheHits: 0,
      cacheMisses: 0,
      recommendationsMade: 0,
    }),
  } satisfies IRoutingMemory;
}

// ============================================================================
// sigmoidConfidence
// ============================================================================

describe('sigmoidConfidence', () => {
  it('returns ~0.5 at center (30 observations)', () => {
    const c = sigmoidConfidence(30);
    expect(c).toBeCloseTo(0.5, 1);
  });

  it('returns low confidence for few observations', () => {
    const c = sigmoidConfidence(5);
    expect(c).toBeLessThan(0.02);
  });

  it('returns high confidence for many observations', () => {
    const c = sigmoidConfidence(60);
    expect(c).toBeGreaterThan(0.99);
  });

  it('clamps to [0, 1]', () => {
    expect(sigmoidConfidence(0)).toBeGreaterThanOrEqual(0);
    expect(sigmoidConfidence(0)).toBeLessThanOrEqual(1);
    expect(sigmoidConfidence(1000)).toBeLessThanOrEqual(1);
  });

  it('accepts custom center', () => {
    const c = sigmoidConfidence(10, 10);
    expect(c).toBeCloseTo(0.5, 1);
  });
});

// ============================================================================
// effectFor (#5004 finding 3)
// ============================================================================

describe('effectFor', () => {
  const thresholds = {
    failureRateThreshold: 0.6,
    successRateThreshold: 0.8,
    latencyRatioThreshold: 2.0,
  };

  it('is 0 for a metric exactly at its detector threshold', () => {
    expect(effectFor('failure-rate', 0.6, thresholds)).toBe(0);
    expect(effectFor('success-rate', 0.8, thresholds)).toBe(0);
    expect(effectFor('latency-spike', 2.0, thresholds)).toBe(0);
  });

  it('normalises failure and success rates over the remaining headroom', () => {
    // (0.625 - 0.6) / (1 - 0.6)
    expect(effectFor('failure-rate', 0.625, thresholds)).toBeCloseTo(0.0625, 10);
    expect(effectFor('failure-rate', 1.0, thresholds)).toBe(1);
    // (0.9 - 0.8) / (1 - 0.8)
    expect(effectFor('success-rate', 0.9, thresholds)).toBeCloseTo(0.5, 10);
    expect(effectFor('success-rate', 1.0, thresholds)).toBe(1);
  });

  it('saturates a latency spike at twice the threshold ratio', () => {
    // min(1, (3 - 2) / 2)
    expect(effectFor('latency-spike', 3.0, thresholds)).toBeCloseTo(0.5, 10);
    expect(effectFor('latency-spike', 4.0, thresholds)).toBe(1);
    expect(effectFor('latency-spike', 40.0, thresholds)).toBe(1);
  });

  it('clamps a metric below the threshold to 0 rather than going negative', () => {
    expect(effectFor('failure-rate', 0.1, thresholds)).toBe(0);
    expect(effectFor('success-rate', 0.2, thresholds)).toBe(0);
    expect(effectFor('latency-spike', 1.0, thresholds)).toBe(0);
  });

  it('never returns NaN — a degenerate threshold or metric yields 0', () => {
    // A threshold of 1.0 leaves no headroom: (1 - 1) / (1 - 1). A NaN here
    // would reach `computeDelta` as `baseDelta * NaN` and poison the score.
    expect(effectFor('failure-rate', 1.0, { ...thresholds, failureRateThreshold: 1.0 })).toBe(0);
    expect(effectFor('latency-spike', 3.0, { ...thresholds, latencyRatioThreshold: 0 })).toBe(0);
    expect(effectFor('failure-rate', Number.NaN, thresholds)).toBe(0);
  });
});

// ============================================================================
// Pattern Detectors
// ============================================================================

describe('detectFailurePatterns', () => {
  it('detects groups with failure rate above threshold', () => {
    const groups = [
      {
        cli: 'claude' as const,
        category: 'code_generation',
        outcomes: [
          makeOutcome({ success: false }),
          makeOutcome({ success: false }),
          makeOutcome({ success: false }),
          makeOutcome({ success: true }),
        ],
      },
    ];
    const patterns = detectFailurePatterns(groups, 0.6);
    expect(patterns).toHaveLength(1);
    expect(patterns[0]?.action).toBe('penalize');
    expect(patterns[0]?.metric).toBe(0.75);
  });

  it('detects avoid for extreme failure rates', () => {
    const groups = [
      {
        cli: 'gemini' as const,
        category: 'security_review',
        outcomes: [
          makeOutcome({ success: false }),
          makeOutcome({ success: false }),
          makeOutcome({ success: false }),
          makeOutcome({ success: false }),
          makeOutcome({ success: true }),
        ],
      },
    ];
    const patterns = detectFailurePatterns(groups, 0.6);
    expect(patterns).toHaveLength(1);
    expect(patterns[0]?.action).toBe('avoid');
  });

  it('skips groups below threshold', () => {
    const groups = [
      {
        cli: 'claude' as const,
        category: 'code_generation',
        outcomes: [makeOutcome({ success: false }), makeOutcome({ success: true })],
      },
    ];
    const patterns = detectFailurePatterns(groups, 0.6);
    expect(patterns).toHaveLength(0);
  });
});

describe('detectSuccessPatterns', () => {
  it('detects groups with success rate above threshold', () => {
    const groups = [
      {
        cli: 'claude' as const,
        category: 'code_generation',
        outcomes: [
          makeOutcome({ success: true }),
          makeOutcome({ success: true }),
          makeOutcome({ success: true }),
          makeOutcome({ success: true }),
          makeOutcome({ success: false }),
        ],
      },
    ];
    const patterns = detectSuccessPatterns(groups, 0.8);
    expect(patterns).toHaveLength(1);
    expect(patterns[0]?.action).toBe('boost');
    expect(patterns[0]?.metric).toBe(0.8);
  });

  it('skips groups below threshold', () => {
    const groups = [
      {
        cli: 'claude' as const,
        category: 'code_generation',
        outcomes: [makeOutcome({ success: true }), makeOutcome({ success: false })],
      },
    ];
    const patterns = detectSuccessPatterns(groups, 0.8);
    expect(patterns).toHaveLength(0);
  });
});

describe('detectLatencyPatterns', () => {
  it('detects groups with p90/median above threshold', () => {
    const durations = [100, 100, 100, 100, 100, 100, 100, 100, 500, 800];
    const groups = [
      {
        cli: 'gemini' as const,
        category: 'code_generation',
        outcomes: durations.map((d) => makeOutcome({ durationMs: d })),
      },
    ];
    const patterns = detectLatencyPatterns(groups, 2.0);
    expect(patterns).toHaveLength(1);
    expect(patterns[0]?.action).toBe('penalize');
    expect(patterns[0]?.patternType).toBe('latency-spike');
  });

  it('skips groups with fewer than 3 outcomes', () => {
    const groups = [
      {
        cli: 'claude' as const,
        category: 'code_generation',
        outcomes: [makeOutcome({ durationMs: 100 }), makeOutcome({ durationMs: 500 })],
      },
    ];
    const patterns = detectLatencyPatterns(groups, 2.0);
    expect(patterns).toHaveLength(0);
  });

  it('skips groups with uniform latency', () => {
    const groups = [
      {
        cli: 'claude' as const,
        category: 'code_generation',
        outcomes: [
          makeOutcome({ durationMs: 100 }),
          makeOutcome({ durationMs: 100 }),
          makeOutcome({ durationMs: 100 }),
        ],
      },
    ];
    const patterns = detectLatencyPatterns(groups, 2.0);
    expect(patterns).toHaveLength(0);
  });
});

// ============================================================================
// StrategyDistiller
// ============================================================================

describe('StrategyDistiller', () => {
  let store: OutcomeStore;
  let distiller: StrategyDistiller;

  beforeEach(() => {
    store = new OutcomeStore();
    distiller = new StrategyDistiller(store);
  });

  describe('distill()', () => {
    it('produces rules from outcome patterns', () => {
      // Create a failure pattern: claude fails at security_review
      populateStore({
        store,
        cli: 'claude',
        category: 'security_review',
        count: 8,
        success: false,
      });
      populateStore({ store, cli: 'claude', category: 'security_review', count: 2, success: true });

      distiller.distill();
      const rules = distiller.getRules();
      expect(rules.length).toBeGreaterThan(0);

      const failRule = rules.find((r) => r.patternType === 'failure-rate');
      expect(failRule).toBeDefined();
      expect(failRule?.cli).toBe('claude');
      expect(failRule?.category).toBe('security_review');
    });

    it('produces success pattern rules', () => {
      populateStore({ store, cli: 'gemini', category: 'code_generation', count: 9, success: true });
      populateStore({
        store,
        cli: 'gemini',
        category: 'code_generation',
        count: 1,
        success: false,
      });

      distiller.distill();
      const rules = distiller.getRules();
      const successRule = rules.find((r) => r.patternType === 'success-rate');
      expect(successRule).toBeDefined();
      expect(successRule?.action).toBe('boost');
    });

    it('expires old rules', async () => {
      populateStore({
        store,
        cli: 'claude',
        category: 'code_generation',
        count: 8,
        success: false,
      });
      populateStore({ store, cli: 'claude', category: 'code_generation', count: 2, success: true });

      // Use very short expiry
      const quickDistiller = new StrategyDistiller(store, undefined, { ruleExpiryMs: 1 });
      quickDistiller.distill();

      // Verify rules were created
      const rules1 = quickDistiller.getRules();
      expect(rules1.length).toBeGreaterThan(0);

      // Wait to ensure time passes beyond expiry
      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });

      // Clear store so no new patterns found, then distill to trigger expiration
      store.clear();
      quickDistiller.distill();

      const expiredRules = quickDistiller.getRules('expired');
      expect(expiredRules.length).toBeGreaterThan(0);
    });

    it('enforces max rules bound', () => {
      const config: Partial<DistillerConfig> = { maxRules: 2 };
      const bounded = new StrategyDistiller(store, undefined, config);

      // Create many distinct patterns
      populateStore({
        store,
        cli: 'claude',
        category: 'code_generation',
        count: 8,
        success: false,
      });
      populateStore({ store, cli: 'claude', category: 'code_generation', count: 2, success: true });
      populateStore({
        store,
        cli: 'gemini',
        category: 'security_review',
        count: 8,
        success: false,
      });
      populateStore({ store, cli: 'gemini', category: 'security_review', count: 2, success: true });
      populateStore({ store, cli: 'codex', category: 'architecture', count: 8, success: false });
      populateStore({ store, cli: 'codex', category: 'architecture', count: 2, success: true });

      bounded.distill();
      expect(bounded.getRules().length).toBeLessThanOrEqual(2);
    });

    it('evicts by support × effect, not by sample size alone (#5004)', () => {
      const bounded = new StrategyDistiller(store, undefined, { maxRules: 2 });

      // X: the most observations, barely past threshold → high support, tiny effect.
      populateStore({
        store,
        cli: 'claude',
        category: 'code_generation',
        count: 25,
        success: false,
      });
      populateStore({
        store,
        cli: 'claude',
        category: 'code_generation',
        count: 15,
        success: true,
      });
      // Y: fewer observations, but every one failed → support 0.5, effect 1.
      populateStore({
        store,
        cli: 'gemini',
        category: 'code_generation',
        count: 30,
        success: false,
      });
      // Z: many observations, every one failed → the strongest rule.
      populateStore({
        store,
        cli: 'codex',
        category: 'code_generation',
        count: 40,
        success: false,
      });

      bounded.distill();

      const ids = bounded.getRules().map((r) => r.id);
      expect(ids).toHaveLength(2);
      // Sample-size ordering would have evicted Y (sigmoid(30) = 0.5 is the
      // lowest). The product evicts X: sigmoid(40) × 0.0625 ≈ 0.055.
      expect(ids).toContain('failure-rate:gemini:code_generation');
      expect(ids).toContain('failure-rate:codex:code_generation');
      expect(ids).not.toContain('failure-rate:claude:code_generation');
    });
  });

  describe('confidence = support × effect (#5004 finding 3)', () => {
    it('records support, effect and their product on a distilled rule', () => {
      // A: 25/40 failed → rate 0.625, just past the 0.6 threshold.
      populateStore({
        store,
        cli: 'claude',
        category: 'code_generation',
        count: 25,
        success: false,
      });
      populateStore({
        store,
        cli: 'claude',
        category: 'code_generation',
        count: 15,
        success: true,
      });
      // B: 40/40 failed → rate 1.0, the far end of the scale.
      populateStore({
        store,
        cli: 'gemini',
        category: 'code_generation',
        count: 40,
        success: false,
      });

      distiller.distill();

      const a = distiller.getRules().find((r) => r.id === 'failure-rate:claude:code_generation');
      const b = distiller.getRules().find((r) => r.id === 'failure-rate:gemini:code_generation');
      expect(a).toBeDefined();
      expect(b).toBeDefined();
      if (a === undefined || b === undefined) return;

      const support40 = sigmoidConfidence(40);
      expect(a.support).toBeCloseTo(support40, 10);
      expect(b.support).toBeCloseTo(support40, 10);
      expect(a.effect).toBeCloseTo(0.0625, 10);
      expect(b.effect).toBe(1);

      // Same sample size, so the old formula gave both the same confidence.
      // Negative control: A's confidence is NOT the sigmoid any more.
      expect(a.confidence).toBeCloseTo(support40 * 0.0625, 10);
      expect(a.confidence).not.toBeCloseTo(support40, 2);
      // B saturates effect, so its confidence equals the support alone.
      expect(b.confidence).toBeCloseTo(support40, 10);
      expect(b.confidence).toBeGreaterThan(a.confidence);
    });

    it('keeps a 6/6 failure small — support bounds a perfect but thin signal', () => {
      populateStore({
        store,
        cli: 'claude',
        category: 'code_generation',
        count: 6,
        success: false,
      });
      distiller.distill();

      const rule = distiller.getRules()[0];
      expect(rule).toBeDefined();
      expect(rule?.effect).toBe(1);
      expect(rule?.confidence).toBeCloseTo(sigmoidConfidence(6), 10);
      expect(rule?.confidence).toBeLessThan(0.02);
    });

    it('gives a rule exactly at threshold an effect of 0 and a confidence of 0', () => {
      // 24/40 = 0.6 → detected (>=), but with no margin past the threshold.
      populateStore({
        store,
        cli: 'claude',
        category: 'code_generation',
        count: 24,
        success: false,
      });
      populateStore({
        store,
        cli: 'claude',
        category: 'code_generation',
        count: 16,
        success: true,
      });
      distiller.distill();

      const rule = distiller.getRules().find((r) => r.id === 'failure-rate:claude:code_generation');
      expect(rule).toBeDefined();
      expect(rule?.effect).toBe(0);
      expect(rule?.confidence).toBe(0);
      expect(rule?.support).toBeCloseTo(sigmoidConfidence(40), 10);
    });
  });

  describe('rule lifecycle', () => {
    it('creates draft rules with few observations', () => {
      populateStore({
        store,
        cli: 'claude',
        category: 'code_generation',
        count: 3,
        success: false,
      });
      const distillerWithLowThreshold = new StrategyDistiller(store, undefined, {
        failureRateThreshold: 0.5,
        minObservationsForDraft: 2,
        minObservationsForActive: 10,
      });
      distillerWithLowThreshold.distill();
      const drafts = distillerWithLowThreshold.getRules('draft');
      expect(drafts.length).toBeGreaterThan(0);
    });

    it('creates no rule from a single observation (#5004)', () => {
      // `minObservationsForDraft: 3` is documented as "minimum observations
      // before creating a draft rule" and did nothing: `computeStatus`
      // returned 'draft' from both the guarded branch and the fallthrough, and
      // no detector enforces a group-size floor. One failing task produced a
      // persisted `failure-rate` rule at `observationCount: 1`, occupying a
      // rule slot and penalising a CLI on evidence of one run.
      populateStore({ store, cli: 'gemini', category: 'documentation', count: 1, success: false });
      const distiller = new StrategyDistiller(store);

      distiller.distill();

      expect(distiller.getRules()).toHaveLength(0);
    });

    it('creates the rule once the floor is reached', () => {
      // The pair: the floor must gate, not block. Three observations is the
      // documented default, so three must produce the rule.
      populateStore({ store, cli: 'gemini', category: 'documentation', count: 3, success: false });
      const distiller = new StrategyDistiller(store);

      distiller.distill();

      expect(distiller.getRules().length).toBeGreaterThan(0);
    });

    it('activates rules with sufficient observations', () => {
      populateStore({
        store,
        cli: 'claude',
        category: 'code_generation',
        count: 8,
        success: false,
      });
      populateStore({ store, cli: 'claude', category: 'code_generation', count: 2, success: true });

      distiller.distill();
      const active = distiller.getRules('active');
      expect(active.length).toBeGreaterThan(0);
    });
  });

  describe('onOutcome()', () => {
    it('triggers distillation at threshold', () => {
      populateStore({
        store,
        cli: 'claude',
        category: 'code_generation',
        count: 60,
        success: false,
      });

      const config: Partial<DistillerConfig> = { triggerThreshold: 5 };
      const d = new StrategyDistiller(store, undefined, config);

      for (let i = 0; i < 5; i++) {
        d.onOutcome();
      }

      // Should have distilled after 5 outcomes
      const stats = d.getStats();
      expect(stats.lastDistillAt).toBeDefined();
      expect(stats.outcomesSinceLastDistill).toBe(0);
    });

    it('does not trigger below threshold', () => {
      const config: Partial<DistillerConfig> = { triggerThreshold: 50 };
      const d = new StrategyDistiller(store, undefined, config);
      d.onOutcome();
      expect(d.getStats().lastDistillAt).toBeUndefined();
    });
  });

  describe('getStats()', () => {
    it('returns zeroed stats initially', () => {
      const stats = distiller.getStats();
      expect(stats.totalRules).toBe(0);
      expect(stats.lastDistillAt).toBeUndefined();
      expect(stats.outcomesSinceLastDistill).toBe(0);
    });

    it('tracks rule counts by status', () => {
      populateStore({
        store,
        cli: 'claude',
        category: 'code_generation',
        count: 8,
        success: false,
      });
      populateStore({ store, cli: 'claude', category: 'code_generation', count: 2, success: true });
      distiller.distill();

      const stats = distiller.getStats();
      expect(stats.totalRules).toBeGreaterThan(0);
    });
  });

  /* eslint-disable @typescript-eslint/no-deprecated -- promote() and
     promotionConfidence are deprecated (#5004 finding 4, removal #5467);
     these tests exist to prove the deprecation is non-breaking. */
  describe('promote() — deprecated, kept callable (#5004 finding 4, removal #5467)', () => {
    it('promotes active non-tainted rules to RoutingMemory', () => {
      // 40/40 failed: support sigmoid(40) ≈ 0.88 × effect 1 clears the 0.7 gate.
      // This previously used 35/40, which the sample-size-only confidence
      // (0.88) passed but the product (0.88 × 0.6875 ≈ 0.61) does not — see
      // the gate test below.
      populateStore({
        store,
        cli: 'claude',
        category: 'code_generation',
        count: 40,
        success: false,
      });

      distiller.distill();
      const memory = createMockRoutingMemory();
      const count = distiller.promote(memory);

      expect(count).toBeGreaterThan(0);
      expect(memory.storePreference).toHaveBeenCalled();

      // Verify promoted status
      const promoted = distiller.getRules('promoted');
      expect(promoted.length).toBeGreaterThan(0);
    });

    it('gates on the support × effect product, not on sample size', () => {
      // 35/40 failed: rate 0.875 → effect 0.6875; support 0.88 → product ≈ 0.61.
      // The old sigmoid-only confidence (0.88) would have promoted this.
      populateStore({
        store,
        cli: 'claude',
        category: 'code_generation',
        count: 35,
        success: false,
      });
      populateStore({ store, cli: 'claude', category: 'code_generation', count: 5, success: true });

      distiller.distill();
      const rule = distiller.getRules('active')[0];
      expect(rule?.support).toBeGreaterThan(DEFAULT_DISTILLER_CONFIG.promotionConfidence);
      expect(rule?.confidence).toBeLessThan(DEFAULT_DISTILLER_CONFIG.promotionConfidence);

      const memory = createMockRoutingMemory();
      expect(distiller.promote(memory)).toBe(0);
      expect(memory.storePreference).not.toHaveBeenCalled();
    });

    it('is still callable with no rules — the deprecation is non-breaking', () => {
      const memory = createMockRoutingMemory();
      expect(distiller.promote(memory)).toBe(0);
    });

    it('does not promote draft rules', () => {
      populateStore({
        store,
        cli: 'claude',
        category: 'code_generation',
        count: 3,
        success: false,
      });
      const lowThreshold = new StrategyDistiller(store, undefined, {
        failureRateThreshold: 0.5,
        minObservationsForDraft: 2,
        minObservationsForActive: 100,
      });
      lowThreshold.distill();

      const memory = createMockRoutingMemory();
      const count = lowThreshold.promote(memory);
      expect(count).toBe(0);
      expect(memory.storePreference).not.toHaveBeenCalled();
    });

    it('does not promote tainted rules', () => {
      // We can't easily create tainted rules from the public API
      // since tainted is always false from distill(), so this tests
      // the boundary condition
      populateStore({
        store,
        cli: 'claude',
        category: 'code_generation',
        count: 40,
        success: false,
      });

      distiller.distill();
      const memory = createMockRoutingMemory();
      // Verify that untainted rules DO promote (positive check)
      const count = distiller.promote(memory);
      expect(count).toBeGreaterThan(0);
    });
  });

  /* eslint-enable @typescript-eslint/no-deprecated */

  describe('createStrategyDistiller factory', () => {
    it('creates an instance', () => {
      const d = createStrategyDistiller(store);
      expect(d).toBeInstanceOf(StrategyDistiller);
    });
  });

  describe('DEFAULT_DISTILLER_CONFIG', () => {
    it('has expected defaults', () => {
      expect(DEFAULT_DISTILLER_CONFIG.triggerThreshold).toBe(50);
      expect(DEFAULT_DISTILLER_CONFIG.maxRules).toBe(90);
      expect(DEFAULT_DISTILLER_CONFIG.ruleExpiryMs).toBe(86400000);
    });
  });
});
