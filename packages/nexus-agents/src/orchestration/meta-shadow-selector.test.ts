/**
 * Tests for the shadow-mode learned strategy selector (#3551). The selector
 * reuses LinUCB; these tests cover the context mapping, prediction, training,
 * the bounded recording sink, and the offline agreement summary.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  SHADOW_STRATEGY_ARMS,
  createLearnedStrategySelector,
  createRecordingShadowSink,
  toBanditContext,
  summarizeShadowAgreement,
  getShadowSelector,
  getShadowSink,
  persistMetaOutcome,
  hydrateShadowSelector,
  META_OUTCOME_SCHEMA_VERSION,
  type MetaShadowRecord,
} from './meta-shadow-selector.js';
import { getMetaOutcomesFile } from '../config/learning-persistence.js';
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

describe('selector.stats() — bandit-movement telemetry (#3593)', () => {
  it('exposes per-arm pull counts and reward means that change after recordOutcome', () => {
    const selector = createLearnedStrategySelector();
    const before = selector.stats();
    expect(before.length).toBe(SHADOW_STRATEGY_ARMS.length);
    expect(before.every((s) => s.pulls === 0)).toBe(true);

    const d = decision({ analysis: analysis({ taskType: 'code_implementation' }) });
    selector.recordOutcome('consensus', d, true);
    selector.recordOutcome('consensus', d, true);
    selector.recordOutcome('pipeline', d, false);

    const after = selector.stats();
    const consensus = after.find((s) => s.strategy === 'consensus');
    const pipeline = after.find((s) => s.strategy === 'pipeline');
    expect(consensus?.pulls).toBe(2);
    expect(pipeline?.pulls).toBe(1);
    // success-only would collapse to ~equal means; success+failure must differ.
    expect(consensus?.rewardMean).toBeGreaterThan(pipeline?.rewardMean ?? 1);
  });
});

describe('shadow-selector persistence (#3593)', () => {
  let dir: string;
  let prevDataDir: string | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'meta-shadow-'));
    prevDataDir = process.env['NEXUS_DATA_DIR'];
    process.env['NEXUS_DATA_DIR'] = dir;
  });

  afterEach(() => {
    if (prevDataDir === undefined) delete process.env['NEXUS_DATA_DIR'];
    else process.env['NEXUS_DATA_DIR'] = prevDataDir;
    rmSync(dir, { recursive: true, force: true });
  });

  it('persists a versioned record containing only feature values', () => {
    const distinctive = 'TOP-SECRET-PROMPT-TEXT-do-not-leak-xyzzy';
    const d = decision({
      reasoning: distinctive,
      analysis: analysis({ taskType: 'code_implementation', complexityScore: 0.7 }),
    });
    persistMetaOutcome('consensus', d, true);

    const file = getMetaOutcomesFile();
    expect(existsSync(file)).toBe(true);
    const content = readFileSync(file, 'utf-8');
    // SECURITY: no free-text task content in the serialized line.
    expect(content).not.toContain(distinctive);
    expect(content).not.toContain('reasoning');

    const parsed = JSON.parse(content.trim()) as Record<string, unknown>;
    expect(parsed['schema']).toBe(META_OUTCOME_SCHEMA_VERSION);
    expect(parsed['strategy']).toBe('consensus');
    expect(parsed['success']).toBe(true);
    expect(parsed['context']).toMatchObject({ taskComplexity: 0.7, isCodeTask: 1 });
  });

  it('hydrates a selector from persisted outcomes (round-trip shifts stats)', () => {
    const d = decision({ analysis: analysis({ taskType: 'code_implementation' }) });
    for (let i = 0; i < 5; i++) persistMetaOutcome('consensus', d, true);
    persistMetaOutcome('pipeline', d, false);

    const selector = createLearnedStrategySelector();
    const replayed = hydrateShadowSelector(selector);
    expect(replayed).toBe(6);
    const consensus = selector.stats().find((s) => s.strategy === 'consensus');
    expect(consensus?.pulls).toBe(5);
  });

  it('tolerates corrupt lines during hydration (skips, no throw)', () => {
    const d = decision();
    persistMetaOutcome('pipeline', d, true);
    const file = getMetaOutcomesFile();
    writeFileSync(file, readFileSync(file, 'utf-8') + 'not-json\n{"broken":\n', 'utf-8');

    const selector = createLearnedStrategySelector();
    let replayed = 0;
    expect(() => {
      replayed = hydrateShadowSelector(selector);
    }).not.toThrow();
    expect(replayed).toBe(1);
  });

  it('filters records older than the 30-day lookback window', () => {
    // Seed via the real path so the learning dir exists, then overwrite.
    persistMetaOutcome('pipeline', decision(), true);
    const file = getMetaOutcomesFile();
    const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    const recent = new Date().toISOString();
    const ctx = toBanditContext(decision());
    const line = (ts: string): string =>
      JSON.stringify({
        schema: META_OUTCOME_SCHEMA_VERSION,
        timestamp: ts,
        strategy: 'pipeline',
        success: true,
        context: ctx,
      });
    writeFileSync(file, `${line(old)}\n${line(recent)}\n`, 'utf-8');

    const selector = createLearnedStrategySelector();
    const replayed = hydrateShadowSelector(selector);
    expect(replayed).toBe(1);
  });

  it('hydrate is a no-op when the file does not exist', () => {
    const selector = createLearnedStrategySelector();
    expect(hydrateShadowSelector(selector)).toBe(0);
  });
});
