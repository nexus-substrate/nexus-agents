/**
 * Tests for the MetaOrchestrator selection tier (#3549).
 *
 * Two layers: pure unit tests of the strategy-mapping helpers, and integration
 * tests of `select()` driven through the real WorkflowRouter + classifier.
 */

import { describe, it, expect } from 'vitest';
import {
  createMetaOrchestrator,
  strategyFromPattern,
  strategyFromPipelineType,
  type ExecutionStrategy,
  type IMetaOrchestrator,
} from './meta-orchestrator.js';
import type { IWorkflowRouter } from './workflow-router.js';
import type { RoutingDecision, WorkflowPattern } from './workflow-router-types.js';
import { createSharedTaskAnalyzer } from '../core/task-analysis/shared-task-analyzer.js';

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
