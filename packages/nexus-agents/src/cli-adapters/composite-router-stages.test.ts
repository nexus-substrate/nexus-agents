/**
 * Tests for composite-router-stages pipeline functions.
 *
 * Covers: individual stage functions, runPipeline, inferTaskTypeFromContent
 */

import { describe, expect, it, vi } from 'vitest';

import { ok } from '../core/index.js';
import type { CliName, CliTask } from './types.js';
import { CompositeRoutingError } from './composite-router-types.js';

import {
  analyzeTaskProfile,
  runBudgetStage,
  runConfidenceCascadeStageSync,
  runCapabilityMatchStageSync,
  runQualityConstraintStageSync,
  runResourceStrategyStageSync,
  runDistilledRuleStageSync,
  runZeroRouterStage,
  runTopsisStage,
  runLinUCBStage,
  runPreferenceStage,
  runLatencyStage,
  runRoutingMemoryStage,
  runPipeline,
  type StageDependencies,
} from './composite-router-stages.js';

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
      enableCapacityBalancing: true,
      billingMode: 'api',
      latencyScoreWeight: 0.2,
      linucbAlpha: 1.0,
      maxDecisionTimeMs: 50,
      preferenceMinDataPoints: 10,
    },
    logger: mockLogger as unknown as StageDependencies['logger'],
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
// runConfidenceCascadeStageSync
// ============================================================================

describe('runConfidenceCascadeStageSync', () => {
  const candidates: CliName[] = ['claude', 'gemini'];

  it('returns defaults when disabled', () => {
    const stages: string[] = [];
    const deps = makeDeps();
    const result = runConfidenceCascadeStageSync(mockTask, candidates, stages, deps);
    expect(result.scores.size).toBe(0);
    expect(result.complexity).toBe('moderate');
    expect(result.shouldEscalate).toBe(false);
    expect(stages).not.toContain('confidence-cascade');
  });

  it('returns defaults when stage instance is undefined', () => {
    const stages: string[] = [];
    const deps = makeDeps({
      config: { ...makeDeps().config, enableConfidenceCascade: true },
      confidenceCascadeStage: undefined,
    });
    const result = runConfidenceCascadeStageSync(mockTask, candidates, stages, deps);
    expect(result.scores.size).toBe(0);
    expect(stages).not.toContain('confidence-cascade');
  });

  it('tracks stage when enabled and instance present', () => {
    const stages: string[] = [];
    const mockStage = {
      route: vi.fn().mockResolvedValue(ok({ context: { signals: [] } })),
    };
    const deps = makeDeps({
      config: { ...makeDeps().config, enableConfidenceCascade: true },
      confidenceCascadeStage: mockStage as unknown as StageDependencies['confidenceCascadeStage'],
    });
    const result = runConfidenceCascadeStageSync(mockTask, candidates, stages, deps);
    expect(stages).toContain('confidence-cascade');
    // Returns defaults since async result not yet available
    expect(result.complexity).toBe('moderate');
  });
});

// ============================================================================
// runCapabilityMatchStageSync
// ============================================================================

describe('runCapabilityMatchStageSync', () => {
  const candidates: CliName[] = ['claude', 'gemini'];

  it('returns defaults when disabled', () => {
    const stages: string[] = [];
    const result = runCapabilityMatchStageSync(mockTask, candidates, stages, makeDeps());
    expect(result.scores.size).toBe(0);
    expect(result.taskType).toBe('general');
    expect(result.bestCli).toBeUndefined();
    expect(stages).not.toContain('capability-match');
  });

  it('tracks stage when enabled and instance present', () => {
    const stages: string[] = [];
    const mockStage = {
      route: vi.fn().mockResolvedValue(ok({ context: { signals: [] } })),
    };
    const deps = makeDeps({
      config: { ...makeDeps().config, enableCapabilityMatch: true },
      capabilityMatchStage: mockStage as unknown as StageDependencies['capabilityMatchStage'],
    });
    runCapabilityMatchStageSync(mockTask, candidates, stages, deps);
    expect(stages).toContain('capability-match');
  });
});

// ============================================================================
// runQualityConstraintStageSync
// ============================================================================

describe('runQualityConstraintStageSync', () => {
  const candidates: CliName[] = ['claude', 'gemini', 'codex'];

  it('returns all candidates as eligible when disabled', () => {
    const stages: string[] = [];
    const result = runQualityConstraintStageSync(candidates, stages, makeDeps());
    expect(result.eligible).toEqual(candidates);
    expect(result.filtered.size).toBe(0);
    expect(result.usedFallback).toBe(false);
    expect(stages).not.toContain('quality-constraint');
  });

  it('tracks stage when enabled and instance present', () => {
    const stages: string[] = [];
    const mockStage = {
      route: vi.fn().mockResolvedValue(
        ok({
          context: {
            signals: [],
            filtered: new Map(),
            availableClis: ['claude', 'gemini', 'codex'],
          },
        })
      ),
    };
    const deps = makeDeps({
      config: { ...makeDeps().config, enableQualityConstraint: true },
      qualityConstraintStage: mockStage as unknown as StageDependencies['qualityConstraintStage'],
    });
    runQualityConstraintStageSync(candidates, stages, deps);
    expect(stages).toContain('quality-constraint');
  });
});

// ============================================================================
// runResourceStrategyStageSync
// ============================================================================

describe('runResourceStrategyStageSync', () => {
  const candidates: CliName[] = ['claude', 'gemini', 'codex'];

  it('returns defaults when disabled', () => {
    const stages: string[] = [];
    const result = runResourceStrategyStageSync(mockTask, candidates, stages, makeDeps());
    expect(result.tier).toBe('balanced');
    expect(result.resourceLevel).toBeUndefined();
    expect(stages).not.toContain('resource-strategy');
  });

  it('returns defaults when stage instance is undefined', () => {
    const stages: string[] = [];
    const deps = makeDeps({
      config: { ...makeDeps().config, enableResourceStrategy: true },
      resourceStrategyStage: undefined,
    });
    const result = runResourceStrategyStageSync(mockTask, candidates, stages, deps);
    expect(result.tier).toBe('balanced');
    expect(stages).not.toContain('resource-strategy');
  });

  it('tracks stage when enabled and instance present', () => {
    const stages: string[] = [];
    const mockStage = {
      route: vi.fn().mockResolvedValue(ok({ context: { signals: [] } })),
    };
    const deps = makeDeps({
      config: { ...makeDeps().config, enableResourceStrategy: true },
      resourceStrategyStage: mockStage as unknown as StageDependencies['resourceStrategyStage'],
    });
    const result = runResourceStrategyStageSync(mockTask, candidates, stages, deps);
    expect(stages).toContain('resource-strategy');
    expect(result.tier).toBe('balanced');
  });
});

// ============================================================================
// runDistilledRuleStageSync
// ============================================================================

describe('runDistilledRuleStageSync', () => {
  const candidates: CliName[] = ['claude', 'gemini', 'codex'];

  it('returns defaults when disabled', () => {
    const stages: string[] = [];
    const result = runDistilledRuleStageSync(mockTask, candidates, stages, makeDeps());
    expect(result.rulesApplied).toBe(0);
    expect(stages).not.toContain('distilled-rule');
  });

  it('returns defaults when stage instance is undefined', () => {
    const stages: string[] = [];
    const deps = makeDeps({
      config: { ...makeDeps().config, enableStrategyDistillation: true },
      distilledRuleStage: undefined,
    });
    const result = runDistilledRuleStageSync(mockTask, candidates, stages, deps);
    expect(result.rulesApplied).toBe(0);
    expect(stages).not.toContain('distilled-rule');
  });

  it('tracks stage when enabled and instance present', () => {
    const stages: string[] = [];
    const mockStage = {
      route: vi.fn().mockResolvedValue(ok({ context: { signals: [] } })),
    };
    const deps = makeDeps({
      config: { ...makeDeps().config, enableStrategyDistillation: true },
      distilledRuleStage: mockStage as unknown as StageDependencies['distilledRuleStage'],
    });
    const result = runDistilledRuleStageSync(mockTask, candidates, stages, deps);
    expect(stages).toContain('distilled-rule');
    expect(result.rulesApplied).toBe(0);
  });
});

// ============================================================================
// runZeroRouterStage
// ============================================================================

describe('runZeroRouterStage', () => {
  const candidates: CliName[] = ['claude', 'gemini', 'codex'];

  it('returns default result when disabled', () => {
    const stages: string[] = [];
    const result = runZeroRouterStage(mockTask, candidates, stages, makeDeps());
    expect(result.filteredCandidates).toEqual(candidates);
    expect(stages).not.toContain('zero-router');
  });

  it('returns default result when zeroRouter undefined', () => {
    const stages: string[] = [];
    const deps = makeDeps({
      config: { ...makeDeps().config, enableZeroRouter: true },
      zeroRouter: undefined,
    });
    const result = runZeroRouterStage(mockTask, candidates, stages, deps);
    expect(result.filteredCandidates).toEqual(candidates);
  });
});

// ============================================================================
// runTopsisStage
// ============================================================================

describe('runTopsisStage', () => {
  const candidates: CliName[] = ['claude', 'gemini'];

  it('returns candidates unranked when disabled', () => {
    const stages: string[] = [];
    const profile = analyzeTaskProfile(mockTask, []);
    const result = runTopsisStage(profile, candidates, stages, makeDeps());
    expect(result.ranking).toEqual(candidates);
    expect(result.score).toBeUndefined();
    expect(stages).not.toContain('topsis-ranking');
  });

  it('returns candidates unranked when topsisRouter undefined', () => {
    const stages: string[] = [];
    const profile = analyzeTaskProfile(mockTask, []);
    const deps = makeDeps({
      config: { ...makeDeps().config, enableTopsisRanking: true },
      topsisRouter: undefined,
    });
    const result = runTopsisStage(profile, candidates, stages, deps);
    expect(result.ranking).toEqual(candidates);
    expect(result.score).toBeUndefined();
  });
});

// ============================================================================
// runLinUCBStage
// ============================================================================

describe('runLinUCBStage', () => {
  const ranking: CliName[] = ['claude', 'gemini'];

  it('returns first candidate when disabled', () => {
    const stages: string[] = [];
    const profile = analyzeTaskProfile(mockTask, []);
    const result = runLinUCBStage(profile, ranking, stages, makeDeps());
    expect(result.selectedCli).toBe('claude');
    expect(result.ucbScore).toBeUndefined();
    expect(stages).not.toContain('linucb-selection');
  });

  it('returns first candidate when bandit undefined', () => {
    const stages: string[] = [];
    const profile = analyzeTaskProfile(mockTask, []);
    const deps = makeDeps({
      config: { ...makeDeps().config, enableLinUCBSelection: true },
      linucbBandit: undefined,
    });
    const result = runLinUCBStage(profile, ranking, stages, deps);
    expect(result.selectedCli).toBe('claude');
  });

  it('uses bandit selection when enabled', () => {
    const stages: string[] = [];
    const profile = analyzeTaskProfile(mockTask, []);
    const mockBandit = {
      select: vi.fn().mockReturnValue({ armName: 'gemini', ucbScore: 0.85 }),
    };
    const deps = makeDeps({
      config: { ...makeDeps().config, enableLinUCBSelection: true },
      linucbBandit: mockBandit as unknown as StageDependencies['linucbBandit'],
    });
    const result = runLinUCBStage(profile, ranking, stages, deps);
    expect(result.selectedCli).toBe('gemini');
    expect(result.ucbScore).toBe(0.85);
    expect(stages).toContain('linucb-selection');
  });
});

// ============================================================================
// runPreferenceStage
// ============================================================================

describe('runPreferenceStage', () => {
  const candidates: CliName[] = ['claude', 'gemini', 'codex'];

  it('returns defaults when disabled', () => {
    const stages: string[] = [];
    const result = runPreferenceStage(mockTask, candidates, stages, makeDeps());
    expect(result.preferredCandidates).toEqual(candidates);
    expect(result.preferenceScore).toBeUndefined();
    expect(result.preferenceTier).toBeUndefined();
    expect(stages).not.toContain('preference-routing');
  });

  it('returns defaults when preferenceRouter undefined', () => {
    const stages: string[] = [];
    const deps = makeDeps({
      config: { ...makeDeps().config, enablePreferenceRouting: true },
      preferenceRouter: undefined,
    });
    const result = runPreferenceStage(mockTask, candidates, stages, deps);
    expect(result.preferredCandidates).toEqual(candidates);
  });

  it('returns defaults when insufficient data', () => {
    const stages: string[] = [];
    const mockPrefRouter = {
      hasMinimumData: vi.fn().mockReturnValue(false),
    };
    const deps = makeDeps({
      config: { ...makeDeps().config, enablePreferenceRouting: true },
      preferenceRouter: mockPrefRouter as unknown as StageDependencies['preferenceRouter'],
    });
    const result = runPreferenceStage(mockTask, candidates, stages, deps);
    expect(result.preferredCandidates).toEqual(candidates);
    expect(stages).not.toContain('preference-routing');
  });
});

// ============================================================================
// runLatencyStage
// ============================================================================

describe('runLatencyStage', () => {
  const candidates: CliName[] = ['claude', 'gemini'];

  it('returns defaults when disabled', () => {
    const stages: string[] = [];
    const result = runLatencyStage(candidates, stages, makeDeps());
    expect(result.latencyScore).toBeUndefined();
    expect(result.latencyAdjustedRanking).toEqual(candidates);
    expect(stages).not.toContain('latency-scoring');
  });

  it('sorts candidates by latency score when enabled', () => {
    const stages: string[] = [];
    const mockTracker = {
      getScores: vi.fn().mockReturnValue([
        { cli: 'claude', score: 0.7, hasReliableData: true },
        { cli: 'gemini', score: 0.9, hasReliableData: true },
      ]),
    };
    const deps = makeDeps({
      config: { ...makeDeps().config, enableLatencyTracking: true },
      latencyTracker: mockTracker as unknown as StageDependencies['latencyTracker'],
    });
    const result = runLatencyStage(candidates, stages, deps);
    // Gemini has higher score (faster), should be first
    expect(result.latencyAdjustedRanking[0]).toBe('gemini');
    expect(result.latencyScore).toBe(0.9);
    expect(stages).toContain('latency-scoring');
  });
});

// ============================================================================
// runRoutingMemoryStage
// ============================================================================

describe('runRoutingMemoryStage', () => {
  const candidates: CliName[] = ['claude', 'gemini', 'codex'];

  it('returns defaults when disabled', () => {
    const stages: string[] = [];
    const result = runRoutingMemoryStage(mockTask, candidates, stages, makeDeps());
    expect(result.recommendation).toBeUndefined();
    expect(result.memoryConfidence).toBeUndefined();
    expect(stages).not.toContain('routing-memory');
  });

  it('returns recommendation when in candidates', () => {
    const stages: string[] = [];
    const mockMemory = {
      getRecommendation: vi.fn().mockReturnValue('gemini'),
    };
    const deps = makeDeps({
      config: { ...makeDeps().config, enableRoutingMemory: true },
      routingMemory: mockMemory as unknown as StageDependencies['routingMemory'],
    });
    const result = runRoutingMemoryStage(mockTask, candidates, stages, deps);
    expect(result.recommendation).toBe('gemini');
    expect(result.memoryConfidence).toBe(0.8);
    expect(stages).toContain('routing-memory');
  });

  it('returns undefined when recommendation not in candidates', () => {
    const stages: string[] = [];
    const mockMemory = {
      getRecommendation: vi.fn().mockReturnValue('unknown-cli'),
    };
    const deps = makeDeps({
      config: { ...makeDeps().config, enableRoutingMemory: true },
      routingMemory: mockMemory as unknown as StageDependencies['routingMemory'],
    });
    const result = runRoutingMemoryStage(mockTask, candidates, stages, deps);
    expect(result.recommendation).toBeUndefined();
    expect(result.memoryConfidence).toBeUndefined();
  });

  it('infers task type from content keywords', () => {
    const stages: string[] = [];
    const mockMemory = {
      getRecommendation: vi.fn().mockReturnValue('claude'),
    };
    const deps = makeDeps({
      config: { ...makeDeps().config, enableRoutingMemory: true },
      routingMemory: mockMemory as unknown as StageDependencies['routingMemory'],
    });

    // "code" keyword -> should infer "coding"
    runRoutingMemoryStage({ content: 'Write code for API' }, candidates, stages, deps);
    expect(mockMemory.getRecommendation).toHaveBeenCalledWith('coding');

    // "review" keyword -> should infer "review"
    mockMemory.getRecommendation.mockClear();
    runRoutingMemoryStage({ content: 'review the PR' }, candidates, [], deps);
    expect(mockMemory.getRecommendation).toHaveBeenCalledWith('review');

    // "test" keyword -> should infer "testing"
    mockMemory.getRecommendation.mockClear();
    runRoutingMemoryStage({ content: 'Write test suite' }, candidates, [], deps);
    expect(mockMemory.getRecommendation).toHaveBeenCalledWith('testing');

    // "document" keyword -> should infer "documentation"
    mockMemory.getRecommendation.mockClear();
    runRoutingMemoryStage({ content: 'document the API' }, candidates, [], deps);
    expect(mockMemory.getRecommendation).toHaveBeenCalledWith('documentation');

    // "refactor" keyword -> should infer "refactoring"
    mockMemory.getRecommendation.mockClear();
    runRoutingMemoryStage({ content: 'refactor this module' }, candidates, [], deps);
    expect(mockMemory.getRecommendation).toHaveBeenCalledWith('refactoring');

    // "debug" keyword -> should infer "debugging"
    mockMemory.getRecommendation.mockClear();
    runRoutingMemoryStage({ content: 'debug this error' }, candidates, [], deps);
    expect(mockMemory.getRecommendation).toHaveBeenCalledWith('debugging');

    // No keyword -> should infer "general"
    mockMemory.getRecommendation.mockClear();
    runRoutingMemoryStage({ content: 'do something' }, candidates, [], deps);
    expect(mockMemory.getRecommendation).toHaveBeenCalledWith('general');
  });
});

// ============================================================================
// runPipeline
// ============================================================================

describe('runPipeline', () => {
  it('returns error when no CLI adapters available', () => {
    const stages: string[] = [];
    const profile = analyzeTaskProfile(mockTask, []);
    const result = runPipeline(mockTask, profile, stages, [], makeDeps());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('No CLI adapters');
    }
  });

  it('runs minimal pipeline with all stages disabled', () => {
    const stages: string[] = [];
    const profile = analyzeTaskProfile(mockTask, []);
    const cliNames: CliName[] = ['claude', 'gemini'];
    const result = runPipeline(mockTask, profile, stages, cliNames, makeDeps());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.selectedCli).toBe('claude'); // first candidate
      expect(result.value.candidates).toEqual(cliNames);
    }
  });

  it('returns error when LinUCB returns no selection from empty ranking', () => {
    const stages: string[] = [];
    const profile = analyzeTaskProfile(mockTask, []);
    const cliNames: CliName[] = ['claude'];
    // Mock a bandit that returns undefined for selectedCli
    const mockBandit = {
      select: vi.fn().mockReturnValue({ armName: undefined, ucbScore: undefined }),
    };
    const deps = makeDeps({
      config: { ...makeDeps().config, enableLinUCBSelection: true },
      linucbBandit: mockBandit as unknown as StageDependencies['linucbBandit'],
    });
    const result = runPipeline(mockTask, profile, stages, cliNames, deps);
    // LinUCB returned undefined -> "No candidates available" error
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('No candidates');
    }
  });

  it('applies memory recommendation when confidence is high', () => {
    const stages: string[] = [];
    const profile = analyzeTaskProfile(mockTask, []);
    const cliNames: CliName[] = ['claude', 'gemini'];
    // Memory recommends 'gemini' with high confidence
    const mockMemory = {
      getRecommendation: vi.fn().mockReturnValue('gemini'),
    };
    const deps = makeDeps({
      config: { ...makeDeps().config, enableRoutingMemory: true },
      routingMemory: mockMemory as unknown as StageDependencies['routingMemory'],
    });
    const result = runPipeline(mockTask, profile, stages, cliNames, deps);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Memory confidence is 0.8 >= 0.7 threshold, so memory recommendation wins
      expect(result.value.selectedCli).toBe('gemini');
      expect(result.value.memoryRecommendation).toBe('gemini');
      expect(result.value.memoryConfidence).toBe(0.8);
    }
  });

  it('uses linucb selection when memory has no recommendation', () => {
    const stages: string[] = [];
    const profile = analyzeTaskProfile(mockTask, []);
    const cliNames: CliName[] = ['claude', 'gemini'];
    const deps = makeDeps(); // no routing memory
    const result = runPipeline(mockTask, profile, stages, cliNames, deps);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Without memory, falls back to linucb (disabled), which returns first candidate
      expect(result.value.selectedCli).toBe('claude');
    }
  });

  it('propagates budget filter error', () => {
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
    const result = runPipeline(mockTask, profile, stages, cliNames, deps);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.stage).toBe('budget-filter');
    }
  });
});
