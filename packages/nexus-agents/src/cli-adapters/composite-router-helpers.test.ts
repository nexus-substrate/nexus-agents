/**
 * Tests for composite-router-helpers.
 *
 * Covers: adjustProfileForTask, adjustProfileWithStageScores, taskProfileToBanditContext,
 * calculateConfidence, buildReason, filterByPreferenceTier, cliTaskToTask, applyBudgetFilter,
 * applyTopsisRanking, applyPerformanceFloorPenalty, defaultPreferenceStageResult,
 * defaultZeroRouterStageResult, filterByDifficultyTier, applyZeroRouterFilter,
 * buildDifficultyOutcome, buildDecisionFields, buildPreferenceStats.
 */

import { describe, expect, it, vi } from 'vitest';

import type { TaskProfile } from '../core/index.js';
import type { CliName, CliTask, RoutingArmId } from './types.js';
import type { TopsisModelProfile } from './topsis-types.js';
import type {} from './zero-router-types.js';
import {
  adjustProfileForTask,
  adjustProfileWithStageScores,
  taskProfileToBanditContext,
  calculateConfidence,
  buildReason,
  filterByPreferenceTier,
  cliTaskToTask,
  applyBudgetFilter,
  applyTopsisRanking,
  defaultPreferenceStageResult,
  defaultZeroRouterStageResult,
  filterByDifficultyTier,
  applyZeroRouterFilter,
  buildDifficultyOutcome,
  buildDecisionFields,
  buildPreferenceStats,
  applyPerformanceFloorPenalty,
  PLAN_MODE_COST_ANNOTATION,
} from './composite-router-helpers.js';
import {
  applyDifficultyCostWeighting,
  DEFAULT_TOPSIS_CRITERIA,
  PLAN_BILLING_TOPSIS_CRITERIA,
  TASK_CATEGORY_TOPSIS_CRITERIA,
} from './topsis-types.js';

// ============================================================================
// Helpers
// ============================================================================

function makeTaskProfile(overrides: Partial<TaskProfile> = {}): TaskProfile {
  return {
    taskType: 'code_implementation',
    reasoningComplexity: 5,
    contextRequired: 5000,
    codeGeneration: true,
    estimatedTokens: 1000,
    ...overrides,
  } as TaskProfile;
}

function makeModelProfile(overrides: Partial<TopsisModelProfile> = {}): TopsisModelProfile {
  return {
    cliName: 'claude',
    capabilities: {
      reasoning: 10,
      contextWindow: 200_000,
      codeGeneration: 9,
      speed: 7,
      cost: 5,
    },
    costPerMillionInput: 3.0,
    costPerMillionOutput: 15.0,
    averageLatencyMs: 800,
    qualityScore: 9.5,
    ...overrides,
  };
}

function makeCliTask(content = 'test task'): CliTask {
  return { content, role: 'user' } as CliTask;
}

// ============================================================================
// adjustProfileForTask
// ============================================================================

describe('adjustProfileForTask', () => {
  it('boosts qualityScore for architecture tasks', () => {
    const profile = makeModelProfile({ qualityScore: 8.0 });
    const taskProfile = makeTaskProfile({ taskType: 'architecture' });
    const adjusted = adjustProfileForTask(profile, taskProfile);
    expect(adjusted.qualityScore).toBeCloseTo(9.6);
  });

  it('boosts qualityScore for high reasoning complexity', () => {
    const profile = makeModelProfile({ qualityScore: 8.0 });
    const taskProfile = makeTaskProfile({ reasoningComplexity: 8 });
    const adjusted = adjustProfileForTask(profile, taskProfile);
    expect(adjusted.qualityScore).toBeCloseTo(9.6);
  });

  it('caps qualityScore at 10', () => {
    const profile = makeModelProfile({ qualityScore: 9.5 });
    const taskProfile = makeTaskProfile({ taskType: 'architecture' });
    const adjusted = adjustProfileForTask(profile, taskProfile);
    expect(adjusted.qualityScore).toBe(10);
  });

  it('reduces latency for bulk operations', () => {
    const profile = makeModelProfile({ averageLatencyMs: 1000 });
    const taskProfile = makeTaskProfile({ taskType: 'bulk_operations', reasoningComplexity: 3 });
    const adjusted = adjustProfileForTask(profile, taskProfile);
    expect(adjusted.averageLatencyMs).toBe(800);
  });

  it('reduces latency for low context tasks', () => {
    const profile = makeModelProfile({ averageLatencyMs: 1000 });
    const taskProfile = makeTaskProfile({ contextRequired: 500, reasoningComplexity: 3 });
    const adjusted = adjustProfileForTask(profile, taskProfile);
    expect(adjusted.averageLatencyMs).toBe(800);
  });

  it('returns unmodified profile for standard tasks', () => {
    const profile = makeModelProfile();
    const taskProfile = makeTaskProfile({ reasoningComplexity: 5 });
    const adjusted = adjustProfileForTask(profile, taskProfile);
    expect(adjusted).toEqual(profile);
  });
});

// ============================================================================
// taskProfileToBanditContext
// ============================================================================

describe('taskProfileToBanditContext', () => {
  it('normalizes task complexity to 0-1', () => {
    const profile = makeTaskProfile({ reasoningComplexity: 7 });
    const ctx = taskProfileToBanditContext(profile);
    expect(ctx.taskComplexity).toBeCloseTo(0.7);
  });

  it('normalizes context length with cap at 1', () => {
    const profile = makeTaskProfile({ contextRequired: 200_000 });
    const ctx = taskProfileToBanditContext(profile);
    expect(ctx.contextLengthNormalized).toBe(1);
  });

  it('sets isCodeTask from codeGeneration flag', () => {
    const codePf = makeTaskProfile({ codeGeneration: true });
    const noPf = makeTaskProfile({ codeGeneration: false });
    expect(taskProfileToBanditContext(codePf).isCodeTask).toBe(1);
    expect(taskProfileToBanditContext(noPf).isCodeTask).toBe(0);
  });

  it('sets isReasoningTask for architecture tasks', () => {
    const archPf = makeTaskProfile({ taskType: 'architecture' });
    expect(taskProfileToBanditContext(archPf).isReasoningTask).toBe(1);
  });

  it('sets isReasoningTask for high complexity', () => {
    const highPf = makeTaskProfile({ reasoningComplexity: 8 });
    const lowPf = makeTaskProfile({ reasoningComplexity: 3, taskType: 'code_implementation' });
    expect(taskProfileToBanditContext(highPf).isReasoningTask).toBe(1);
    expect(taskProfileToBanditContext(lowPf).isReasoningTask).toBe(0);
  });

  it('sets fixed budget and time values', () => {
    const ctx = taskProfileToBanditContext(makeTaskProfile());
    expect(ctx.budgetUtilization).toBe(0.5);
    expect(ctx.timePressure).toBe(0.3);
  });
});

// ============================================================================
// calculateConfidence
// ============================================================================

describe('calculateConfidence', () => {
  it('returns base confidence when no scores provided', () => {
    const conf = calculateConfidence(undefined, undefined, 3);
    expect(conf).toBeCloseTo(0.8); // 0.5 + 3*0.1 = 0.8
  });

  it('caps base confidence at 0.8', () => {
    const conf = calculateConfidence(undefined, undefined, 10);
    expect(conf).toBe(0.8);
  });

  it('blends TOPSIS score with base', () => {
    const conf = calculateConfidence(0.9, undefined, 2);
    // base = 0.7, blend = 0.3*0.7 + 0.7*0.9 = 0.21 + 0.63 = 0.84
    expect(conf).toBeCloseTo(0.84);
  });

  it('normalizes UCB score to 0-1', () => {
    const conf = calculateConfidence(undefined, 15, 2);
    // UCB normalized = min(15/10, 1) = 1.0
    // base = 0.7, blend = 0.3*0.7 + 0.7*1.0 = 0.21 + 0.70 = 0.91
    expect(conf).toBeCloseTo(0.91);
  });

  it('averages multiple scores', () => {
    const conf = calculateConfidence(0.8, 5, 2);
    // UCB = min(5/10, 1) = 0.5, avg = (0.8+0.5)/2 = 0.65
    // base = 0.7, blend = 0.3*0.7 + 0.7*0.65 = 0.21 + 0.455 = 0.665
    expect(conf).toBeCloseTo(0.665);
  });
});

// ============================================================================
// buildReason
// ============================================================================

describe('buildReason', () => {
  it('includes selected CLI', () => {
    const reason = buildReason({ selectedCli: 'claude', stages: [] });
    expect(reason).toBe('Selected claude');
  });

  it('includes budget stage', () => {
    const reason = buildReason({ selectedCli: 'claude', stages: ['budget-filter'] });
    expect(reason).toContain('within budget');
  });

  it('includes difficulty tier and score', () => {
    const reason = buildReason({
      selectedCli: 'claude',
      stages: [],
      difficultyTier: 'powerful',
      difficultyScore: 0.85,
    });
    expect(reason).toContain('difficulty powerful (0.85)');
  });

  it('includes preference score', () => {
    const reason = buildReason({
      selectedCli: 'gemini',
      stages: [],
      preferenceScore: 0.72,
    });
    expect(reason).toContain('preference 0.72');
  });

  it('includes TOPSIS and UCB scores', () => {
    const reason = buildReason({
      selectedCli: 'codex',
      stages: [],
      topsisScore: 0.88,
      ucbScore: 3.5,
    });
    expect(reason).toContain('TOPSIS score 0.88');
    expect(reason).toContain('UCB score 3.50');
  });

  it('combines all parts with commas', () => {
    const reason = buildReason({
      selectedCli: 'claude',
      stages: ['budget-filter'],
      topsisScore: 0.9,
      difficultyTier: 'fast',
      difficultyScore: 0.2,
    });
    expect(reason.split(', ').length).toBeGreaterThanOrEqual(3);
  });
});

// ============================================================================
// filterByPreferenceTier
// ============================================================================

describe('filterByPreferenceTier', () => {
  const allCandidates: CliName[] = ['claude', 'gemini', 'codex'];

  it('returns strong models for strong tier', () => {
    const result = filterByPreferenceTier(allCandidates, 'strong');
    expect(result).toEqual(['claude']);
  });

  it('returns weak models for weak tier', () => {
    const result = filterByPreferenceTier(allCandidates, 'weak');
    expect(result).toEqual(['gemini', 'codex']);
  });

  it('falls back to all candidates if no match', () => {
    const result = filterByPreferenceTier(['codex'] as CliName[], 'strong');
    expect(result).toEqual(['codex']);
  });

  it('includes an api:* arm by its display slot tier (#3424)', () => {
    // api:anthropic collapses to the `claude` slot → eligible for the strong
    // tier; api:openai collapses to `codex` → weak. The arm id is preserved.
    expect(filterByPreferenceTier(['api:anthropic', 'api:openai'], 'strong')).toEqual([
      'api:anthropic',
    ]);
    expect(filterByPreferenceTier(['api:anthropic', 'api:openai'], 'weak')).toEqual(['api:openai']);
  });
});

// ============================================================================
// cliTaskToTask
// ============================================================================

describe('cliTaskToTask', () => {
  it('converts CliTask to Task with content as description', () => {
    const cliTask = makeCliTask('Implement auth feature');
    const task = cliTaskToTask(cliTask);
    expect(task.description).toBe('Implement auth feature');
    expect(task.id).toMatch(/^task-/);
    expect(task.context).toEqual({});
  });
});

// ============================================================================
// applyBudgetFilter
// ============================================================================

describe('applyBudgetFilter', () => {
  const candidates: CliName[] = ['claude', 'gemini', 'codex'];
  const config = { budgetConstraints: { maxTokens: 1000 } };

  it('returns all candidates when no budget router', () => {
    const result = applyBudgetFilter(makeCliTask(), candidates, undefined, config as never);
    expect(result.eligible).toEqual(candidates);
    expect(result.withinBudget).toBe(true);
  });

  it('returns empty eligible when over budget', () => {
    const mockRouter = {
      checkBudget: vi.fn(() => ({ withinBudget: false })),
    };
    const result = applyBudgetFilter(
      makeCliTask(),
      candidates,
      mockRouter as never,
      config as never
    );
    expect(result.eligible).toEqual([]);
    expect(result.withinBudget).toBe(false);
  });

  it('returns all candidates when within budget', () => {
    const mockRouter = {
      checkBudget: vi.fn(() => ({ withinBudget: true })),
    };
    const result = applyBudgetFilter(
      makeCliTask(),
      candidates,
      mockRouter as never,
      config as never
    );
    expect(result.eligible).toEqual(candidates);
    expect(result.withinBudget).toBe(true);
  });

  it('reports budget utilization against a configured cost ceiling (#4866)', () => {
    // ResourceStrategyStage's only input. Nothing on this path produced it —
    // it looked for a `budget:utilization=` signal emitted by BudgetFilterStage,
    // which has no production instantiation.
    const mockRouter = {
      checkBudget: vi.fn(() => ({ withinBudget: true, estimatedCostUsd: 0.25 })),
    };

    const result = applyBudgetFilter(
      makeCliTask(),
      candidates,
      mockRouter as never,
      {
        budgetConstraints: { maxCostUsd: 1 },
      } as never
    );

    expect(result.budgetUtilization).toBeCloseTo(0.25);
  });

  it('reports no utilization when no cost ceiling is configured (#4866)', () => {
    // The empty case, named: with no ceiling there is nothing to be a
    // fraction of. Returning 0 would read as "budget untouched" and push
    // ResourceStrategyStage to its most aggressive tier.
    const mockRouter = {
      checkBudget: vi.fn(() => ({ withinBudget: true, estimatedCostUsd: 0.25 })),
    };

    const result = applyBudgetFilter(
      makeCliTask(),
      candidates,
      mockRouter as never,
      config as never
    );

    expect(result.budgetUtilization).toBeUndefined();
  });

  it('caps utilization at 1 when the estimate exceeds the ceiling (#4866)', () => {
    const mockRouter = { checkBudget: vi.fn(() => ({ withinBudget: true, estimatedCostUsd: 5 })) };

    const result = applyBudgetFilter(
      makeCliTask(),
      candidates,
      mockRouter as never,
      {
        budgetConstraints: { maxCostUsd: 1 },
      } as never
    );

    expect(result.budgetUtilization).toBe(1);
  });
});

// ============================================================================
// applyTopsisRanking
// ============================================================================

describe('applyTopsisRanking', () => {
  const candidates: CliName[] = ['claude', 'gemini', 'codex'];

  it('returns candidates unchanged when no TOPSIS router', () => {
    const result = applyTopsisRanking(makeTaskProfile(), candidates, undefined);
    expect(result.ranking).toEqual(candidates);
    expect(result.topScore).toBe(1.0);
  });

  it('ranks candidates by TOPSIS scores', () => {
    const mockRouter = {
      selectModel: vi.fn(() => ({
        scores: [
          { cliName: 'gemini', closenessScore: 0.9 },
          { cliName: 'claude', closenessScore: 0.7 },
          { cliName: 'codex', closenessScore: 0.8 },
        ],
      })),
    };
    const result = applyTopsisRanking(makeTaskProfile(), candidates, mockRouter as never);
    expect(result.ranking[0]).toBe('gemini');
    expect(result.topScore).toBe(0.9);
  });

  it('computes tolerance band size for close scores', () => {
    const mockRouter = {
      selectModel: vi.fn(() => ({
        scores: [
          { cliName: 'gemini', closenessScore: 0.9 },
          { cliName: 'codex', closenessScore: 0.88 },
          { cliName: 'claude', closenessScore: 0.6 },
        ],
      })),
    };
    const result = applyTopsisRanking(makeTaskProfile(), candidates, mockRouter as never);
    // gemini (0.90) and codex (0.88) are within 5% tolerance band; claude (0.60) is not
    expect(result.toleranceBandSize).toBe(2);
  });

  it('tolerance band includes all when scores are equal', () => {
    const mockRouter = {
      selectModel: vi.fn(() => ({
        scores: [
          { cliName: 'gemini', closenessScore: 0.8 },
          { cliName: 'codex', closenessScore: 0.8 },
          { cliName: 'claude', closenessScore: 0.8 },
        ],
      })),
    };
    const result = applyTopsisRanking(makeTaskProfile(), candidates, mockRouter as never);
    expect(result.toleranceBandSize).toBe(3);
  });
});

// ============================================================================
// applyPerformanceFloorPenalty
// ============================================================================

describe('applyPerformanceFloorPenalty', () => {
  it('returns profiles unchanged when no performance data', () => {
    const profiles = [
      makeModelProfile({ cliName: 'claude' as CliName, qualityScore: 9.5 }),
      makeModelProfile({ cliName: 'gemini' as CliName, qualityScore: 8.5 }),
    ];
    const result = applyPerformanceFloorPenalty(profiles, new Map());
    expect(result[0]?.qualityScore).toBe(9.5);
    expect(result[1]?.qualityScore).toBe(8.5);
  });

  it('applies penalty when success rate below 50% with sufficient samples', () => {
    const profiles = [
      makeModelProfile({ cliName: 'claude' as CliName, qualityScore: 9.5 }),
      makeModelProfile({ cliName: 'gemini' as CliName, qualityScore: 8.5 }),
    ];
    const perfData = new Map<CliName, { successRate: number; sampleCount: number }>([
      ['claude', { successRate: 0.41, sampleCount: 235 }],
      ['gemini', { successRate: 0.7, sampleCount: 23 }],
    ]);
    const result = applyPerformanceFloorPenalty(profiles, perfData);
    // Claude should be penalized: 9.5 - 3.0 = 6.5
    expect(result[0]?.qualityScore).toBe(6.5);
    // Gemini should be unchanged
    expect(result[1]?.qualityScore).toBe(8.5);
  });

  it('does not apply penalty when success rate above 50%', () => {
    const profiles = [makeModelProfile({ cliName: 'claude' as CliName, qualityScore: 9.5 })];
    const perfData = new Map<CliName, { successRate: number; sampleCount: number }>([
      ['claude', { successRate: 0.55, sampleCount: 100 }],
    ]);
    const result = applyPerformanceFloorPenalty(profiles, perfData);
    expect(result[0]?.qualityScore).toBe(9.5);
  });

  it('does not apply penalty when sample count below threshold', () => {
    const profiles = [makeModelProfile({ cliName: 'claude' as CliName, qualityScore: 9.5 })];
    const perfData = new Map<CliName, { successRate: number; sampleCount: number }>([
      ['claude', { successRate: 0.3, sampleCount: 10 }],
    ]);
    const result = applyPerformanceFloorPenalty(profiles, perfData);
    expect(result[0]?.qualityScore).toBe(9.5);
  });

  it('does not reduce quality below zero', () => {
    const profiles = [makeModelProfile({ cliName: 'claude' as CliName, qualityScore: 2.0 })];
    const perfData = new Map<CliName, { successRate: number; sampleCount: number }>([
      ['claude', { successRate: 0.3, sampleCount: 50 }],
    ]);
    const result = applyPerformanceFloorPenalty(profiles, perfData);
    expect(result[0]?.qualityScore).toBe(0);
  });

  it('applies penalty to multiple underperforming CLIs', () => {
    const profiles = [
      makeModelProfile({ cliName: 'claude' as CliName, qualityScore: 9.5 }),
      makeModelProfile({ cliName: 'codex' as CliName, qualityScore: 7.5 }),
      makeModelProfile({ cliName: 'gemini' as CliName, qualityScore: 8.5 }),
    ];
    const perfData = new Map<CliName, { successRate: number; sampleCount: number }>([
      ['claude', { successRate: 0.41, sampleCount: 235 }],
      ['codex', { successRate: 0.33, sampleCount: 25 }],
      ['gemini', { successRate: 0.7, sampleCount: 23 }],
    ]);
    const result = applyPerformanceFloorPenalty(profiles, perfData);
    expect(result[0]?.qualityScore).toBe(6.5); // claude penalized
    expect(result[1]?.qualityScore).toBe(4.5); // codex penalized
    expect(result[2]?.qualityScore).toBe(8.5); // gemini unchanged
  });

  it('handles exactly 50% success rate without penalty (boundary)', () => {
    const profiles = [makeModelProfile({ cliName: 'claude' as CliName, qualityScore: 9.5 })];
    const perfData = new Map<CliName, { successRate: number; sampleCount: number }>([
      ['claude', { successRate: 0.5, sampleCount: 100 }],
    ]);
    const result = applyPerformanceFloorPenalty(profiles, perfData);
    // 50% is at the boundary — no penalty (strict less-than)
    expect(result[0]?.qualityScore).toBe(9.5);
  });

  it('handles exactly 20 samples at threshold boundary', () => {
    const profiles = [makeModelProfile({ cliName: 'claude' as CliName, qualityScore: 9.5 })];
    const perfData = new Map<CliName, { successRate: number; sampleCount: number }>([
      ['claude', { successRate: 0.3, sampleCount: 20 }],
    ]);
    const result = applyPerformanceFloorPenalty(profiles, perfData);
    // Exactly 20 samples should trigger penalty (>= 20)
    expect(result[0]?.qualityScore).toBe(6.5);
  });
});

// ============================================================================
// defaultPreferenceStageResult / defaultZeroRouterStageResult
// ============================================================================

describe('defaultPreferenceStageResult', () => {
  it('returns undefined scores with passed candidates', () => {
    const candidates: CliName[] = ['claude', 'gemini'];
    const result = defaultPreferenceStageResult(candidates);
    expect(result.preferenceScore).toBeUndefined();
    expect(result.preferenceTier).toBeUndefined();
    expect(result.preferredCandidates).toEqual(candidates);
  });
});

describe('defaultZeroRouterStageResult', () => {
  it('returns undefined estimates with passed candidates', () => {
    const candidates: CliName[] = ['claude'];
    const result = defaultZeroRouterStageResult(candidates);
    expect(result.difficultyEstimate).toBeUndefined();
    expect(result.difficultyTier).toBeUndefined();
    expect(result.filteredCandidates).toEqual(candidates);
  });
});

// ============================================================================
// filterByDifficultyTier
// ============================================================================

describe('filterByDifficultyTier', () => {
  const candidates: CliName[] = ['claude', 'gemini', 'codex'];

  it('sorts fast tier: gemini first', () => {
    const result = filterByDifficultyTier(candidates, 'fast');
    expect(result[0]).toBe('gemini');
  });

  it('sorts balanced tier: codex first', () => {
    const result = filterByDifficultyTier(candidates, 'balanced');
    expect(result[0]).toBe('codex');
  });

  it('sorts powerful tier: claude first', () => {
    const result = filterByDifficultyTier(candidates, 'powerful');
    expect(result[0]).toBe('claude');
  });

  it('preserves all candidates (just reorders)', () => {
    const result = filterByDifficultyTier(candidates, 'fast');
    expect(result).toHaveLength(3);
    expect(new Set(result)).toEqual(new Set(candidates));
  });

  it('keeps api:* arms and sorts them by display slot (#3424)', () => {
    // api:anthropic sorts as `claude` → first in the powerful tier; the distinct
    // arm id is never dropped (the gap #3424 worried about does not exist).
    const withApi: RoutingArmId[] = ['api:openai', 'api:anthropic'];
    const result = filterByDifficultyTier(withApi, 'powerful');
    expect(result[0]).toBe('api:anthropic');
    expect(new Set(result)).toEqual(new Set(withApi));
  });
});

// ============================================================================
// applyZeroRouterFilter
// ============================================================================

describe('applyZeroRouterFilter', () => {
  const candidates: CliName[] = ['claude', 'gemini', 'codex'];

  it('returns default when no zero router', () => {
    const result = applyZeroRouterFilter(makeCliTask(), candidates, undefined);
    expect(result.difficultyEstimate).toBeUndefined();
    expect(result.filteredCandidates).toEqual(candidates);
  });

  it('returns default for empty candidates', () => {
    const mockRouter = { routeByDifficulty: vi.fn() };
    const result = applyZeroRouterFilter(makeCliTask(), [], mockRouter as never);
    expect(result.filteredCandidates).toEqual([]);
  });

  it('applies difficulty-based filtering', () => {
    const mockRouter = {
      routeByDifficulty: vi.fn(() => ({
        difficulty: { aggregateScore: 0.8 },
        tier: 'powerful',
      })),
    };
    const result = applyZeroRouterFilter(makeCliTask(), candidates, mockRouter as never);
    expect(result.difficultyTier).toBe('powerful');
    expect(result.filteredCandidates[0]).toBe('claude');
  });
});

// ============================================================================
// buildDifficultyOutcome
// ============================================================================

describe('buildDifficultyOutcome', () => {
  it('creates outcome with required fields', () => {
    const outcome = buildDifficultyOutcome('test content', 0.5, 'claude', true);
    expect(outcome.taskHash).toBeDefined();
    expect(outcome.estimatedDifficulty).toBe(0.5);
    expect(outcome.selectedCli).toBe('claude');
    expect(outcome.success).toBe(true);
    expect(outcome.timestamp).toBeGreaterThan(0);
  });

  it('includes optional quality score', () => {
    const outcome = buildDifficultyOutcome('test', 0.5, 'claude', true, 8.5);
    expect(outcome.qualityScore).toBe(8.5);
  });

  it('omits quality score when not provided', () => {
    const outcome = buildDifficultyOutcome('test', 0.5, 'claude', true);
    expect('qualityScore' in outcome).toBe(false);
  });
});

// ============================================================================
// buildDecisionFields
// ============================================================================

describe('buildDecisionFields', () => {
  it('returns confidence, reason, and alternatives', () => {
    const result = buildDecisionFields({
      selectedCli: 'claude',
      candidates: ['claude', 'gemini', 'codex'],
      topsisRanking: ['claude', 'gemini', 'codex'],
      stagesExecuted: ['budget-filter'],
      decisionTimeMs: 50,
      withinBudget: true,
      difficultyEstimate: undefined,
      difficultyTier: undefined,
      preferenceScore: undefined,
      preferenceTier: undefined,
      topsisScore: 0.9,
      ucbScore: undefined,
      taskProfile: makeTaskProfile(),
    });
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.reason).toContain('Selected claude');
    expect(result.alternatives).toEqual(['gemini', 'codex']);
  });

  it('excludes selected CLI from alternatives', () => {
    const result = buildDecisionFields({
      selectedCli: 'gemini',
      candidates: ['gemini'],
      topsisRanking: ['gemini', 'claude'],
      stagesExecuted: [],
      decisionTimeMs: 10,
      withinBudget: true,
      difficultyEstimate: undefined,
      difficultyTier: undefined,
      preferenceScore: undefined,
      preferenceTier: undefined,
      topsisScore: undefined,
      ucbScore: undefined,
      taskProfile: makeTaskProfile(),
    });
    expect(result.alternatives).not.toContain('gemini');
  });
});

// ============================================================================
// buildPreferenceStats
// ============================================================================

describe('buildPreferenceStats', () => {
  it('returns undefined when preference routing disabled', () => {
    expect(buildPreferenceStats(false, undefined)).toBeUndefined();
  });

  it('returns undefined when no preference router', () => {
    expect(buildPreferenceStats(true, undefined)).toBeUndefined();
  });

  it('returns stats from preference router', () => {
    const mockRouter = {
      getStats: vi.fn(() => ({
        totalDataPoints: 42,
        strongModelPreferenceRate: 0.75,
      })),
      hasMinimumData: vi.fn(() => true),
    };
    const result = buildPreferenceStats(true, mockRouter);
    expect(result).toEqual({
      enabled: true,
      hasSufficientData: true,
      dataPointCount: 42,
      strongModelPreferenceRate: 0.75,
    });
  });

  it('reflects insufficient data', () => {
    const mockRouter = {
      getStats: vi.fn(() => ({
        totalDataPoints: 2,
        strongModelPreferenceRate: 0.5,
      })),
      hasMinimumData: vi.fn(() => false),
    };
    const result = buildPreferenceStats(true, mockRouter);
    expect(result?.hasSufficientData).toBe(false);
  });
});

// ============================================================================
// adjustProfileWithStageScores (#1354)
// ============================================================================

describe('adjustProfileWithStageScores', () => {
  const claude = makeModelProfile({ cliName: 'claude' as CliName, qualityScore: 9.0 });
  const gemini = makeModelProfile({ cliName: 'gemini' as CliName, qualityScore: 8.0 });
  const codex = makeModelProfile({ cliName: 'codex' as CliName, qualityScore: 7.0 });
  const profiles = [claude, gemini, codex];

  it('returns unchanged profiles when stageScores is empty', () => {
    const result = adjustProfileWithStageScores(profiles, new Map());
    expect(result).toHaveLength(3);
    expect(result[0]?.qualityScore).toBe(9.0);
    expect(result[1]?.qualityScore).toBe(8.0);
    expect(result[2]?.qualityScore).toBe(7.0);
  });

  it('boosts quality for CLI with above-average stage score', () => {
    const scores = new Map<CliName, number>([
      ['claude', 3.0],
      ['gemini', 1.0],
      ['codex', 1.0],
    ]);
    const result = adjustProfileWithStageScores(profiles, scores);
    // Claude has highest score → boosted
    expect(result[0]?.qualityScore).toBeGreaterThan(9.0);
    // Gemini and codex have below-average → reduced
    expect(result[1]?.qualityScore).toBeLessThan(8.0);
    expect(result[2]?.qualityScore).toBeLessThan(7.0);
  });

  it('caps quality boost at +15%', () => {
    const scores = new Map<CliName, number>([
      ['claude', 100.0],
      ['gemini', 0.0],
    ]);
    const result = adjustProfileWithStageScores([claude, gemini], scores);
    // Max boost: 9.0 * 1.15 = 10.35, capped at 10
    expect(result[0]?.qualityScore).toBeLessThanOrEqual(10);
    expect(result[0]?.qualityScore).toBeGreaterThan(9.0);
  });

  it('limits quality penalty to -10%', () => {
    const scores = new Map<CliName, number>([
      ['claude', 0.0],
      ['gemini', 100.0],
    ]);
    const result = adjustProfileWithStageScores([claude, gemini], scores);
    // Min penalty: 9.0 * 0.90 = 8.1
    expect(result[0]?.qualityScore).toBeGreaterThanOrEqual(9.0 * 0.9 - 0.01);
    expect(result[0]?.qualityScore).toBeLessThan(9.0);
  });

  it('does not modify CLIs without stage scores', () => {
    const scores = new Map<CliName, number>([['claude', 5.0]]);
    const result = adjustProfileWithStageScores(profiles, scores);
    // gemini and codex have no score → unchanged
    expect(result[1]?.qualityScore).toBe(8.0);
    expect(result[2]?.qualityScore).toBe(7.0);
  });

  it('handles equal scores (no deviation) gracefully', () => {
    const scores = new Map<CliName, number>([
      ['claude', 5.0],
      ['gemini', 5.0],
    ]);
    const result = adjustProfileWithStageScores([claude, gemini], scores);
    // Equal scores → deviation is 0 → multiplier is 1.0 → no change
    expect(result[0]?.qualityScore).toBeCloseTo(9.0, 5);
    expect(result[1]?.qualityScore).toBeCloseTo(8.0, 5);
  });

  it('never exceeds quality cap of 10', () => {
    const highQuality = makeModelProfile({
      cliName: 'claude' as CliName,
      qualityScore: 9.8,
    });
    const scores = new Map<CliName, number>([
      ['claude', 10.0],
      ['gemini', 1.0],
    ]);
    const result = adjustProfileWithStageScores([highQuality, gemini], scores);
    expect(result[0]?.qualityScore).toBeLessThanOrEqual(10);
  });
});

// ============================================================================
// applyDifficultyCostWeighting (#4196)
// ============================================================================

describe('applyDifficultyCostWeighting', () => {
  const weightOf = (
    criteria: ReturnType<typeof applyDifficultyCostWeighting>,
    name: string
  ): number | undefined => criteria.find((c) => c.name === name)?.weight;

  it('shifts weight from cost to quality for high complexity (>7)', () => {
    const result = applyDifficultyCostWeighting(DEFAULT_TOPSIS_CRITERIA, 8);
    expect(weightOf(result, 'quality')).toBeCloseTo(0.65);
    expect(weightOf(result, 'cost')).toBeCloseTo(0.15);
    expect(weightOf(result, 'latency')).toBeCloseTo(0.2);
  });

  it('shifts weight from quality to cost for low complexity (<4)', () => {
    const result = applyDifficultyCostWeighting(DEFAULT_TOPSIS_CRITERIA, 3);
    expect(weightOf(result, 'quality')).toBeCloseTo(0.35);
    expect(weightOf(result, 'cost')).toBeCloseTo(0.45);
    expect(weightOf(result, 'latency')).toBeCloseTo(0.2);
  });

  it('returns the SAME criteria reference for mid complexity (byte-identical default path)', () => {
    expect(applyDifficultyCostWeighting(DEFAULT_TOPSIS_CRITERIA, 5)).toBe(DEFAULT_TOPSIS_CRITERIA);
    expect(applyDifficultyCostWeighting(DEFAULT_TOPSIS_CRITERIA, 7)).toBe(DEFAULT_TOPSIS_CRITERIA);
    expect(applyDifficultyCostWeighting(DEFAULT_TOPSIS_CRITERIA, 4)).toBe(DEFAULT_TOPSIS_CRITERIA);
  });

  it('preserves weight sum of 1.0 after shifting', () => {
    for (const complexity of [2, 9]) {
      const result = applyDifficultyCostWeighting(DEFAULT_TOPSIS_CRITERIA, complexity);
      const sum = result.reduce((a, c) => a + c.weight, 0);
      expect(sum).toBeCloseTo(1.0, 10);
    }
  });

  it('clamps the shift so no weight goes negative (architecture cost=0.1)', () => {
    const architecture = TASK_CATEGORY_TOPSIS_CRITERIA['architecture'];
    expect(architecture).toBeDefined();
    const result = applyDifficultyCostWeighting(architecture as never, 9);
    expect(weightOf(result, 'quality')).toBeCloseTo(0.8);
    expect(weightOf(result, 'cost')).toBeCloseTo(0.0);
    expect(weightOf(result, 'latency')).toBeCloseTo(0.2);
  });

  it('is a no-op when cost weight is already 0 and complexity is high (plan-shaped criteria)', () => {
    expect(applyDifficultyCostWeighting(PLAN_BILLING_TOPSIS_CRITERIA, 9)).toBe(
      PLAN_BILLING_TOPSIS_CRITERIA
    );
  });
});

// ============================================================================
// applyTopsisRanking — difficulty conditioning gates (#4196)
// ============================================================================

describe('applyTopsisRanking difficulty conditioning', () => {
  const candidates: CliName[] = ['claude', 'gemini', 'codex'];
  // Complexity 3 vs 5 isolates the NEW weight conditioning: neither value
  // triggers the pre-existing ×1.2 profile quality boost (>7), so any output
  // difference can only come from the criteria-weight shift (#4196).

  it('plan mode: weights are NOT difficulty-conditioned (regression pin)', async () => {
    const { TopsisRouter } = await import('./topsis-router.js');
    const router = new TopsisRouter();
    const low = applyTopsisRanking(
      makeTaskProfile({ taskType: 'general', reasoningComplexity: 3 }),
      candidates,
      router,
      { billingMode: 'plan' }
    );
    const mid = applyTopsisRanking(
      makeTaskProfile({ taskType: 'general', reasoningComplexity: 5 }),
      candidates,
      router,
      { billingMode: 'plan' }
    );
    expect(low.ranking).toEqual(mid.ranking);
    expect(low.topScore).toBe(mid.topScore);
  });

  it('api mode: low complexity (cost-heavy weights) changes the scoring landscape', async () => {
    const { TopsisRouter } = await import('./topsis-router.js');
    const router = new TopsisRouter();
    const low = applyTopsisRanking(
      makeTaskProfile({ taskType: 'general', reasoningComplexity: 3 }),
      candidates,
      router,
      { billingMode: 'api' }
    );
    const mid = applyTopsisRanking(
      makeTaskProfile({ taskType: 'general', reasoningComplexity: 5 }),
      candidates,
      router,
      { billingMode: 'api' }
    );
    // Cost-heavy weights (0.35/0.45/0.2) must change the closeness landscape
    // relative to defaults (0.5/0.3/0.2).
    expect(low.topScore).not.toBe(mid.topScore);
  });
});

// ============================================================================
// buildReason / buildDecisionFields — plan-mode annotation (#4196)
// ============================================================================

describe('plan-mode cost annotation', () => {
  it('buildReason appends the annotation in plan mode', () => {
    const reason = buildReason({ selectedCli: 'claude', stages: [], billingMode: 'plan' });
    expect(reason).toContain(PLAN_MODE_COST_ANNOTATION);
    expect(reason).toContain('cost weighting disabled: plan mode');
  });

  it('buildReason omits the annotation in api mode', () => {
    const reason = buildReason({ selectedCli: 'claude', stages: [], billingMode: 'api' });
    expect(reason).not.toContain(PLAN_MODE_COST_ANNOTATION);
  });

  it('buildReason omits the annotation when billingMode is not provided (back-compat)', () => {
    const reason = buildReason({ selectedCli: 'claude', stages: [] });
    expect(reason).toBe('Selected claude');
  });

  it('buildDecisionFields threads billingMode into the reason', () => {
    const base = {
      selectedCli: 'claude' as CliName,
      candidates: ['claude', 'gemini'] as CliName[],
      topsisRanking: ['claude', 'gemini'] as CliName[],
      stagesExecuted: ['task-analysis'],
      decisionTimeMs: 5,
      withinBudget: true,
      difficultyEstimate: undefined,
      difficultyTier: undefined,
      preferenceScore: undefined,
      preferenceTier: undefined,
      topsisScore: 0.8,
      ucbScore: undefined,
      taskProfile: makeTaskProfile(),
    };
    const plan = buildDecisionFields({ ...base, billingMode: 'plan' });
    expect(plan.reason).toContain(PLAN_MODE_COST_ANNOTATION);
    const api = buildDecisionFields({ ...base, billingMode: 'api' });
    expect(api.reason).not.toContain(PLAN_MODE_COST_ANNOTATION);
  });
});

// ============================================================================
// applyBudgetFilter — per-task-class cost ceiling gating (#4196)
// ============================================================================

describe('applyBudgetFilter task-class ceiling gating', () => {
  const candidates: CliName[] = ['claude', 'gemini', 'codex'];

  it('api mode: applies the ceiling filter via the budget router', () => {
    const mockRouter = {
      checkBudget: vi.fn(() => ({ withinBudget: true })),
      filterByTaskClassCeiling: vi.fn(() => ['gemini']),
    };
    const result = applyBudgetFilter(
      makeCliTask(),
      candidates,
      mockRouter as never,
      {
        billingMode: 'api',
      } as never
    );
    expect(mockRouter.filterByTaskClassCeiling).toHaveBeenCalledTimes(1);
    expect(result.eligible).toEqual(['gemini']);
  });

  it('api mode: an empty ceiling result stays empty (fail-closed, no return-all fallback)', () => {
    const mockRouter = {
      checkBudget: vi.fn(() => ({ withinBudget: true })),
      filterByTaskClassCeiling: vi.fn(() => []),
    };
    const result = applyBudgetFilter(
      makeCliTask(),
      candidates,
      mockRouter as never,
      {
        billingMode: 'api',
      } as never
    );
    expect(result.eligible).toEqual([]);
  });

  it('plan mode: never invokes the ceiling filter (no-op)', () => {
    const mockRouter = {
      checkBudget: vi.fn(() => ({ withinBudget: true })),
      filterByTaskClassCeiling: vi.fn(() => []),
    };
    const result = applyBudgetFilter(
      makeCliTask(),
      candidates,
      mockRouter as never,
      {
        billingMode: 'plan',
        budgetConstraints: { taskClassMaxCostUsd: { code_generation: 0.01 } },
      } as never
    );
    expect(mockRouter.filterByTaskClassCeiling).not.toHaveBeenCalled();
    expect(result.eligible).toEqual(candidates);
  });
});
