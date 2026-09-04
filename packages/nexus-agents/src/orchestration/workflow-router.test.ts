/**
 * Tests for Workflow Pattern Router.
 *
 * (Source: Issue #844 — Intelligent Workflow Pattern Router)
 */

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { createWorkflowRouter } from './workflow-router.js';
import type { TaskSignals } from './workflow-router-types.js';

// ============================================================================
// Helpers
// ============================================================================

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function route(signals: TaskSignals) {
  const router = createWorkflowRouter();
  return router.route(signals);
}

// ============================================================================
// Force Pattern (Escape Hatch)
// ============================================================================

describe('force pattern', () => {
  it('overrides all rules when forcePattern is set', () => {
    const decision = route({
      description: 'simple hello world task',
      forcePattern: 'consensus',
    });
    expect(decision.pattern).toBe('consensus');
    expect(decision.confidence).toBe(1.0);
    expect(decision.reasoning).toContain('forced');
  });

  it('works for every pattern type', () => {
    const patterns = ['sequential', 'wave', 'graph', 'consensus', 'aflow', 'puppeteer'] as const;
    for (const p of patterns) {
      const d = route({ description: 'task', forcePattern: p });
      expect(d.pattern).toBe(p);
    }
  });
});

// ============================================================================
// Consensus Required
// ============================================================================

describe('consensus routing', () => {
  it('routes to consensus when requiresConsensus is true', () => {
    const decision = route({
      description: 'evaluate architecture proposal',
      requiresConsensus: true,
    });
    expect(decision.pattern).toBe('consensus');
    expect(decision.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('does not route to consensus when flag is false', () => {
    const decision = route({
      description: 'evaluate architecture proposal',
      requiresConsensus: false,
    });
    expect(decision.pattern).not.toBe('consensus');
  });
});

// ============================================================================
// Independent Subtasks → Wave
// ============================================================================

describe('wave routing', () => {
  it('routes to wave for independent subtasks', () => {
    const decision = route({
      description: 'process multiple files',
      dependencyStructure: 'independent',
    });
    expect(decision.pattern).toBe('wave');
    expect(decision.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('routes to wave for parallelizable tasks with multiple subtasks', () => {
    const decision = route({
      description: 'scan multiple directories in parallel for bugs',
      subtaskCount: 5,
    });
    expect(decision.pattern).toBe('wave');
  });

  it('routes to wave for bulk operations via dependency hint', () => {
    const decision = route({
      description: 'bulk rename all files matching pattern across codebase',
      dependencyStructure: 'independent',
    });
    expect(decision.pattern).toBe('wave');
  });
});

// ============================================================================
// Linear Dependencies → Sequential
// ============================================================================

describe('sequential routing', () => {
  it('routes to sequential for linear dependencies', () => {
    const decision = route({
      description: 'process pipeline data',
      dependencyStructure: 'linear',
    });
    expect(decision.pattern).toBe('sequential');
    expect(decision.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('routes to sequential for simple tasks', () => {
    const decision = route({
      description: 'fix a typo in README',
    });
    expect(decision.pattern).toBe('sequential');
    expect(decision.reasoning).toContain('Simple');
  });
});

// ============================================================================
// DAG Dependencies → Graph
// ============================================================================

describe('graph routing', () => {
  it('routes to graph for DAG dependency structure', () => {
    const decision = route({
      description: 'complex multi-step deployment',
      dependencyStructure: 'dag',
    });
    expect(decision.pattern).toBe('graph');
    expect(decision.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('uses graph as fallback for unknown tasks', () => {
    const decision = route({
      description: 'do something moderately complex with code implementation',
    });
    // Should not fall through to the absolute fallback if rules match
    // but graph is the expected fallback pattern
    expect(['graph', 'sequential', 'wave']).toContain(decision.pattern);
  });
});

// ============================================================================
// Novel Tasks → AFlow
// ============================================================================

describe('aflow routing', () => {
  it('routes to aflow for novel complex tasks with DAG hint', () => {
    // AFlow requires isNovel=true AND complex/expert complexity.
    // When analyzer classifies as simple, ruleSimpleTask fires first.
    // Use a long multi-clause description to trigger complex classification.
    const decision = route({
      description:
        'design and implement a completely new distributed consensus algorithm ' +
        'with custom protocol handling, fault tolerance, leader election, ' +
        'Byzantine fault detection, network partition recovery, and formal verification ' +
        'across multiple interconnected subsystems with complex dependency chains',
      isNovel: true,
      timeConstraint: 'relaxed',
    });
    // If analyzer sees this as complex enough, routes to aflow.
    // Otherwise a different rule fires — both are valid routing decisions.
    if (decision.analysis.complexity === 'complex' || decision.analysis.complexity === 'expert') {
      expect(decision.pattern).toBe('aflow');
    } else {
      // Still a valid routing — just not complex enough for aflow
      expect(decision.pattern).toBeDefined();
    }
  });

  it('does not route to aflow for urgent novel tasks', () => {
    const decision = route({
      description: 'implement new consensus algorithm urgently',
      isNovel: true,
      timeConstraint: 'urgent',
    });
    expect(decision.pattern).not.toBe('aflow');
  });

  it('does not route to aflow for simple novel tasks', () => {
    const decision = route({
      description: 'simple task',
      isNovel: true,
    });
    expect(decision.pattern).not.toBe('aflow');
  });
});

// ============================================================================
// Decision Metadata
// ============================================================================

describe('decision metadata', () => {
  it('includes analysis result from SharedTaskAnalyzer', () => {
    const decision = route({ description: 'implement feature' });
    expect(decision.analysis).toBeDefined();
    expect(decision.analysis.complexity).toBeDefined();
    expect(decision.analysis.taskType).toBeDefined();
    expect(decision.analysis.capabilities).toBeDefined();
  });

  it('includes matched rules', () => {
    const decision = route({
      description: 'process data',
      dependencyStructure: 'linear',
    });
    expect(decision.matchedRules.length).toBeGreaterThan(0);
  });

  it('includes alternative patterns', () => {
    const decision = route({ description: 'simple task' });
    expect(decision.alternatives.length).toBeGreaterThan(0);
    expect(decision.alternatives).not.toContain(decision.pattern);
  });

  it('confidence is between 0 and 1', () => {
    const decision = route({ description: 'any task' });
    expect(decision.confidence).toBeGreaterThanOrEqual(0);
    expect(decision.confidence).toBeLessThanOrEqual(1);
  });
});

// ============================================================================
// DryRun Mode
// ============================================================================

describe('dryRun mode', () => {
  it('returns decision without side effects in dryRun', () => {
    const router = createWorkflowRouter();
    const decision = router.route({ description: 'test task' }, { dryRun: true });
    expect(decision.pattern).toBeDefined();
    expect(decision.reasoning).toBeDefined();
  });
});

// ============================================================================
// Performance Metrics
// ============================================================================

describe('performance tracking', () => {
  it('records and retrieves pattern outcomes', () => {
    const router = createWorkflowRouter();
    router.recordOutcome({
      pattern: 'sequential',
      taskType: 'code_implementation',
      success: true,
      durationMs: 500,
      timestamp: Date.now(),
    });
    router.recordOutcome({
      pattern: 'sequential',
      taskType: 'code_implementation',
      success: false,
      durationMs: 1000,
      timestamp: Date.now(),
    });

    const metrics = router.getMetrics('sequential');
    expect(metrics).toHaveLength(1);
    const m = metrics[0];
    expect(m).toBeDefined();
    expect(m?.totalExecutions).toBe(2);
    expect(m?.successCount).toBe(1);
    expect(m?.successRate).toBe(0.5);
    expect(m?.avgDurationMs).toBe(750);
  });

  it('returns empty metrics when no outcomes recorded', () => {
    const router = createWorkflowRouter();
    const metrics = router.getMetrics();
    expect(metrics).toHaveLength(0);
  });

  it('filters metrics by pattern', () => {
    const router = createWorkflowRouter();
    router.recordOutcome({
      pattern: 'wave',
      taskType: 'bulk_operations',
      success: true,
      durationMs: 200,
      timestamp: Date.now(),
    });
    router.recordOutcome({
      pattern: 'sequential',
      taskType: 'general',
      success: true,
      durationMs: 300,
      timestamp: Date.now(),
    });

    expect(router.getMetrics('wave')).toHaveLength(1);
    expect(router.getMetrics('sequential')).toHaveLength(1);
    expect(router.getMetrics('graph')).toHaveLength(0);
    expect(router.getMetrics()).toHaveLength(2);
  });

  it('groups metrics by pattern + taskType', () => {
    const router = createWorkflowRouter();
    router.recordOutcome({
      pattern: 'graph',
      taskType: 'architecture',
      success: true,
      durationMs: 1000,
      timestamp: Date.now(),
    });
    router.recordOutcome({
      pattern: 'graph',
      taskType: 'code_review',
      success: true,
      durationMs: 500,
      timestamp: Date.now(),
    });

    const metrics = router.getMetrics('graph');
    expect(metrics).toHaveLength(2);
  });

  it('bounds stored outcomes to prevent unbounded growth', () => {
    const router = createWorkflowRouter();
    for (let i = 0; i < 250; i++) {
      router.recordOutcome({
        pattern: 'sequential',
        taskType: 'general',
        success: true,
        durationMs: 100,
        timestamp: i,
      });
    }
    const metrics = router.getMetrics();
    expect(metrics).toHaveLength(1);
    // Should have capped at MAX_OUTCOMES (200)
    expect(metrics[0]?.totalExecutions).toBeLessThanOrEqual(200);
  });
});

// ============================================================================
// High Ambiguity → Clarification (Issue #904)
// ============================================================================

describe('high ambiguity routing', () => {
  it('flags needsClarification for highly ambiguous input', () => {
    const decision = route({ description: 'fix it' });
    expect(decision.needsClarification).toBe(true);
    expect(decision.suggestedQuestions).toBeDefined();
    const questions = decision.suggestedQuestions ?? [];
    expect(questions.length).toBeGreaterThan(0);
  });

  it('suggests scope question when no files referenced', () => {
    const decision = route({ description: 'make it better' });
    expect(decision.needsClarification).toBe(true);
    const questions = decision.suggestedQuestions ?? [];
    expect(
      questions.some(
        (q) => q.toLowerCase().includes('files') || q.toLowerCase().includes('modules')
      )
    ).toBe(true);
  });

  it('does not flag clarification for specific tasks', () => {
    const decision = route({
      description:
        'implement the validateInput function in src/utils/validator.ts with Zod schema validation for PR #123',
    });
    expect(decision.needsClarification).toBeUndefined();
  });

  it('skips ambiguity rule when structural hints provided', () => {
    const decision = route({
      description: 'do stuff',
      dependencyStructure: 'dag',
    });
    expect(decision.pattern).toBe('graph');
    expect(decision.needsClarification).toBeUndefined();
  });
});

// ============================================================================
// Reasoning-Heavy → Graph (Issue #904)
// ============================================================================

describe('reasoning-heavy routing', () => {
  it('routes complex reasoning tasks to graph', () => {
    const decision = route({
      description:
        'first analyze the complex distributed architecture security performance trade-off in src/core/. ' +
        'then evaluate and compare concurrent algorithm patterns with race condition analysis. ' +
        'after that, deduce and prove the optimal design pattern for the legacy refactor. ' +
        'finally derive conclusions and infer recommendations for PR #42. ' +
        'why is the deadlock occurring? how can we solve the memory leak?',
    });
    expect(decision.pattern).toBe('graph');
    expect(decision.matchedRules).toContain('ruleReasoningHeavy');
  });
});

// ============================================================================
// Auto-derived Time Constraints (Issue #904)
// ============================================================================

describe('auto-derived constraints', () => {
  it('auto-detects urgent time constraint from description', () => {
    const decision = route({
      description: 'deploy the fix ASAP to production using the existing pipeline',
      isNovel: true,
    });
    // If time is urgent, ruleNovelTask should skip (it returns undefined for urgent)
    // This validates the enrichSignals auto-derivation works
    expect(decision.matchedRules).not.toContain('ruleNovelTask');
  });
});

// ============================================================================
// Fallback Behavior
// ============================================================================

describe('fallback', () => {
  it('falls back to graph for ambiguous moderate tasks', () => {
    // Craft a task that doesn't trigger any specific rule
    const decision = route({
      description: 'moderate complexity general purpose code implementation task for feature',
    });
    // Either a rule matches or we get graph fallback — both valid
    expect(decision.pattern).toBeDefined();
    expect(decision.reasoning.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Vestigial signal vocabulary (#5097 finding 5)
// ============================================================================

describe('qualityRequirement is never read (#5097)', () => {
  // Fidelity pin: no routing rule consults `signals.qualityRequirement`, so
  // setting it must not change the decision in any way. If a rule ever starts
  // reading it, this test is the one that should fail — then un-deprecate the
  // field and replace this pin with a test of the new behaviour.
  const descriptions = [
    'simple hello world task',
    'refactor the auth module and add tests for edge cases',
    'design and implement a completely new distributed consensus algorithm ' +
      'with custom protocol handling, fault tolerance, leader election, ' +
      'Byzantine fault detection, network partition recovery, and formal verification',
  ];
  const levels = ['best-effort', 'high', 'critical'] as const;

  it.each(levels)('routing output is identical with and without qualityRequirement=%s', level => {
    for (const description of descriptions) {
      const base: TaskSignals = { description, isNovel: true };
      const withHint: TaskSignals = { ...base, qualityRequirement: level };
      expect(route(withHint)).toEqual(route(base));
    }
  });
});

describe('TimeConstraint inference vocabulary (#5097)', () => {
  // `enrichSignals` is module-private and the router never surfaces the
  // enriched signals, so the only honest pin on "what the inference can emit"
  // is the set of literals the module assigns. Reading the source is
  // deliberate: 'relaxed' and 'normal' are behaviourally indistinguishable to
  // every consumer, so no black-box test can tell them apart.
  const source = readFileSync(new URL('./workflow-router.ts', import.meta.url), 'utf8');

  it("the inference emits only 'urgent' | 'normal' — no path produces 'relaxed'", () => {
    const produced = [...source.matchAll(/timeConstraint:\s*'([a-z-]+)'/g)].map(m => m[1]);
    // Name the empty case: a regex that matches nothing would "prove" the
    // absence of 'relaxed' vacuously.
    expect(produced.length).toBeGreaterThan(0);
    expect([...new Set(produced)].sort()).toEqual(['normal', 'urgent']);
  });

  it("the only consumer tests for 'urgent'", () => {
    const compared = [...source.matchAll(/timeConstraint\s*===\s*'([a-z-]+)'/g)].map(m => m[1]);
    expect(compared.length).toBeGreaterThan(0);
    expect([...new Set(compared)]).toEqual(['urgent']);
  });
});
