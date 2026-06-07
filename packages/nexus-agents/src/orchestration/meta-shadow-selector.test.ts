/**
 * Tests for the shadow-mode learned strategy selector (#3551). The selector
 * reuses LinUCB; these tests cover the context mapping, prediction, training,
 * the bounded recording sink, and the offline agreement summary.
 */

import { describe, it, expect } from 'vitest';
import {
  SHADOW_STRATEGY_ARMS,
  createLearnedStrategySelector,
  createRecordingShadowSink,
  toBanditContext,
  summarizeShadowAgreement,
  getShadowSelector,
  getShadowSink,
  type MetaShadowRecord,
} from './meta-shadow-selector.js';
import type { MetaDecision, ExecutionStrategy } from './meta-orchestrator.js';
import type { TaskAnalysisResult } from '../core/task-analysis/shared-task-analyzer.js';

function analysis(over: Partial<TaskAnalysisResult> = {}): TaskAnalysisResult {
  return {
    reasoningType: 'knowledge',
    reasoningConfidence: 0.5,
    complexity: 'moderate',
    complexityScore: 0.5,
    taskType: 'general',
    taskTypeConfidence: 0.5,
    capabilities: {} as TaskAnalysisResult['capabilities'],
    estimatedTokens: 5000,
    matchedSignals: [],
    ambiguityScore: 0,
    constraints: {} as TaskAnalysisResult['constraints'],
    requiredCapabilities: {} as TaskAnalysisResult['requiredCapabilities'],
    ...over,
  };
}

function decision(over: Partial<MetaDecision> = {}): MetaDecision {
  return {
    decisionId: 'd1',
    strategy: 'pipeline',
    reasoning: 'r',
    confidence: 0.6,
    alternatives: [],
    needsShaping: false,
    pattern: 'sequential',
    pipelineType: 'general',
    analysis: analysis(),
    ...over,
  };
}

describe('toBanditContext', () => {
  it('maps analysis fields onto the 6 bandit features', () => {
    const ctx = toBanditContext(
      decision({
        analysis: analysis({
          complexityScore: 0.8,
          estimatedTokens: 50000,
          taskType: 'code_implementation',
          reasoningType: 'reasoning',
          reasoningConfidence: 0.9,
        }),
      })
    );
    expect(ctx.taskComplexity).toBe(0.8);
    expect(ctx.contextLengthNormalized).toBeCloseTo(0.5); // 50000 / 100000
    expect(ctx.isCodeTask).toBe(1);
    expect(ctx.isReasoningTask).toBeCloseTo(0.9);
  });

  it('clamps out-of-range / NaN and marks non-code tasks', () => {
    const ctx = toBanditContext(
      decision({
        analysis: analysis({
          complexityScore: 5,
          estimatedTokens: 1_000_000,
          taskType: 'documentation',
          reasoningType: 'knowledge',
        }),
      })
    );
    expect(ctx.taskComplexity).toBe(1);
    expect(ctx.contextLengthNormalized).toBe(1);
    expect(ctx.isCodeTask).toBe(0);
    expect(ctx.isReasoningTask).toBe(0);
  });
});

describe('createLearnedStrategySelector', () => {
  it('predicts a strategy from the known arm set', () => {
    const selector = createLearnedStrategySelector();
    const { strategy, score } = selector.predict(decision());
    expect(SHADOW_STRATEGY_ARMS).toContain(strategy);
    expect(typeof score).toBe('number');
  });

  it('training shifts preference toward the rewarded strategy for a context', () => {
    const selector = createLearnedStrategySelector();
    const d = decision({
      analysis: analysis({ taskType: 'code_implementation', complexityScore: 0.9 }),
    });
    // Reward 'consensus' repeatedly for this context; penalize everything else.
    for (let i = 0; i < 40; i++) {
      selector.recordOutcome('consensus', d, true);
      for (const arm of SHADOW_STRATEGY_ARMS) {
        if (arm !== 'consensus') selector.recordOutcome(arm, d, false);
      }
    }
    expect(selector.predict(d).strategy).toBe('consensus');
  });

  it('recordOutcome ignores an unknown strategy without throwing', () => {
    const selector = createLearnedStrategySelector();
    expect(() => {
      selector.recordOutcome('not-a-strategy' as ExecutionStrategy, decision(), true);
    }).not.toThrow();
  });
});

describe('createRecordingShadowSink', () => {
  it('buffers records and evicts oldest past the cap', () => {
    const sink = createRecordingShadowSink(2);
    const mk = (id: string): MetaShadowRecord => ({
      decisionId: id,
      timestamp: 't',
      ruleStrategy: 'pipeline',
      learnedStrategy: 'pipeline',
      agree: true,
      taskClass: 'general',
      learnedScore: 0,
    });
    sink.record(mk('a'));
    sink.record(mk('b'));
    sink.record(mk('c'));
    expect(sink.getRecords().map((r) => r.decisionId)).toEqual(['b', 'c']);
  });
});

describe('summarizeShadowAgreement', () => {
  it('computes overall and per-task-class agreement rates', () => {
    const rec = (taskClass: string, agree: boolean): MetaShadowRecord => ({
      decisionId: 'x',
      timestamp: 't',
      ruleStrategy: 'pipeline',
      learnedStrategy: agree ? 'pipeline' : 'consensus',
      agree,
      taskClass,
      learnedScore: 0,
    });
    const summary = summarizeShadowAgreement([
      rec('code_implementation', true),
      rec('code_implementation', false),
      rec('general', true),
    ]);
    expect(summary.total).toBe(3);
    expect(summary.agreements).toBe(2);
    expect(summary.agreementRate).toBeCloseTo(2 / 3);
    expect(summary.perTaskClass.code_implementation).toEqual({ total: 2, agree: 1, rate: 0.5 });
    expect(summary.perTaskClass.general).toEqual({ total: 1, agree: 1, rate: 1 });
  });

  it('returns a zero summary for no records', () => {
    expect(summarizeShadowAgreement([])).toEqual({
      total: 0,
      agreements: 0,
      agreementRate: 0,
      perTaskClass: {},
    });
  });
});

describe('process-scoped singletons', () => {
  it('return stable instances', () => {
    expect(getShadowSelector()).toBe(getShadowSelector());
    expect(getShadowSink()).toBe(getShadowSink());
  });
});
