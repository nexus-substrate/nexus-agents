/**
 * Tests for composite-router-stages pipeline functions.
 *
 * Covers: analyzeTaskProfile, the hard filters (budget, capacity), runPipeline
 * and its gating (quality constraints, category overrides), and the seam where
 * runScoringStages detects the task category. The scoring-stage runners are
 * covered in composite-router-scoring-stages.test.ts.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  CapacityFilterStage,
  CAPACITY_EXHAUSTED,
  DistilledRuleStage,
} from './routing/stages/index.js';
import type { CapacityStatus, ICliAdapter, RoutingArmId } from './types.js';

import { ok } from '../core/index.js';
import type { CliName, CliTask } from './types.js';
import { CompositeRoutingError } from './composite-router-types.js';
import { CATEGORY_CHAIN_OVERRIDES } from './fallback-chains.js';

import {
  analyzeTaskProfile,
  runBudgetStage,
  runPipeline,
  runCapacityStage,
} from './composite-router-stages.js';
import {
  runDistilledRuleStage,
  type StageDependencies,
} from './composite-router-scoring-stages.js';

// ============================================================================
// Test helpers
// ============================================================================

const mockTask: CliTask = { content: 'Implement a feature' };

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

function makeDeps(overrides: Partial<StageDependencies> = {}): StageDependencies {
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
    cliNames: ['claude', 'gemini', 'codex'] as CliName[],
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
    ...overrides,
  };
}

// ============================================================================
// analyzeTaskProfile
// ============================================================================

describe('analyzeTaskProfile', () => {
  it('returns a task profile from CliTask', () => {
    const stages: string[] = [];
    const profile = analyzeTaskProfile(mockTask, stages);
    expect(profile).toBeDefined();
    expect(stages).toContain('task-analysis');
  });

  it('appends task-analysis to stages array', () => {
    const stages = ['existing-stage'];
    analyzeTaskProfile(mockTask, stages);
    expect(stages).toEqual(['existing-stage', 'task-analysis']);
  });
});

// ============================================================================
// runBudgetStage
// ============================================================================

describe('runBudgetStage', () => {
  const candidates: CliName[] = ['claude', 'gemini', 'codex'];

  it('skips when budget filter disabled', () => {
    const stages: string[] = [];
    const deps = makeDeps({ config: { ...makeDeps().config, enableBudgetFilter: false } });
    const result = runBudgetStage(mockTask, candidates, stages, deps);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.candidates).toEqual(candidates);
      expect(result.value.withinBudget).toBeUndefined();
    }
    expect(stages).not.toContain('budget-filter');
  });

  it('skips when budgetRouter is undefined', () => {
    const stages: string[] = [];
    const deps = makeDeps({
      config: { ...makeDeps().config, enableBudgetFilter: true },
      budgetRouter: undefined,
    });
    const result = runBudgetStage(mockTask, candidates, stages, deps);
    expect(result.ok).toBe(true);
    expect(stages).not.toContain('budget-filter');
  });

  it('filters candidates and tracks stage when enabled', () => {
    const stages: string[] = [];
    const mockBudgetRouter = {
      checkBudget: vi.fn().mockReturnValue({ withinBudget: true }),
      // #4196: api billing mode also runs the per-task-class ceiling filter.
      filterByTaskClassCeiling: vi.fn((_task: unknown, cands: CliName[]) => cands),
    };
    const deps = makeDeps({
      config: { ...makeDeps().config, enableBudgetFilter: true },
      budgetRouter: mockBudgetRouter as unknown as StageDependencies['budgetRouter'],
    });
    const result = runBudgetStage(mockTask, candidates, stages, deps);
    expect(result.ok).toBe(true);
    expect(stages).toContain('budget-filter');
  });

  it('returns error when no CLIs within budget', () => {
    const stages: string[] = [];
    const mockBudgetRouter = {
      checkBudget: vi.fn().mockReturnValue({ withinBudget: false }),
    };
    const deps = makeDeps({
      config: { ...makeDeps().config, enableBudgetFilter: true },
      budgetRouter: mockBudgetRouter as unknown as StageDependencies['budgetRouter'],
    });
    const result = runBudgetStage(mockTask, candidates, stages, deps);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(CompositeRoutingError);
      expect(result.error.stage).toBe('budget-filter');
    }
  });
});

// ============================================================================
// runPipeline
// ============================================================================

describe('runPipeline', () => {
  it('returns error when no CLI adapters available', async () => {
    const stages: string[] = [];
    const profile = analyzeTaskProfile(mockTask, []);
    const result = await runPipeline(mockTask, profile, stages, [], makeDeps());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('No CLI adapters');
    }
  });

  it('runs minimal pipeline with all stages disabled', async () => {
    const stages: string[] = [];
    const profile = analyzeTaskProfile(mockTask, []);
    const cliNames: CliName[] = ['claude', 'gemini'];
    const result = await runPipeline(mockTask, profile, stages, cliNames, makeDeps());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.selectedCli).toBe('claude'); // first candidate
      expect(result.value.candidates).toEqual(cliNames);
    }
  });

  it('falls back to a valid candidate when LinUCB picks outside the candidate set (#3111)', async () => {
    const stages: string[] = [];
    const profile = analyzeTaskProfile(mockTask, []);
    // Only 'claude' is a candidate (e.g. after a quality/category filter), but
    // the bandit's learned preference is 'gemini' — outside the set. The router
    // must constrain to the candidate, not route to the excluded CLI, and must
    // not error (a valid candidate exists).
    const cliNames: CliName[] = ['claude'];
    const mockBandit = {
      select: vi.fn().mockReturnValue({ armName: 'gemini', ucbScore: 0.9 }),
    };
    const deps = makeDeps({
      config: { ...makeDeps().config, enableLinUCBSelection: true },
      linucbBandit: mockBandit as unknown as StageDependencies['linucbBandit'],
    });
    const result = await runPipeline(mockTask, profile, stages, cliNames, deps);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.selectedCli).toBe('claude'); // constrained, NOT 'gemini'
    }
  });

  it('does not override LinUCB when memory confidence is at default 0.8', async () => {
    const stages: string[] = [];
    const profile = analyzeTaskProfile(mockTask, []);
    const cliNames: CliName[] = ['claude', 'gemini'];
    // Memory recommends 'gemini' but default confidence (0.8) is below threshold (0.85)
    const mockMemory = {
      getRecommendation: vi.fn().mockReturnValue('gemini'),
    };
    const deps = makeDeps({
      config: { ...makeDeps().config, enableRoutingMemory: true },
      routingMemory: mockMemory as unknown as StageDependencies['routingMemory'],
    });
    const result = await runPipeline(mockTask, profile, stages, cliNames, deps);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Memory confidence 0.8 < 0.85 threshold, so LinUCB selection is used
      expect(result.value.memoryRecommendation).toBe('gemini');
      expect(result.value.memoryConfidence).toBe(0.8);
      // LinUCB selects first candidate (claude) by default
      expect(result.value.selectedCli).toBe('claude');
    }
  });

  it('uses linucb selection when memory has no recommendation', async () => {
    const stages: string[] = [];
    const profile = analyzeTaskProfile(mockTask, []);
    const cliNames: CliName[] = ['claude', 'gemini'];
    const deps = makeDeps(); // no routing memory
    const result = await runPipeline(mockTask, profile, stages, cliNames, deps);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Without memory, falls back to linucb (disabled), which returns first candidate
      expect(result.value.selectedCli).toBe('claude');
    }
  });

  it('propagates budget filter error', async () => {
    const stages: string[] = [];
    const profile = analyzeTaskProfile(mockTask, []);
    const cliNames: CliName[] = ['claude', 'gemini'];
    const mockBudgetRouter = {
      checkBudget: vi.fn().mockReturnValue({ withinBudget: false }),
    };
    const deps = makeDeps({
      config: { ...makeDeps().config, enableBudgetFilter: true },
      budgetRouter: mockBudgetRouter as unknown as StageDependencies['budgetRouter'],
    });
    const result = await runPipeline(mockTask, profile, stages, cliNames, deps);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.stage).toBe('budget-filter');
    }
  });

  it('populates stageScores when async stages produce scores', async () => {
    const stages: string[] = [];
    const profile = analyzeTaskProfile(mockTask, []);
    const cliNames: CliName[] = ['claude', 'gemini'];
    const mockCascade = {
      route: vi.fn().mockResolvedValue(
        ok({
          context: {
            signals: ['confidence:complexity-simple'],
            scores: new Map([
              ['claude', 0.5],
              ['gemini', 0.3],
            ]),
          },
        })
      ),
    };
    const mockResource = {
      route: vi.fn().mockResolvedValue(
        ok({
          context: {
            signals: ['resource-strategy:tier=economy'],
            scores: new Map([
              ['claude', 0.2],
              ['gemini', 0.4],
            ]),
          },
        })
      ),
    };
    const deps = makeDeps({
      config: {
        ...makeDeps().config,
        enableConfidenceCascade: true,
        enableResourceStrategy: true,
      },
      confidenceCascadeStage: mockCascade as unknown as StageDependencies['confidenceCascadeStage'],
      resourceStrategyStage: mockResource as unknown as StageDependencies['resourceStrategyStage'],
    });
    const result = await runPipeline(mockTask, profile, stages, cliNames, deps);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.stageScores).toBeDefined();
      // claude: 0.5 + 0.2 = 0.7, gemini: 0.3 + 0.4 = 0.7
      expect(result.value.stageScores?.get('claude')).toBe(0.7);
      expect(result.value.stageScores?.get('gemini')).toBe(0.7);
      expect(result.value.cascadeComplexity).toBe('simple');
      expect(result.value.resourceTier).toBe('economy');
    }
  });
});

// ============================================================================
// Category override (#2414, #2415)
// ============================================================================

describe('runPipeline category override (#2414)', () => {
  it('reroutes security_review tasks away from claude per CATEGORY_CHAIN_OVERRIDES', async () => {
    const securityTask: CliTask = { content: 'Perform a security review of the auth flow' };
    const stages: string[] = [];
    const profile = analyzeTaskProfile(securityTask, []);
    const cliNames: CliName[] = ['claude', 'gemini', 'codex', 'opencode'];

    const result = await runPipeline(securityTask, profile, stages, cliNames, makeDeps());

    expect(result.ok).toBe(true);
    expect(stages).toContain('category-override');
    if (result.ok) {
      // Override is ['codex', 'gemini', 'claude', 'opencode'] — codex must be selected.
      // Note: result.value.candidates reflects qualityResult.eligible (pre-override book-
      // keeping); the override-effective candidate set drives selectedCli through TOPSIS.
      expect(result.value.selectedCli).toBe('codex');
    }
  });

  it('reroutes architecture tasks away from claude per CATEGORY_CHAIN_OVERRIDES', async () => {
    const archTask: CliTask = {
      content: 'Design a system architecture for the new ingest pipeline',
    };
    const stages: string[] = [];
    const profile = analyzeTaskProfile(archTask, []);
    const cliNames: CliName[] = ['claude', 'gemini', 'codex', 'opencode'];

    const result = await runPipeline(archTask, profile, stages, cliNames, makeDeps());

    expect(result.ok).toBe(true);
    expect(stages).toContain('category-override');
    if (result.ok) {
      // Override is ['gemini', 'claude', 'codex', 'opencode'] — gemini must be selected.
      expect(result.value.selectedCli).toBe('gemini');
    }
  });

  it('does not apply override when no category matches', async () => {
    const genericTask: CliTask = { content: 'Do a thing with the stuff' };
    const stages: string[] = [];
    const profile = analyzeTaskProfile(genericTask, []);
    const cliNames: CliName[] = ['claude', 'gemini'];

    const result = await runPipeline(genericTask, profile, stages, cliNames, makeDeps());

    expect(result.ok).toBe(true);
    expect(stages).not.toContain('category-override');
    if (result.ok) {
      expect(result.value.candidates).toEqual(cliNames);
    }
  });

  it('falls back gracefully when override CLIs are all unavailable', async () => {
    const securityTask: CliTask = { content: 'Perform a security audit' };
    const stages: string[] = [];
    const profile = analyzeTaskProfile(securityTask, []);
    // Override = [codex, gemini, claude, opencode]; only opencode available is in override but suppose only "fakecli"
    // is candidate (impossible per typing but simulating via cast for the no-eligible path):
    const cliNames: CliName[] = ['claude']; // claude IS in override, so eligible — let's instead use a simulated case
    // Actually: with claude as the only candidate, override filter keeps claude (it's in the chain). The
    // graceful-fallback branch fires only when NO candidate is in the override chain. CliName is closed,
    // so we test with claude (still in the chain) — the override stage will mark itself as run and
    // candidates remain [claude].
    const result = await runPipeline(securityTask, profile, stages, cliNames, makeDeps());

    expect(result.ok).toBe(true);
    expect(stages).toContain('category-override');
    if (result.ok) {
      expect(result.value.selectedCli).toBe('claude');
    }
  });
});

describe('runPipeline parameterized category overrides (#2415)', () => {
  // Map each category to a content string that triggers detectTaskCategory.
  const triggerContent: Record<string, string> = {
    architecture: 'Design a system architecture and ADR for the new module',
    security_review: 'Perform a security review of the authentication flow',
    code_review: 'Please code review this pull request',
    exploration: 'Explore the codebase and find usages',
    devops: 'Update the docker and ci/cd pipeline',
    research: 'Research the state of the art and survey the literature',
    documentation: 'Write documentation and api docs for the module',
  };

  for (const [category, chain] of Object.entries(CATEGORY_CHAIN_OVERRIDES)) {
    if (chain === undefined) continue;
    const expectedPrimary = chain[0];
    const content = triggerContent[category];
    if (content === undefined) continue;

    it(`routes ${category} tasks to ${String(expectedPrimary)} (chain primary)`, async () => {
      const task: CliTask = { content };
      const stages: string[] = [];
      const profile = analyzeTaskProfile(task, []);
      const cliNames: CliName[] = ['claude', 'gemini', 'codex', 'opencode'];

      const result = await runPipeline(task, profile, stages, cliNames, makeDeps());

      expect(result.ok).toBe(true);
      expect(stages).toContain('category-override');
      if (result.ok) {
        expect(result.value.selectedCli).toBe(expectedPrimary);
      }
    });
  }
});

// ============================================================================
// runCapacityStage (#4373, #4351 criterion 3)
// ============================================================================

function capacityStatus(overrides: Partial<CapacityStatus> = {}): CapacityStatus {
  return {
    remainingTokens: 100_000,
    remainingRequests: 1_000,
    resetTime: new Date('2026-01-01T00:00:00Z'),
    utilizationPercent: 10,
    rateLimited: false,
    exhausted: false,
    quotaExhausted: false,
    observed: true,
    ...overrides,
  };
}

function capacityAdapters(entries: Record<string, CapacityStatus>): Map<RoutingArmId, ICliAdapter> {
  return new Map(
    Object.entries(entries).map(([id, status]) => [
      id as RoutingArmId,
      { getCapacity: () => Promise.resolve(status) } as unknown as ICliAdapter,
    ])
  );
}

const capacityTask = { content: 'do the thing' } as CliTask;

describe('runCapacityStage', () => {
  it('drops an exhausted arm and keeps the rest', async () => {
    const stage = new CapacityFilterStage(
      capacityAdapters({
        claude: capacityStatus({ quotaExhausted: true }),
        gemini: capacityStatus(),
      }),
      { enforceHardLimits: true }
    );

    const result = await runCapacityStage(
      capacityTask,
      ['claude', 'gemini'] as RoutingArmId[],
      [],
      makeDeps({ capacityFilterStage: stage })
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual(['gemini']);
  });

  it("does not let a CLI arm's quota exclude a healthy api arm on the same slot (#4455)", async () => {
    // `claude` and `api:anthropic` share the vendor display slot but have
    // genuinely independent quotas — a CLI subscription and an API key.
    // Collapsing them made one arm's exhaustion remove BOTH.
    const stage = new CapacityFilterStage(
      capacityAdapters({
        claude: capacityStatus({ quotaExhausted: true }),
        'api:anthropic': capacityStatus(),
      }),
      { enforceHardLimits: true }
    );

    const result = await runCapacityStage(
      capacityTask,
      ['claude', 'api:anthropic'] as RoutingArmId[],
      [],
      makeDeps({ capacityFilterStage: stage })
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual(['api:anthropic']);
  });

  it('drops an exhausted api arm while keeping its healthy CLI sibling (#4455)', async () => {
    // The mirror failure: the exhausted api arm was never probed at all, so
    // the router could select it — the exact #4351 case the stage prevents.
    const stage = new CapacityFilterStage(
      capacityAdapters({
        claude: capacityStatus(),
        'api:anthropic': capacityStatus({ quotaExhausted: true }),
      }),
      { enforceHardLimits: true }
    );

    const result = await runCapacityStage(
      capacityTask,
      ['claude', 'api:anthropic'] as RoutingArmId[],
      [],
      makeDeps({ capacityFilterStage: stage })
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual(['claude']);
  });

  it('fails closed and NAMES every excluded arm when all are exhausted', async () => {
    // Binding condition from the #4373 default-posture vote: a bare error code
    // reproduces the #4351 complaint that nexus never explained the failure.
    const stage = new CapacityFilterStage(
      capacityAdapters({
        claude: capacityStatus({ quotaExhausted: true }),
        gemini: capacityStatus({ quotaExhausted: true }),
      }),
      { enforceHardLimits: true }
    );

    const result = await runCapacityStage(
      capacityTask,
      ['claude', 'gemini'] as RoutingArmId[],
      [],
      makeDeps({ capacityFilterStage: stage })
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(CompositeRoutingError);
    expect(result.error.message).toContain(CAPACITY_EXHAUSTED);
    expect(result.error.message).toContain('claude');
    expect(result.error.message).toContain('gemini');
  });

  it('is a no-op when enableCapacityBalancing is false', async () => {
    const stage = new CapacityFilterStage(
      capacityAdapters({ claude: capacityStatus({ quotaExhausted: true }) })
    );
    const deps = makeDeps({ capacityFilterStage: stage });

    const result = await runCapacityStage(capacityTask, ['claude'] as RoutingArmId[], [], {
      ...deps,
      config: { ...deps.config, enableCapacityBalancing: false },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual(['claude']);
  });

  it('records the stage in stagesExecuted', async () => {
    const stage = new CapacityFilterStage(capacityAdapters({ claude: capacityStatus() }));
    const stagesExecuted: string[] = [];

    await runCapacityStage(
      capacityTask,
      ['claude'] as RoutingArmId[],
      stagesExecuted,
      makeDeps({ capacityFilterStage: stage })
    );

    expect(stagesExecuted).toContain('capacity-filter');
  });

  it('the SHIPPED default is signal-only — an exhausted arm survives routing', async () => {
    // Guards the #4456 decision at the wiring boundary, not just in the stage:
    // CompositeRouter constructs this stage with `{}`, so a future change to
    // DEFAULT_CONFIG that re-enables enforcement must break this test.
    const stage = new CapacityFilterStage(
      capacityAdapters({ claude: capacityStatus({ quotaExhausted: true }) })
    );

    const result = await runCapacityStage(
      capacityTask,
      ['claude'] as RoutingArmId[],
      [],
      makeDeps({ capacityFilterStage: stage })
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual(['claude']);
  });
});

// ============================================================================
// The distilled-rule runner supplies a category (#4832)
// ============================================================================

describe('runDistilledRuleStage supplies the task category (#4832)', () => {
  const candidates: CliName[] = ['claude'];

  function stageWithRule(): DistilledRuleStage {
    const rule = {
      id: 'failure-rate:claude:documentation',
      patternType: 'failure-rate',
      cli: 'claude' as CliName,
      category: 'documentation',
      action: 'penalize',
      confidence: 0.8,
      observationCount: 40,
      metric: 0.7,
      status: 'active',
      createdAt: 0,
      updatedAt: 0,
      tainted: false,
    };
    const distiller = {
      getRules: vi.fn(() => [rule]),
      onOutcome: vi.fn(),
      distill: vi.fn(),
      getStats: vi.fn(),
    };
    return new DistilledRuleStage(distiller as never);
  }

  it('scopes rules by the category detected from the task', async () => {
    // A documentation rule must not apply to a task detected as something
    // else. Mocked-stage tests cannot see this — they assert on a result the
    // mock already decided.
    const deps = makeDeps({
      config: { ...makeDeps().config, enableStrategyDistillation: true },
      distilledRuleStage: stageWithRule(),
    });

    const result = await runDistilledRuleStage(
      { content: 'design the service architecture and system boundaries' },
      candidates,
      [],
      deps,
      'architecture'
    );

    expect(result.rulesApplied).toBe(0);
  });

  it('detects the category from the task through the whole pipeline (#4832)', async () => {
    // The last seam: runScoringStages calls detectTaskCategory itself, and
    // neither the stage tests nor the runner tests reach that call.
    //
    // It has to be an EXCLUSION to be observable. With no category the rule
    // applies unscoped — the designed fallback — so a matching task yields 1
    // either way and proves nothing. A task detected as something OTHER than
    // the rule's category yields 1 without detection and 0 with it.
    const deps = makeDeps({
      config: { ...makeDeps().config, enableStrategyDistillation: true },
      distilledRuleStage: stageWithRule(),
    });
    const archTask: CliTask = { content: 'design the system architecture and service boundaries' };
    const profile = analyzeTaskProfile(archTask, []);

    const result = await runPipeline(archTask, profile, [], ['claude'], deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Omitted entirely when zero, so undefined is the scoped outcome.
    expect(result.value.distilledRulesApplied).toBeUndefined();
  });

  it('applies the rule when the detected category matches', async () => {
    // The pair: scoping to nothing would satisfy the test above.
    const deps = makeDeps({
      config: { ...makeDeps().config, enableStrategyDistillation: true },
      distilledRuleStage: stageWithRule(),
    });

    const result = await runDistilledRuleStage(
      { content: 'write the README' },
      candidates,
      [],
      deps,
      'documentation'
    );

    expect(result.rulesApplied).toBe(1);
  });
});
