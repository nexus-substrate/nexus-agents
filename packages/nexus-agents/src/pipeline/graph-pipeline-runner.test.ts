/**
 * Tests for Graph Pipeline Runner (#1735, Phase 2)
 */

import { describe, it, expect, vi } from 'vitest';
import { researchContextFromText, type ResearchContext } from './research-context.js';
import { runGraphPipeline } from './graph-pipeline-runner.js';
import type { DevPipelineStages, VoteResult, QaReviewResult } from './dev-pipeline.js';
import { DEV_PIPELINE_TEMPLATE } from './templates.js';
import { createDevStageRegistry } from './stage-wrappers.js';
import { PIPELINE_STATE_KEYS as K } from './stage-types.js';
import type { PipelineTemplate } from './stage-types.js';
import type { StageRegistry } from './pipeline-graph.js';

// Mock pipeline-observability to avoid event bus side effects
vi.mock('./pipeline-observability.js', () => ({
  emitPipelineStageEvent: vi.fn(),
}));

// ============================================================================
// Helpers
// ============================================================================

function createMockStages(): DevPipelineStages {
  return {
    research: vi
      .fn<(task: string) => Promise<ResearchContext>>()
      .mockResolvedValue(researchContextFromText('Research done')),
    plan: vi
      .fn<(task: string, research: string, feedback?: string) => Promise<string>>()
      .mockResolvedValue('Plan done'),
    vote: vi
      .fn<(plan: string) => Promise<VoteResult>>()
      .mockResolvedValue({ kind: 'approved', approvalPercentage: 83 }),
    decompose: vi
      .fn()
      .mockResolvedValue([
        { id: 't1', title: 'Task 1', description: 'D', assignedTo: 'coder', status: 'pending' },
      ]),
    implement: vi.fn<() => Promise<string>>().mockResolvedValue('Code done'),
    qaReview: vi
      .fn<() => Promise<QaReviewResult>>()
      .mockResolvedValue({ verdict: 'pass', feedback: '', issues: [] }),
    securityScan: vi.fn().mockResolvedValue({ passed: true, verdict: 'pass', feedback: '' }),
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('runGraphPipeline', () => {
  it('executes dev pipeline template end-to-end', async () => {
    const stages = createMockStages();
    const registry = createDevStageRegistry(stages);

    const result = await runGraphPipeline('Build feature', DEV_PIPELINE_TEMPLATE, registry);

    expect(result.success).toBe(true);
    expect(result.templateId).toBe('dev');
    expect(result.stepsExecuted).toBeGreaterThan(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.finalState[K.RESEARCH]).toBe('Research done');
    expect(result.finalState[K.PLAN]).toBe('Plan done');
    expect(result.finalState[K.SECURITY_PASSED]).toBe(true);
  });

  it('stops at vote stage in dryRun mode', async () => {
    const stages = createMockStages();
    const registry = createDevStageRegistry(stages);

    const result = await runGraphPipeline('Build feature', DEV_PIPELINE_TEMPLATE, registry, {
      dryRun: true,
    });

    expect(result.success).toBe(true);
    // Should have research, plan, vote but NOT decompose, implement, qa, security
    expect(result.finalState[K.RESEARCH]).toBe('Research done');
    expect(result.finalState[K.PLAN]).toBe('Plan done');
    expect(stages.decompose).not.toHaveBeenCalled();
    expect(stages.securityScan).not.toHaveBeenCalled();
  });

  it('returns error for missing stage implementations', async () => {
    const template: PipelineTemplate = {
      id: 'broken',
      name: 'Broken',
      stages: ['nonexistent'],
    };
    const registry = new Map();

    const result = await runGraphPipeline('Task', template, registry);

    expect(result.success).toBe(false);
    expect(result.error).toContain('nonexistent');
  });

  it('handles empty template gracefully', async () => {
    const template: PipelineTemplate = { id: 'empty', name: 'Empty', stages: [] };
    const registry = new Map();

    const result = await runGraphPipeline('Task', template, registry);

    // Empty pipeline may succeed (no stages to execute) or fail on compilation
    expect(typeof result.success).toBe('boolean');
  });

  it('preserves task in final state', async () => {
    const stages = createMockStages();
    const registry = createDevStageRegistry(stages);

    const result = await runGraphPipeline('My task', DEV_PIPELINE_TEMPLATE, registry);

    expect(result.finalState[K.TASK]).toBe('My task');
  });

  it('reports failure when maxSteps leaves a pipeline stage pending', async () => {
    const stages = createMockStages();
    const registry = createDevStageRegistry(stages);

    const result = await runGraphPipeline('Build feature', DEV_PIPELINE_TEMPLATE, registry, {
      maxSteps: 1,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('maxSteps exhausted');
    expect(result.error).toContain('plan');
  });
});

// #4362 (increment 1 of the unanimous Option C decision on #4351). Two fail-open
// links used to swallow stage failure end to end: `createNodeHandler` discarded
// `StageOutput.success`/`.error`, and `executeAndReport` derived `success` purely
// from "the BSP loop returned", never inspecting `nodeResults`. A pipeline whose
// stages all failed therefore reported `success: true`.
//
// Mechanism chosen by `consensus_vote` (higher_order, 7/0): signal through the
// executor's ONE existing failure channel (`NodeResult.status`) rather than adding
// a parallel error key to graph state.
describe('stage failure propagation (#4362)', () => {
  /** Minimal single-stage template + registry with a stage that fails. */
  function failingSetup(error: string): { template: PipelineTemplate; registry: StageRegistry } {
    const template: PipelineTemplate = { id: 'failing', name: 'Failing', stages: ['boom'] };
    const registry: StageRegistry = new Map([
      [
        'boom',
        {
          id: 'boom',
          name: 'Boom',
          execute: () =>
            Promise.resolve({
              stateKey: K.RESEARCH,
              value: null,
              durationMs: 1,
              success: false,
              error,
            }),
        },
      ],
    ]);
    return { template, registry };
  }

  it('reports success: false when a stage returns success: false', async () => {
    const { template, registry } = failingSetup('adapter rejected the request');

    const result = await runGraphPipeline('Task', template, registry);

    expect(result.success).toBe(false);
  });

  it('names the failed stage and surfaces its error message', async () => {
    const { template, registry } = failingSetup('adapter rejected the request');

    const result = await runGraphPipeline('Task', template, registry);

    expect(result.error).toContain('boom');
    expect(result.error).toContain('adapter rejected the request');
  });

  it('keeps the partial finalState from stages that did succeed', async () => {
    const template: PipelineTemplate = {
      id: 'partial',
      name: 'Partial',
      stages: ['ok', 'boom'],
    };
    const registry: StageRegistry = new Map([
      [
        'ok',
        {
          id: 'ok',
          name: 'Ok',
          execute: () =>
            Promise.resolve({ stateKey: K.PLAN, value: 'planned', durationMs: 1, success: true }),
        },
      ],
      [
        'boom',
        {
          id: 'boom',
          name: 'Boom',
          execute: () =>
            Promise.resolve({
              stateKey: K.RESEARCH,
              value: null,
              durationMs: 1,
              success: false,
              error: 'nope',
            }),
        },
      ],
    ]);

    const result = await runGraphPipeline('Task', template, registry);

    expect(result.success).toBe(false);
    // The failure must not throw away what earlier stages produced — callers
    // inspect finalState to see how far the run got.
    expect(result.finalState[K.PLAN]).toBe('planned');
  });

  it('does not write the failed stage’s state key', async () => {
    // A thrown handler contributes `stateUpdates: {}`, so the key keeps its
    // registered defaultValue rather than the `null` that stage-wrappers’
    // `failOutput` would have written. Every in-tree template is a linear
    // START→…→END chain (no template populates `edges`), so no stage can
    // observe a stale prior-iteration value here. Pinned so the semantics are
    // documented rather than accidental.
    const { template, registry } = failingSetup('nope');

    const result = await runGraphPipeline('Task', template, registry);

    expect(result.finalState[K.RESEARCH]).toBe('');
  });

  it('still reports success for a template that never sets COMPLETED', async () => {
    // Regression against the design the #4351 panel rejected: deriving success
    // from `finalState.completed` would fail-wrong on every dev/general/
    // greenfield run, because those templates never write that key.
    const stages = createMockStages();
    const registry = createDevStageRegistry(stages);

    const result = await runGraphPipeline('Build feature', DEV_PIPELINE_TEMPLATE, registry);

    expect(result.finalState[K.COMPLETED]).toBeFalsy();
    expect(result.success).toBe(true);
  });

  describe('a truncated dry run says what it covered (#5875-adjacent sweep)', () => {
    // DEV_PIPELINE_TEMPLATE declares 7 stages and stops after 'vote' in dryRun,
    // so decompose/implement/qa/security never run. Before this, the result was
    // `success: true, templateId: 'dev'` — byte-identical to a full run that
    // actually executed the qa and security stages.
    it('reports 3 of 7 stages and flags the run as a dry run', async () => {
      const result = await runGraphPipeline(
        'Build feature',
        DEV_PIPELINE_TEMPLATE,
        createDevStageRegistry(createMockStages()),
        { dryRun: true }
      );

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(result.stagesPlanned).toBe(7);
      expect(result.stagesRun).toBe(3);
    });

    it('a full run reports every stage and no dryRun flag', async () => {
      const result = await runGraphPipeline(
        'Build feature',
        DEV_PIPELINE_TEMPLATE,
        createDevStageRegistry(createMockStages())
      );

      expect(result.dryRun).toBeUndefined();
      expect(result.stagesPlanned).toBe(7);
      expect(result.stagesRun).toBe(7);
    });

    it('makes the two distinguishable — the whole point', async () => {
      // Both succeed. Before the coverage fields, every field a consumer reads
      // was equal between them, so no caller could tell 3 stages from 7.
      const registry = createDevStageRegistry(createMockStages());
      const dry = await runGraphPipeline('t', DEV_PIPELINE_TEMPLATE, registry, { dryRun: true });
      const full = await runGraphPipeline('t', DEV_PIPELINE_TEMPLATE, registry);

      expect(dry.success).toBe(true);
      expect(full.success).toBe(true);
      expect(dry.templateId).toBe(full.templateId);
      expect(dry.stagesRun).not.toBe(full.stagesRun);
    });

    it('a dryRun of a template with no dryRunStopAfter still flags itself', async () => {
      // Nothing is truncated here, so stagesRun === stagesPlanned. `dryRun` is
      // stamped from the OPTION, because calling this a normal run would be the
      // same misreport pointing the other way.
      const noStop: PipelineTemplate = {
        id: 'nostop',
        name: 'No stop',
        stages: ['research', 'plan'],
      };
      const result = await runGraphPipeline(
        'Build feature',
        noStop,
        createDevStageRegistry(createMockStages()),
        { dryRun: true }
      );

      expect(result.dryRun).toBe(true);
      expect(result.stagesRun).toBe(2);
      expect(result.stagesPlanned).toBe(2);
    });
  });
});
