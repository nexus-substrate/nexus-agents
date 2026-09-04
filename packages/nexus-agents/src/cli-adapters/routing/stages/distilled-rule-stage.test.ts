/**
 * Tests for DistilledRuleStage
 *
 * @module cli-adapters/routing/stages/distilled-rule-stage.test
 * (Source: Issue #999 - Automatic Strategy Distillation)
 */

import { describe, it, expect, vi } from 'vitest';
import { DistilledRuleStage, createDistilledRuleStage } from './distilled-rule-stage.js';
import type { RoutingContext, CliName } from '../router-stage.js';
import {
  StrategyDistiller,
  sigmoidConfidence,
  effectFor,
} from '../../../learning/strategy-distiller.js';
import type { DistilledRule, RuleStatus } from '../../../learning/strategy-distiller-types.js';
import { DEFAULT_DISTILLER_CONFIG } from '../../../learning/strategy-distiller-types.js';
import { OutcomeStore } from '../../../orchestration/outcomes/outcome-store.js';
import type { TaskOutcome } from '../../../orchestration/outcomes/outcome-types.js';

// ============================================================================
// Helpers
// ============================================================================

function createContext(
  task: string,
  clis: CliName[] = ['claude', 'gemini', 'codex'],
  signals: string[] = [],
  metadata?: Record<string, unknown>
): RoutingContext {
  return {
    task,
    metadata,
    availableClis: clis,
    scores: new Map(clis.map((c) => [c, 0])),
    filtered: new Map(),
    signals,
    trace: [],
  };
}

function makeRule(overrides: Partial<DistilledRule> = {}): DistilledRule {
  return {
    id: 'failure-rate:claude:code_generation',
    patternType: 'failure-rate',
    cli: 'claude',
    category: 'code_generation',
    action: 'penalize',
    confidence: 0.8,
    support: 0.8,
    effect: 1,
    observationCount: 40,
    metric: 0.7,
    status: 'active',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    tainted: false,
    ...overrides,
  };
}

/**
 * A rule with `support`/`effect`/`confidence` derived the way the distiller
 * derives them (#5004 finding 3), so a stage test pins the product contract
 * rather than a hand-typed confidence.
 */
function makeMeasuredRule(
  overrides: Partial<DistilledRule> & { observationCount: number; metric: number }
): DistilledRule {
  const patternType = overrides.patternType ?? 'failure-rate';
  const support = sigmoidConfidence(overrides.observationCount);
  const effect = effectFor(patternType, overrides.metric, DEFAULT_DISTILLER_CONFIG);
  return makeRule({ ...overrides, patternType, support, effect, confidence: support * effect });
}

/** A real distiller over an OutcomeStore — the seam the stage actually consumes. */
function distillerFrom(
  groups: ReadonlyArray<{ cli: CliName; failures: number; successes: number }>
): StrategyDistiller {
  const store = new OutcomeStore();
  let n = 0;
  const outcome = (cli: CliName, success: boolean): TaskOutcome => ({
    id: `o-${String(n++)}`,
    cli,
    category: 'code_generation',
    model: 'm',
    success,
    durationMs: 1000,
    timestamp: '2026-09-04T00:00:00Z',
    source: 'delegate',
  });
  for (const g of groups) {
    for (let i = 0; i < g.failures; i++) store.append(outcome(g.cli, false));
    for (let i = 0; i < g.successes; i++) store.append(outcome(g.cli, true));
  }
  const distiller = new StrategyDistiller(store);
  distiller.distill();
  return distiller;
}

function createMockDistiller(rules: DistilledRule[] = []): StrategyDistiller {
  return {
    getRules: vi.fn().mockImplementation((status?: RuleStatus) => {
      if (status === undefined) return rules;
      return rules.filter((r) => r.status === status);
    }),
    onOutcome: vi.fn(),
    distill: vi.fn(),
    getStats: vi.fn().mockReturnValue({
      ruleCountByStatus: { draft: 0, active: rules.length, promoted: 0, expired: 0 },
      totalRules: rules.length,
      lastDistillAt: undefined,
      outcomesSinceLastDistill: 0,
    }),
    promote: vi.fn().mockReturnValue(0),
  } as unknown as StrategyDistiller;
}

// ============================================================================
// Tests
// ============================================================================

describe('DistilledRuleStage', () => {
  describe('constructor', () => {
    it('has correct name and priority', () => {
      const stage = new DistilledRuleStage(createMockDistiller());
      expect(stage.name).toBe('distilled-rule');
      expect(stage.priority).toBe(45);
    });
  });

  describe('canHandle', () => {
    it('returns false with no active rules', () => {
      const stage = new DistilledRuleStage(createMockDistiller([]));
      const ctx = createContext('test task');
      expect(stage.canHandle(ctx)).toBe(false);
    });

    it('returns false with single candidate', () => {
      const rules = [makeRule()];
      const stage = new DistilledRuleStage(createMockDistiller(rules));
      const ctx = createContext('test task', ['claude']);
      expect(stage.canHandle(ctx)).toBe(false);
    });

    it('returns true with active rules and multiple candidates', () => {
      const rules = [makeRule()];
      const stage = new DistilledRuleStage(createMockDistiller(rules));
      const ctx = createContext('test task');
      expect(stage.canHandle(ctx)).toBe(true);
    });
  });

  describe('route', () => {
    it('skips when no active rules exist', async () => {
      const stage = new DistilledRuleStage(createMockDistiller([]));
      const ctx = createContext('test task');
      const result = await stage.route(ctx);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.continuesPipeline).toBe(true);
        const trace = result.value.context.trace;
        expect(trace[trace.length - 1]?.action).toBe('skip');
      }
    });

    it('caps the aggregate when an unscoped task matches every rule (#5004)', async () => {
      // `detectTaskCategory` returns null for content with no specialization
      // keyword, and an undefined category matches ALL of a CLI's rules. Six
      // penalties at confidence 0.88 stacked to -26.4 against a candidate at 0
      // — an order of magnitude past `avoidDelta`, the largest documented
      // single-rule bound, driven by rules learned for six unrelated
      // categories.
      const categories = [
        'code_generation',
        'code_review',
        'documentation',
        'testing',
        'debugging',
        'refactoring',
      ];
      const rules = categories.map((category) =>
        makeRule({ id: `failure-rate:claude:${category}`, category, confidence: 1.0 })
      );
      const stage = new DistilledRuleStage(createMockDistiller(rules));
      // No `task-category:` signal → the stage's category-unknown branch.
      const ctx = createContext('an unscoped task', ['claude', 'gemini']);

      const result = await stage.route(ctx);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const claudeScore = result.value.context.scores.get('claude') ?? 0;
      expect(claudeScore).toBeGreaterThanOrEqual(-10);
      expect(result.value.context.signals).toContain('distilled-rule:capped=claude');
    });

    it('leaves an in-bounds aggregate untouched', async () => {
      // The pair: the cap must clamp, not flatten. A single penalty is well
      // inside the bound and must still be applied at its full value.
      const rules = [makeRule({ action: 'penalize', confidence: 1.0 })];
      const stage = new DistilledRuleStage(createMockDistiller(rules));
      const ctx = createContext(
        'test task',
        ['claude', 'gemini'],
        ['task-category:code_generation']
      );

      const result = await stage.route(ctx);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.context.scores.get('claude')).toBe(-5);
      expect(result.value.context.signals).not.toContain('distilled-rule:capped=claude');
    });

    it('applies penalize action to matching CLI', async () => {
      const rules = [makeRule({ action: 'penalize', confidence: 1.0 })];
      const stage = new DistilledRuleStage(createMockDistiller(rules));
      const ctx = createContext(
        'test task',
        ['claude', 'gemini'],
        ['task-category:code_generation']
      );

      const result = await stage.route(ctx);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const claudeScore = result.value.context.scores.get('claude') ?? 0;
        expect(claudeScore).toBeLessThan(0);
        // Gemini should be unaffected
        const geminiScore = result.value.context.scores.get('gemini') ?? 0;
        expect(geminiScore).toBe(0);
      }
    });

    it('applies boost action to matching CLI', async () => {
      const rules = [
        makeRule({
          id: 'success-rate:gemini:code_generation',
          patternType: 'success-rate',
          cli: 'gemini',
          action: 'boost',
          confidence: 1.0,
        }),
      ];
      const stage = new DistilledRuleStage(createMockDistiller(rules));
      const ctx = createContext(
        'test task',
        ['claude', 'gemini'],
        ['task-category:code_generation']
      );

      const result = await stage.route(ctx);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const geminiScore = result.value.context.scores.get('gemini') ?? 0;
        expect(geminiScore).toBeGreaterThan(0);
      }
    });

    it('applies avoid action with larger penalty', async () => {
      const rules = [makeRule({ action: 'avoid', confidence: 1.0 })];
      const stage = new DistilledRuleStage(createMockDistiller(rules));
      const ctx = createContext(
        'test task',
        ['claude', 'gemini'],
        ['task-category:code_generation']
      );

      const result = await stage.route(ctx);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const claudeScore = result.value.context.scores.get('claude') ?? 0;
        expect(claudeScore).toBe(-10); // avoid delta * confidence 1.0
      }
    });

    it('scales delta by confidence', async () => {
      const rules = [makeRule({ action: 'penalize', confidence: 0.5 })];
      const stage = new DistilledRuleStage(createMockDistiller(rules));
      const ctx = createContext(
        'test task',
        ['claude', 'gemini'],
        ['task-category:code_generation']
      );

      const result = await stage.route(ctx);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const claudeScore = result.value.context.scores.get('claude') ?? 0;
        expect(claudeScore).toBeCloseTo(-2.5); // -5 * 0.5
      }
    });

    describe('penalty scales with effect, damped by support (#5004 finding 3)', () => {
      const scoped = { taskCategory: 'code_generation' };

      it('penalises a 1.0 failure rate harder than 0.625 at the same sample size', async () => {
        // Both 40 observations, both `penalize`: the ONLY difference is how far
        // past the 0.6 threshold each metric sits. Sample-size-only confidence
        // gave these an identical delta.
        const a = makeMeasuredRule({ id: 'a', cli: 'claude', observationCount: 40, metric: 0.625 });
        const b = makeMeasuredRule({ id: 'b', cli: 'gemini', observationCount: 40, metric: 1.0 });
        const stage = new DistilledRuleStage(createMockDistiller([a, b]), { penaltyDelta: -5 });

        const result = await stage.route(createContext('t', ['claude', 'gemini'], [], scoped));
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        const deltaA = result.value.context.scores.get('claude') ?? 0;
        const deltaB = result.value.context.scores.get('gemini') ?? 0;
        expect(deltaB).toBeLessThan(deltaA);
        // effect(1.0) = 1, so B's magnitude is the support alone.
        expect(deltaB).toBeCloseTo(-5 * sigmoidConfidence(40), 10);
        expect(deltaA).toBeCloseTo(-5 * sigmoidConfidence(40) * 0.0625, 10);
      });

      it('holds across the real distiller seam, where 1.0 escalates to avoid', async () => {
        const distiller = distillerFrom([
          { cli: 'claude', failures: 25, successes: 15 },
          { cli: 'gemini', failures: 40, successes: 0 },
        ]);
        const stage = new DistilledRuleStage(distiller, { penaltyDelta: -5, avoidDelta: -10 });

        const result = await stage.route(createContext('t', ['claude', 'gemini'], [], scoped));
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        const deltaA = result.value.context.scores.get('claude') ?? 0;
        const deltaB = result.value.context.scores.get('gemini') ?? 0;
        expect(deltaB).toBeLessThan(deltaA);
        expect(deltaB).toBeCloseTo(-10 * sigmoidConfidence(40), 10);
        // Previously -5 × sigmoid(40) ≈ -4.4; barely-past-threshold is now ≈ -0.275.
        expect(deltaA).toBeCloseTo(-5 * sigmoidConfidence(40) * 0.0625, 10);
      });

      it('keeps a 6/6 failure small — support bounds a perfect but thin signal', async () => {
        const distiller = distillerFrom([{ cli: 'claude', failures: 6, successes: 0 }]);
        const stage = new DistilledRuleStage(distiller);

        const result = await stage.route(createContext('t', ['claude', 'gemini'], [], scoped));
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        const delta = result.value.context.scores.get('claude') ?? 0;
        expect(delta).toBeLessThan(0);
        expect(Math.abs(delta)).toBeLessThan(0.1);
      });

      it('contributes 0 for a rule exactly at its threshold', async () => {
        // 24/40 = 0.6: detected (>=) and active, but effect is 0.
        const distiller = distillerFrom([{ cli: 'claude', failures: 24, successes: 16 }]);
        const rule = distiller.getRules('active')[0];
        expect(rule?.effect).toBe(0);
        const stage = new DistilledRuleStage(distiller);

        const result = await stage.route(createContext('t', ['claude', 'gemini'], [], scoped));
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        expect(result.value.context.scores.get('claude')).toBe(0);
        // The rule was applied — it just carried no weight.
        expect(result.value.context.signals).toContain(
          'distilled-rule:applied=failure-rate:claude:code_generation'
        );
      });
    });

    it('adds signals for applied rules', async () => {
      const rules = [makeRule()];
      const stage = new DistilledRuleStage(createMockDistiller(rules));
      const ctx = createContext(
        'test task',
        ['claude', 'gemini'],
        ['task-category:code_generation']
      );

      const result = await stage.route(ctx);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const ruleSignals = result.value.context.signals.filter((s) =>
          s.startsWith('distilled-rule:')
        );
        expect(ruleSignals.length).toBeGreaterThan(0);
      }
    });

    it('continues pipeline after applying rules', async () => {
      const rules = [makeRule()];
      const stage = new DistilledRuleStage(createMockDistiller(rules));
      const ctx = createContext(
        'test task',
        ['claude', 'gemini'],
        ['task-category:code_generation']
      );

      const result = await stage.route(ctx);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.continuesPipeline).toBe(true);
      }
    });
  });

  describe('recordOutcome', () => {
    it('forwards to distiller onOutcome', () => {
      const distiller = createMockDistiller();
      const stage = new DistilledRuleStage(distiller);

      stage.recordOutcome({
        selectedCli: 'claude',
        task: 'test',
        success: true,
      });

      expect(distiller.onOutcome).toHaveBeenCalled();
    });
  });

  describe('getStats', () => {
    it('returns stats with applied count and rule count', () => {
      const rules = [makeRule()];
      const stage = new DistilledRuleStage(createMockDistiller(rules));
      const stats = stage.getStats();

      expect(stats['rulesAppliedCount']).toBe(0);
      expect(stats['activeRuleCount']).toBe(1);
      expect(stats['totalRules']).toBe(1);
    });
  });

  describe('createDistilledRuleStage factory', () => {
    it('creates an instance', () => {
      const stage = createDistilledRuleStage(createMockDistiller());
      expect(stage).toBeInstanceOf(DistilledRuleStage);
    });
  });
});

// ============================================================================
// Category scoping (#4832 / #4866)
// ============================================================================

describe('rules are scoped to the category they were learned for (#4832)', () => {
  // Rules are grouped and fingerprinted by `(cli, category)` in the distiller,
  // so a rule means "penalize claude ON code_generation". Every rule was being
  // applied to every task regardless, because the category was read from a
  // `task-category:` signal nothing emits.

  it('applies a rule whose category matches the task', async () => {
    const stage = new DistilledRuleStage(createMockDistiller([makeRule()]));

    const result = await stage.route(
      createContext('write a function', ['claude'], [], { taskCategory: 'code_generation' })
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.value.context.signals.some((sig) => sig.startsWith('distilled-rule:applied='))
    ).toBe(true);
  });

  it('does NOT apply a rule from a different category', async () => {
    // The behaviour the whole issue is about. Nothing asserted this before.
    const stage = new DistilledRuleStage(createMockDistiller([makeRule()]));

    const result = await stage.route(
      createContext('write the README', ['claude'], [], { taskCategory: 'documentation' })
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.value.context.signals.some((sig) => sig.startsWith('distilled-rule:applied='))
    ).toBe(false);
  });

  it('rejects a category outside the TaskCategory vocabulary', async () => {
    // The trap: `capability:task-` emits `code` / `reasoning` / `creative` /
    // `general`, which share NO values with the `TASK_CATEGORIES` a rule
    // carries. Wiring that producer in would match nothing and silently take
    // the whole distillation loop dark. Anything off-vocabulary must be
    // treated as unknown, not as a category that simply matches no rule.
    const stage = new DistilledRuleStage(createMockDistiller([makeRule()]));

    const result = await stage.route(
      createContext('write a function', ['claude'], [], { taskCategory: 'code' })
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.context.signals.includes('distilled-rule:category-unknown')).toBe(true);
  });

  it('applies every matching-CLI rule when the category is unknown, and says so', async () => {
    // Preserves today's behaviour for undetectable tasks rather than silently
    // dropping all rules — but the record now states that the check did not
    // run, so an unscoped application is not mistaken for a scoped one.
    const stage = new DistilledRuleStage(createMockDistiller([makeRule()]));

    const result = await stage.route(createContext('zzz', ['claude'], []));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { signals } = result.value.context;
    expect(signals.some((sig) => sig.startsWith('distilled-rule:applied='))).toBe(true);
    expect(signals).toContain('distilled-rule:category-unknown');
  });
});
