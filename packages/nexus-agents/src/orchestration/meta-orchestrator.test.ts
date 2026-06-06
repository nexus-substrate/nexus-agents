/**
 * Tests for the MetaOrchestrator selection tier (#3549).
 *
 * Two layers: pure unit tests of the strategy-mapping helpers, and integration
 * tests of `select()` driven through the real WorkflowRouter + classifier.
 */

import { describe, it, expect } from 'vitest';
import {
  createMetaOrchestrator,
  createRecordingSink,
  strategyFromPattern,
  strategyFromPipelineType,
  type ExecutionStrategy,
  type IMetaOrchestrator,
  type MetaSelectionRecord,
} from './meta-orchestrator.js';
import type { IWorkflowRouter } from './workflow-router.js';
import type { RoutingDecision, WorkflowPattern } from './workflow-router-types.js';
import { createSharedTaskAnalyzer } from '../core/task-analysis/shared-task-analyzer.js';
import { createCapabilityGapLedger } from '../core/task-analysis/capability-gap-ledger.js';
import type { CapabilityGapReport } from '../core/task-analysis/capability-gap-detector.js';

describe('strategyFromPattern', () => {
  const cases: ReadonlyArray<
    [WorkflowPattern, 'simple' | 'moderate' | 'complex' | 'expert', ExecutionStrategy]
  > = [
    ['consensus', 'moderate', 'consensus'],
    ['graph', 'moderate', 'graph-workflow'],
    ['wave', 'moderate', 'orchestrate'],
    ['aflow', 'complex', 'orchestrate'],
    ['puppeteer', 'moderate', 'orchestrate'],
    ['sequential', 'simple', 'single-shot'],
    ['sequential', 'moderate', 'dev-pipeline'],
    ['sequential', 'expert', 'dev-pipeline'],
  ];
  it.each(cases)('pattern %s @ %s → %s', (pattern, complexity, expected) => {
    expect(strategyFromPattern(pattern, complexity)).toBe(expected);
  });
});

describe('strategyFromPipelineType', () => {
  it('maps each pipeline template to its strategy', () => {
    expect(strategyFromPipelineType('greenfield')).toBe('spec');
    expect(strategyFromPipelineType('research')).toBe('research');
    expect(strategyFromPipelineType('audit')).toBe('pipeline');
    expect(strategyFromPipelineType('dev')).toBe('dev-pipeline');
    expect(strategyFromPipelineType('general')).toBe('pipeline');
  });
});

/**
 * A fake router that runs the real analyzer for the `analysis` field but lets a
 * test pin the pattern / clarification flags deterministically.
 */
function fakeRouter(
  decision: { pattern: WorkflowPattern } & Partial<RoutingDecision>
): IWorkflowRouter {
  const analyzer = createSharedTaskAnalyzer();
  return {
    route: (signals) => ({
      pattern: decision.pattern,
      reasoning: decision.reasoning ?? 'fake',
      confidence: decision.confidence ?? 0.8,
      matchedRules: decision.matchedRules ?? ['fake'],
      alternatives: decision.alternatives ?? [],
      analysis: decision.analysis ?? analyzer.analyze(signals.description),
      ...(decision.needsClarification !== undefined
        ? { needsClarification: decision.needsClarification }
        : {}),
      ...(decision.suggestedQuestions !== undefined
        ? { suggestedQuestions: decision.suggestedQuestions }
        : {}),
      ...(decision.capabilityGaps !== undefined ? { capabilityGaps: decision.capabilityGaps } : {}),
    }),
    recordOutcome: () => {},
    getMetrics: () => [],
  };
}

describe('MetaOrchestrator.select — integration via real router', () => {
  const meta: IMetaOrchestrator = createMetaOrchestrator();

  it('routes an explicit consensus requirement to the consensus strategy', () => {
    const d = meta.select({
      goal: 'should we adopt approach A or approach B',
      signals: { requiresConsensus: true },
    });
    expect(d.strategy).toBe('consensus');
    expect(d.pattern).toBe('consensus');
  });

  it('routes greenfield scaffolding to the spec strategy', () => {
    const d = meta.select({ goal: 'scaffold a new cli project from scratch' });
    expect(d.strategy).toBe('spec');
    expect(d.pipelineType).toBe('greenfield');
  });

  it('routes research-heavy work to the research strategy', () => {
    const d = meta.select({
      goal: 'research and compare alternative approaches and evaluate the landscape',
    });
    expect(d.strategy).toBe('research');
    expect(d.pipelineType).toBe('research');
  });

  it('upgrades a sequential audit task to the templated pipeline', () => {
    const d = meta.select({
      goal: 'perform a security audit and vulnerability scan',
      signals: { dependencyStructure: 'linear' },
    });
    expect(d.pipelineType).toBe('audit');
    expect(d.pattern).toBe('sequential');
    expect(d.strategy).toBe('pipeline');
  });

  it('routes a DAG dev task to the graph-workflow strategy', () => {
    const d = meta.select({
      goal: 'implement the feature',
      signals: { dependencyStructure: 'dag' },
    });
    expect(d.pattern).toBe('graph');
    expect(d.strategy).toBe('graph-workflow');
  });

  it('routes independent dev subtasks to the orchestrate strategy', () => {
    const d = meta.select({
      goal: 'implement the feature',
      signals: { dependencyStructure: 'independent' },
    });
    expect(d.pattern).toBe('wave');
    expect(d.strategy).toBe('orchestrate');
  });

  it('always returns a transparent decision (reasoning + bounded confidence)', () => {
    const d = meta.select({
      goal: 'implement the feature',
      signals: { dependencyStructure: 'dag' },
    });
    expect(d.reasoning).toBeTruthy();
    expect(d.confidence).toBeGreaterThan(0);
    expect(d.confidence).toBeLessThanOrEqual(1);
    expect(d.analysis).toBeDefined();
  });

  it('produces alternatives that are unique and exclude the chosen strategy', () => {
    const d = meta.select({
      goal: 'implement the feature',
      signals: { dependencyStructure: 'dag' },
    });
    expect(d.alternatives).not.toContain(d.strategy);
    expect(new Set(d.alternatives).size).toBe(d.alternatives.length);
  });
});

describe('MetaOrchestrator.select — force override', () => {
  it('honors forceStrategy with full confidence and no shaping', () => {
    const meta = createMetaOrchestrator();
    const d = meta.select({ goal: 'literally anything', forceStrategy: 'spec' });
    expect(d.strategy).toBe('spec');
    expect(d.confidence).toBe(1);
    expect(d.needsShaping).toBe(false);
    expect(d.reasoning).toContain('forced');
    expect(d.alternatives).not.toContain('spec');
  });
});

describe('MetaOrchestrator.select — shaping escalation', () => {
  it('surfaces needsShaping + questions when the router asks to clarify', () => {
    const meta = createMetaOrchestrator({
      router: fakeRouter({
        pattern: 'sequential',
        needsClarification: true,
        suggestedQuestions: ['What quality level is needed?'],
      }),
    });
    const d = meta.select({ goal: 'make it better somehow' });
    expect(d.needsShaping).toBe(true);
    expect(d.shapingQuestions).toEqual(['What quality level is needed?']);
  });

  it('does not flag shaping for a well-specified task', () => {
    const meta = createMetaOrchestrator();
    const d = meta.select({
      goal: 'implement the feature',
      signals: { dependencyStructure: 'dag' },
    });
    expect(d.needsShaping).toBe(false);
    expect(d.shapingQuestions).toBeUndefined();
  });
});

describe('MetaOrchestrator.select — decision logging (step 2, #3550)', () => {
  it('emits one record per selection to the configured sink', () => {
    const sink = createRecordingSink();
    const meta = createMetaOrchestrator({ sink });
    meta.select({ goal: 'implement the feature', signals: { dependencyStructure: 'dag' } });
    meta.select({ goal: 'research and compare alternative approaches and evaluate the landscape' });
    expect(sink.getRecords()).toHaveLength(2);
  });

  it('records the decision id, strategy, signals, and forced flag', () => {
    const sink = createRecordingSink();
    const meta = createMetaOrchestrator({ sink });
    const d = meta.select({
      goal: 'implement the feature',
      signals: { dependencyStructure: 'dag' },
    });
    const rec = sink.getRecords()[0] as MetaSelectionRecord;
    expect(rec.decisionId).toBe(d.decisionId);
    expect(rec.strategy).toBe(d.strategy);
    expect(rec.pattern).toBe(d.pattern);
    expect(rec.pipelineType).toBe(d.pipelineType);
    expect(rec.alternatives).toEqual(d.alternatives);
    expect(rec.needsShaping).toBe(d.needsShaping);
    expect(rec.forced).toBe(false);
    expect(rec.goal).toBe('implement the feature');
    expect(() => new Date(rec.timestamp).toISOString()).not.toThrow();
  });

  it('flags forced=true in the record when the strategy is forced', () => {
    const sink = createRecordingSink();
    const meta = createMetaOrchestrator({ sink });
    meta.select({ goal: 'anything', forceStrategy: 'spec' });
    expect(sink.getRecords()[0]?.forced).toBe(true);
  });

  it('assigns a unique decisionId per selection', () => {
    const sink = createRecordingSink();
    const meta = createMetaOrchestrator({ sink });
    const a = meta.select({ goal: 'implement the feature' });
    const b = meta.select({ goal: 'implement the feature' });
    expect(a.decisionId).not.toBe(b.decisionId);
    expect(a.decisionId).toBeTruthy();
  });

  it('bounds the recording buffer to its max', () => {
    const sink = createRecordingSink(3);
    const meta = createMetaOrchestrator({ sink });
    for (let i = 0; i < 5; i++) meta.select({ goal: `implement feature ${String(i)}` });
    expect(sink.getRecords()).toHaveLength(3);
    // Oldest evicted — last goal retained.
    expect(sink.getRecords().at(-1)?.goal).toBe('implement feature 4');
  });
});

describe('MetaOrchestrator.select — capability gap ledger wiring (#3555)', () => {
  const gapReport: CapabilityGapReport = {
    available: { tools: [], experts: [] },
    gaps: [{ type: 'tool', name: 'deploy', suggestion: 'use run_graph_workflow' }],
    allSatisfied: false,
  };

  it('records the decision capability gaps to an injected ledger', () => {
    const ledger = createCapabilityGapLedger();
    const meta = createMetaOrchestrator({
      router: fakeRouter({ pattern: 'sequential', capabilityGaps: gapReport }),
      gapLedger: ledger,
    });
    meta.select({ goal: 'ship it to prod' });
    const summary = ledger.summarize();
    expect(summary).toHaveLength(1);
    expect(summary[0]).toMatchObject({ type: 'tool', name: 'deploy', count: 1 });
    expect(summary[0]?.exampleGoals).toContain('ship it to prod');
  });

  it('does not require a ledger (default absent, no throw)', () => {
    const meta = createMetaOrchestrator();
    expect(() => meta.select({ goal: 'implement the feature' })).not.toThrow();
  });
});
