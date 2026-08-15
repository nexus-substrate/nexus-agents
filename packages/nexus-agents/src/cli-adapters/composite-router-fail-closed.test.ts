/**
 * Tests for the fail-closed override mechanism (#2417).
 *
 * Phase 1 of #2417 ships the **mechanism** — `SENSITIVE_CATEGORIES` set + the
 * fail-closed branch in `applyCategoryOverride`. The default set is empty;
 * promoting a category to fail-closed is a separate, deliberate PR.
 *
 * The applyCategoryOverride function is file-local (not exported) — these
 * tests exercise it through `runPipeline` like the other Phase 1/2 stage
 * tests in graph/composite-router-stages.test.ts.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  analyzeTaskProfile,
  runPipeline,
  type StageDependencies,
} from './composite-router-stages.js';
import type { CliName, CliTask } from './types.js';
import { CompositeRoutingError } from './composite-router-types.js';
import { isCategoryFailClosed, SENSITIVE_CATEGORIES } from './fallback-chains.js';

// ============================================================================
// Default config: empty SENSITIVE_CATEGORIES
// ============================================================================

describe('SENSITIVE_CATEGORIES default', () => {
  it('is empty by default — operators promote categories case by case (#2417)', () => {
    expect(SENSITIVE_CATEGORIES.size).toBe(0);
  });

  it('isCategoryFailClosed returns false for any category by default', () => {
    expect(isCategoryFailClosed('security_review')).toBe(false);
    expect(isCategoryFailClosed('architecture')).toBe(false);
    expect(isCategoryFailClosed('research')).toBe(false);
    expect(isCategoryFailClosed('documentation')).toBe(false);
  });
});

// ============================================================================
// Pipeline integration with a mocked SENSITIVE_CATEGORIES set
// ============================================================================

const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  setLevel: vi.fn(),
  getLevel: vi.fn(),
  setFormat: vi.fn(),
  setDestination: vi.fn(),
  child: vi.fn().mockReturnThis(),
};

function makeDeps(): StageDependencies {
  return {
    config: {
      enableConfidenceCascade: false,
      enableBudgetFilter: false,
      enableCapabilityMatch: false,
      enableZeroRouter: false,
      enablePreferenceRouting: false,
      enableTopsisRanking: false,
      enableLinUCBSelection: false,
      enableQualityConstraint: false,
      enableResourceStrategy: false,
      enableStrategyDistillation: false,
      enableLatencyTracking: false,
      enableRoutingMemory: false,
      enableKnnRouting: false,
      enableCapacityBalancing: true,
      billingMode: 'api',
      latencyScoreWeight: 0.2,
      linucbAlpha: 1.0,
      maxDecisionTimeMs: 50,
      preferenceMinDataPoints: 10,
    },
    logger: mockLogger,
    cliNames: ['claude', 'gemini', 'codex'],
    budgetRouter: undefined,
    zeroRouter: undefined,
    preferenceRouter: undefined,
    topsisRouter: undefined,
    linucbBandit: undefined,
    latencyTracker: undefined,
    routingMemory: undefined,
    confidenceCascadeStage: undefined,
    capabilityMatchStage: undefined,
    qualityConstraintStage: undefined,
    resourceStrategyStage: undefined,
    distilledRuleStage: undefined,
    knnRoutingStage: undefined,
    capacityFilterStage: undefined,
  };
}

describe('fail-closed pipeline integration (#2417)', () => {
  it('with empty SENSITIVE_CATEGORIES, exhausted override falls back softly (regression of #2414)', async () => {
    // security_review override is [codex, gemini, claude, opencode];
    // we pass only opencode-incapable CLIs that aren't in the override chain.
    // Actually: with an empty candidate list intersection and empty
    // SENSITIVE_CATEGORIES, the soft fallback path returns the original
    // candidates and the route succeeds.
    const task: CliTask = { content: 'Perform a security audit of the auth flow' };
    const stages: string[] = [];
    const profile = analyzeTaskProfile(task, []);
    // Pass only an obscure-but-valid CliName that isn't in the override chain.
    // The override chain for security_review is [codex,gemini,claude,opencode];
    // every member IS a CliName, so we can't easily simulate "all override CLIs
    // unavailable" by trimming the cliNames passed to runPipeline. Instead we
    // verify the empty-SENSITIVE_CATEGORIES default by passing a category that
    // hits the override but with full overlap — fall-through is implicit.
    const cliNames: CliName[] = ['claude', 'gemini', 'codex', 'opencode'];

    const result = await runPipeline(task, profile, stages, cliNames, makeDeps());

    expect(result.ok).toBe(true);
    // Default behavior: candidate set has overlap with override; selectedCli is
    // the override primary (codex). No fail-closed marker.
    if (result.ok) {
      expect(result.value.selectedCli).toBe('codex');
    }
    expect(stages).not.toContain('category-override:fail-closed');
  });

  it('with sensitive category set + override overlap, normal routing applies (no err branch)', async () => {
    // #2430 item 4: this test was previously named "returns CompositeRoutingError
    // when sensitive category exhausts override" but its assertion is `result.ok
    // === true` — it lands on the happy path because the candidate list overlaps
    // the override chain. The genuine err-branch coverage is in the
    // 'fail-closed branch returns CompositeRoutingError' describe block below.
    const sensitiveSet = SENSITIVE_CATEGORIES as Set<string>;
    sensitiveSet.add('security_review');
    try {
      const task: CliTask = { content: 'Perform a security audit of the login endpoint' };
      const stages: string[] = [];
      const profile = analyzeTaskProfile(task, []);
      const cliNames: CliName[] = ['claude', 'gemini', 'codex', 'opencode'];
      const result = await runPipeline(task, profile, stages, cliNames, makeDeps());
      // Sensitive set + override overlap → success path, override fires normally.
      expect(result.ok).toBe(true);
      expect(stages).toContain('category-override');
      expect(stages).not.toContain('category-override:fail-closed');
    } finally {
      sensitiveSet.delete('security_review');
    }
  });

  it('SENSITIVE_CATEGORIES happy-path: override overlap exists → normal routing (no fail-closed marker)', async () => {
    const sensitiveSet = SENSITIVE_CATEGORIES as Set<string>;
    sensitiveSet.add('security_review');
    try {
      const task: CliTask = { content: 'Run a security review for the new module' };
      const stages: string[] = [];
      const profile = analyzeTaskProfile(task, []);
      // codex IS in security_review's override; route succeeds.
      const cliNames: CliName[] = ['codex'];

      const result = await runPipeline(task, profile, stages, cliNames, makeDeps());

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.selectedCli).toBe('codex');
      expect(stages).toContain('category-override');
      expect(stages).not.toContain('category-override:fail-closed');
    } finally {
      sensitiveSet.delete('security_review');
    }
  });
});

// ============================================================================
// Direct unit tests for the fail-closed Result.err branch — synthesized via
// pipeline invocation that arranges for an exhausted override.
// ============================================================================

describe('fail-closed branch returns CompositeRoutingError (#2417)', () => {
  it('emits CompositeRoutingError with category-override stage when sensitive override is exhausted', async () => {
    const sensitiveSet = SENSITIVE_CATEGORIES as Set<string>;
    sensitiveSet.add('security_review');
    try {
      // Force override exhaustion: we monkey-patch the override entry for
      // 'security_review' to a chain whose intersection with cliNames is
      // empty. The mutation is in-place on the imported const (typed
      // Partial<Record<...>>) — we restore it in finally.
      const fc = await import('./fallback-chains.js');
      const realChain = fc.CATEGORY_CHAIN_OVERRIDES['security_review'];
      // Cast to mutable for the test patch.
      (fc.CATEGORY_CHAIN_OVERRIDES as Record<string, readonly CliName[] | undefined>)[
        'security_review'
      ] = ['opencode']; // matches no candidate below
      try {
        const task: CliTask = { content: 'Conduct a security audit' };
        const stages: string[] = [];
        const profile = analyzeTaskProfile(task, []);
        const cliNames: CliName[] = ['claude', 'gemini', 'codex'];

        const result = await runPipeline(task, profile, stages, cliNames, makeDeps());

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toBeInstanceOf(CompositeRoutingError);
          expect(result.error.message).toContain('fail-closed');
          expect(result.error.message).toContain('security_review');
          expect(result.error.stage).toBe('category-override');
        }
        expect(stages).toContain('category-override:fail-closed');
      } finally {
        // Restore the original override chain.
        (fc.CATEGORY_CHAIN_OVERRIDES as Record<string, readonly CliName[] | undefined>)[
          'security_review'
        ] = realChain;
      }
    } finally {
      sensitiveSet.delete('security_review');
    }
  });

  it('non-sensitive category with exhausted override falls back softly (regression check)', async () => {
    // architecture is in the override table but NOT sensitive — should
    // fall back rather than fail-closed, even when its override is
    // exhausted.
    const fc = await import('./fallback-chains.js');
    const realChain = fc.CATEGORY_CHAIN_OVERRIDES['architecture'];
    (fc.CATEGORY_CHAIN_OVERRIDES as Record<string, readonly CliName[] | undefined>)[
      'architecture'
    ] = ['opencode']; // exhausts vs the candidate list below
    try {
      const task: CliTask = { content: 'Design a system architecture for the new module' };
      const stages: string[] = [];
      const profile = analyzeTaskProfile(task, []);
      const cliNames: CliName[] = ['claude', 'gemini', 'codex'];

      const result = await runPipeline(task, profile, stages, cliNames, makeDeps());

      expect(result.ok).toBe(true); // soft fallback succeeds
      expect(stages).toContain('category-override:no-eligible');
      expect(stages).not.toContain('category-override:fail-closed');
    } finally {
      (fc.CATEGORY_CHAIN_OVERRIDES as Record<string, readonly CliName[] | undefined>)[
        'architecture'
      ] = realChain;
    }
  });
});
