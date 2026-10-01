import { describe, expect, it } from 'vitest';
import type { CompositeRoutingDecision } from '../cli-adapters/composite-router-types.js';
import {
  mapFeedbackRoutingDecision,
  mapObserverRoutingDecision,
  mapStoredRoutingDecision,
} from './routing-decision-mappers.js';

// Distinct values distinguish task text, explanations, models, tiers and scores.
const decision: CompositeRoutingDecision = {
  adapter: { name: 'adapter-sentinel' } as unknown as CompositeRoutingDecision['adapter'],
  cliName: 'api:anthropic',
  model: 'concrete-model-sentinel',
  confidence: 0.81,
  reason: 'EXPLANATION sentinel',
  stagesExecuted: ['task-analysis', 'preference-routing'],
  decisionTimeMs: 43,
  withinBudget: false,
  difficultyEstimate: {
    dimensions: {
      reasoning: 0.11,
      knowledge: 0.12,
      creativity: 0.13,
      precision: 0.14,
      context_length: 0.15,
    },
    aggregateScore: 0.16,
    level: 'hard',
    recommendedTier: 'balanced',
    confidence: 0.17,
    dominantDimension: 'precision',
  },
  difficultyTier: 'powerful',
  preferenceScore: 0.62,
  preferenceTier: 'strong',
  topsisScore: 0.73,
  ucbScore: 1.94,
  latencyScore: 0.25,
  alternatives: ['api:google', 'api:openai', 'opencode'],
  alternativeScores: new Map([
    ['api:google', 0.36],
    ['api:openai', 0.47],
    ['opencode', 0.58],
  ]),
  taskProfile: {
    contextRequired: 1237,
    reasoningComplexity: 8,
    codeGeneration: true,
    multimodal: false,
    parallelizable: true,
    budgetSensitive: false,
    taskType: 'code_implementation',
    detectedProductType: 'cli',
  },
};
const context = {
  id: 'id-sentinel',
  traceId: 'trace-sentinel',
  timestamp: '2026-09-30T12:34:56.789Z',
  routerType: 'preference' as const,
  routerTypeMeasured: true,
  query: 'TASK text sentinel',
  taskId: 'task-id-sentinel',
};

describe('routing decision mapper provenance', () => {
  it.each([
    {
      sink: 'feedback',
      map: () => mapFeedbackRoutingDecision(decision, context),
      expected: {
        id: context.id,
        timestamp: context.timestamp,
        traceId: context.traceId,
        routerType: context.routerType,
        routerTypeMeasured: context.routerTypeMeasured,
        query: context.query,
        selectedModel: 'claude',
        confidence: decision.confidence,
        selectedTier: decision.preferenceTier,
      },
    },
    {
      sink: 'observer',
      map: () => mapObserverRoutingDecision(decision, context),
      expected: {
        timestamp: context.timestamp,
        taskId: context.taskId,
        taskDescription: context.query,
        selectedCli: 'claude',
        confidence: decision.confidence,
        reason: decision.reason,
        alternatives: ['gemini', 'codex', 'opencode'],
        stagesExecuted: decision.stagesExecuted,
        decisionTimeMs: decision.decisionTimeMs,
        withinBudget: decision.withinBudget,
        topsisScore: decision.topsisScore,
        ucbScore: decision.ucbScore,
      },
    },
    {
      sink: 'stored',
      map: () => mapStoredRoutingDecision(decision, context),
      expected: {
        id: context.id,
        traceId: context.traceId,
        timestamp: context.timestamp,
        routerType: context.routerType,
        routerTypeMeasured: context.routerTypeMeasured,
        selectedModel: 'claude',
        alternativeModels: ['gemini', 'codex', 'opencode'],
        confidence: decision.confidence,
        reason: decision.reason,
        taskProfile: { ...decision.taskProfile },
      },
    },
  ])('maps every $sink field from its own source', ({ map, expected }) => {
    expect(map()).toEqual(expected);
  });

  it.each(['strong', 'weak', undefined] as const)(
    'maps preference tier %j independently of difficulty',
    (tier) => {
      expect(
        mapFeedbackRoutingDecision({ ...decision, preferenceTier: tier }, context).selectedTier
      ).toBe(tier);
    }
  );

  it('stores missing task text as the blank sentinel the preference router skips without borrowing the reason', () => {
    const { query: _query, ...withoutQuery } = context;
    expect(mapFeedbackRoutingDecision(decision, withoutQuery).query).toBe('');
  });

  it.each([100, 101])('preserves observer description truncation at length %i', (length) => {
    const query = 'x'.repeat(length);
    expect(mapObserverRoutingDecision(decision, { ...context, query }).taskDescription).toBe(
      length > 100 ? query.substring(0, 100) + '...' : query
    );
  });

  it('omits an absent product classification from storage', () => {
    const { detectedProductType: _product, ...taskProfile } = decision.taskProfile;
    expect(mapStoredRoutingDecision({ ...decision, taskProfile }, context).taskProfile).toEqual(
      taskProfile
    );
  });
});
