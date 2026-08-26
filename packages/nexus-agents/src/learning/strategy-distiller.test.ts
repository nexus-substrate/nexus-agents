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

  describe('promote()', () => {
    it('promotes active non-tainted rules to RoutingMemory', () => {
      // Need enough observations for high confidence
      populateStore({
        store,
        cli: 'claude',
        category: 'code_generation',
        count: 35,
        success: false,
      });
      populateStore({ store, cli: 'claude', category: 'code_generation', count: 5, success: true });

      distiller.distill();
      const memory = createMockRoutingMemory();
      const count = distiller.promote(memory);

      expect(count).toBeGreaterThan(0);
      expect(memory.storePreference).toHaveBeenCalled();

      // Verify promoted status
      const promoted = distiller.getRules('promoted');
      expect(promoted.length).toBeGreaterThan(0);
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
        count: 35,
        success: false,
      });
      populateStore({ store, cli: 'claude', category: 'code_generation', count: 5, success: true });

      distiller.distill();
      const memory = createMockRoutingMemory();
      // Verify that untainted rules DO promote (positive check)
      const count = distiller.promote(memory);
      expect(count).toBeGreaterThan(0);
    });
  });

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
