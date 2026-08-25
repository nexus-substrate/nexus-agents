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
  type ExecutionStrategy,
  type IMetaOrchestrator,
  type MetaSelectionRecord,
} from './meta-orchestrator.js';
import { rankStrategiesByManifest } from './strategy-manifest-registry.js';
import type { IWorkflowRouter } from './workflow-router.js';
import type { RoutingDecision, WorkflowPattern } from './workflow-router-types.js';
import { createSharedTaskAnalyzer } from '../core/task-analysis/shared-task-analyzer.js';
import { createCapabilityGapLedger } from '../core/task-analysis/capability-gap-ledger.js';
import type { CapabilityGapReport } from '../core/task-analysis/capability-gap-detector.js';
import {
  createLearnedStrategySelector,
  createRecordingShadowSink,
  SHADOW_STRATEGY_ARMS,
} from './meta-shadow-selector.js';
import { AuthorityRefusalError } from './authority-tier-guard.js';

// The pre-#3888 `strategyFromPattern`/`strategyFromPipelineType` helpers (a
// hardcoded decision table that seeded the alternatives list) were removed: the
// alternatives list now derives from the SAME manifest `selectionRules` as the
// selection path via `rankStrategiesByManifest`, closing the split-brain (#3888).
// These parity tests are migrated to assert the manifest-derived expectation.
describe('manifest-derived strategy selection (was strategyFromPattern, #3888)', () => {
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
  // `general` keeps every structural pattern on its own engine; the head of the
  // manifest ranking equals the strategy the selection path would pick.
  it.each(cases)('pattern %s @ %s → %s', (pattern, complexity, expected) => {
    const ranked = rankStrategiesByManifest({ pattern, pipelineType: 'general', complexity });
    expect(ranked[0]).toBe(expected);
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

describe('MetaOrchestrator.select — manifest-driven routing audit (#3836)', () => {
  it('records the matched manifest id + schema version on an auto-routed decision', () => {
    const meta = createMetaOrchestrator();
    const d = meta.select({
      goal: 'should we adopt approach A or approach B',
      signals: { requiresConsensus: true },
    });
    expect(d.strategy).toBe('consensus');
    expect(d.manifestId).toBe('consensus');
    expect(d.manifestSchemaVersion).toBe(1);
  });

  it('reasoning cites the backing manifest (router routes over manifest data)', () => {
    const meta = createMetaOrchestrator();
    const d = meta.select({ goal: 'scaffold a new cli project from scratch' });
    expect(d.strategy).toBe('spec');
    expect(d.reasoning).toContain('manifest spec');
  });

  it('emits the manifest id + version into the selection record', () => {
    const sink = createRecordingSink();
    const meta = createMetaOrchestrator({ sink });
    meta.select({
      goal: 'research and compare alternative approaches and evaluate the landscape',
    });
    const rec = sink.getRecords()[0] as MetaSelectionRecord;
    expect(rec.strategy).toBe('research');
    expect(rec.manifestId).toBe('research');
    expect(rec.manifestSchemaVersion).toBe(1);
  });

  it('a forced strategy still resolves its manifest for the audit trail', () => {
    const sink = createRecordingSink();
    const meta = createMetaOrchestrator({ sink });
    const d = meta.select({ goal: 'anything', forceStrategy: 'dev-pipeline' });
    expect(d.manifestId).toBe('dev-pipeline');
    expect(d.manifestSchemaVersion).toBe(1);
    expect(sink.getRecords()[0]?.manifestId).toBe('dev-pipeline');
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

describe('MetaOrchestrator.select — shadow-mode learned selection (#3551)', () => {
  it('logs a shadow comparison without changing the executed decision', () => {
    const shadowSink = createRecordingShadowSink();
    const meta = createMetaOrchestrator({
      shadowSelector: createLearnedStrategySelector(),
      shadowSink,
    });
    const d = meta.select({
      goal: 'should we adopt approach A or B',
      signals: { requiresConsensus: true },
    });
    // Executed path is the rule-based choice, unchanged by shadow logging.
    expect(d.strategy).toBe('consensus');

    const records = shadowSink.getRecords();
    expect(records).toHaveLength(1);
    const rec = records[0];
    expect(rec?.decisionId).toBe(d.decisionId);
    expect(rec?.ruleStrategy).toBe('consensus');
    expect(SHADOW_STRATEGY_ARMS).toContain(rec?.learnedStrategy);
    expect(rec?.agree).toBe(rec?.learnedStrategy === 'consensus');
    expect(rec?.taskClass).toBe(d.analysis.taskType);
  });

  it('records that the prediction came from an untrained model (#4825)', () => {
    // Without this the agreement rate computed over these records reads as a
    // learned comparison, when a cold bandit returns its tie-break arm every
    // time. The seam matters: the selector reports `trained` and the summary
    // reads `modelTrained`, and nothing else joins them.
    const shadowSink = createRecordingShadowSink();
    const meta = createMetaOrchestrator({
      shadowSelector: createLearnedStrategySelector(),
      shadowSink,
    });

    meta.select({ goal: 'should we adopt approach A or B', signals: { requiresConsensus: true } });

    expect(shadowSink.getRecords()[0]?.modelTrained).toBe(false);
  });

  it('records a trained prediction as trained (#4825)', () => {
    // The pair: hardcoding false would satisfy the test above and reinstate
    // the same defect from the other side — an agreement rate stuck at zero.
    const shadowSink = createRecordingShadowSink();
    const selector = createLearnedStrategySelector();
    const shadowSelector = selector;
    const meta = createMetaOrchestrator({ shadowSelector, shadowSink });
    const first = meta.select({ goal: 'implement the feature' });
    selector.recordOutcome('single-shot', first, true);

    meta.select({ goal: 'implement another feature' });

    expect(shadowSink.getRecords()[1]?.modelTrained).toBe(true);
  });

  it('does not log when only one of selector/sink is provided', () => {
    const shadowSink = createRecordingShadowSink();
    const meta = createMetaOrchestrator({ shadowSink }); // no selector
    meta.select({ goal: 'implement the feature' });
    expect(shadowSink.getRecords()).toHaveLength(0);
  });

  it('swallows a shadow-selector failure (selection still succeeds)', () => {
    const shadowSink = createRecordingShadowSink();
    const throwingSelector = {
      predict: () => {
        throw new Error('boom');
      },
      recordOutcome: () => {},
      stats: () => [],
    };
    const meta = createMetaOrchestrator({ shadowSelector: throwingSelector, shadowSink });
    expect(() => meta.select({ goal: 'implement the feature' })).not.toThrow();
    expect(shadowSink.getRecords()).toHaveLength(0);
  });
});

describe('MetaOrchestrator.select — authority-tier enforcement (#3841, ADR-0017)', () => {
  it('PERMITS an at/below-tier action (consensus@advisory, requiredAuthority=advisory)', () => {
    const meta = createMetaOrchestrator();
    const d = meta.select({
      goal: 'should we adopt approach A or approach B',
      signals: { requiresConsensus: true },
      requiredAuthority: 'advisory',
    });
    expect(d.strategy).toBe('consensus');
  });

  it('REFUSES an above-tier action fail-closed (consensus@advisory, requiredAuthority=enforce)', () => {
    const meta = createMetaOrchestrator();
    let thrown: unknown;
    try {
      meta.select({
        goal: 'should we adopt approach A or approach B',
        signals: { requiresConsensus: true },
        requiredAuthority: 'enforce',
      });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(AuthorityRefusalError);
    const refusal = thrown as AuthorityRefusalError;
    expect(refusal.code).toBe('above_declared_tier');
    expect(refusal.strategy).toBe('consensus');
    expect(refusal.declaredTier).toBe('advisory');
    expect(refusal.attemptedAction).toBe('enforce');
  });

  it('does NOT record a decision when the action is refused (fail-closed before record)', () => {
    const sink = createRecordingSink();
    const meta = createMetaOrchestrator({ sink });
    expect(() =>
      meta.select({
        goal: 'implement the feature',
        requiredAuthority: 'enforce',
      })
    ).toThrow(AuthorityRefusalError);
    expect(sink.getRecords()).toHaveLength(0);
  });

  it('does not enforce when requiredAuthority is absent (no above-tier action requested)', () => {
    const meta = createMetaOrchestrator();
    expect(() => meta.select({ goal: 'implement the feature' })).not.toThrow();
  });
});

describe('run does NOT enrich classification via issue_triage (#4676)', () => {
  // Deliberate asymmetry, pinned so a future change flips it on purpose.
  //
  // `runAdaptiveOrchestrator` enriches low-confidence classifications; the live
  // half of that chain is `tryIssueTriage`, which calls `issue_triage` — a
  // consumer of UNTRUSTED GitHub content. `select()` does not, which keeps that
  // surface opt-in behind `run_pipeline` rather than ambient on the default
  // entry point.
  //
  // A 7-voter panel chose to keep it (unanimous among approvers) on exactly
  // that reasoning. Without this test the decision lives only in prose, and
  // prose does not fail CI.

  it('select() stays synchronous — the structural reason enrichment is unreachable', () => {
    const meta = createMetaOrchestrator();
    const result = meta.select({ goal: 'https://github.com/owner/repo/issues/42' });

    // Not a promise. `select()` cannot await, so the async enrichment chain
    // cannot run behind it — this is the constraint any future change starts from.
    expect(result).not.toBeInstanceOf(Promise);
    expect(typeof (result as { then?: unknown }).then).toBe('undefined');
  });

  it('classifies an issue URL by keywords alone, without triaging it', () => {
    const meta = createMetaOrchestrator();
    const decision = meta.select({ goal: 'https://github.com/owner/repo/issues/42' });

    // It still returns a usable decision — the point is HOW it got there.
    expect(decision.strategy).toBeDefined();
    // Keyword scoring over a bare URL yields no triage-derived category. If a
    // future change routes issue_triage into `select()`, this is the assertion
    // that should be updated deliberately rather than silently.
    expect(decision.reasoning.toLowerCase()).not.toContain('triage');
  });
});
