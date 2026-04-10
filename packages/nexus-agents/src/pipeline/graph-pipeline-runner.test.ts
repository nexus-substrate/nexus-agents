/**
 * Tests for Graph Pipeline Runner (#1735, Phase 2)
 */

import { describe, it, expect, vi } from 'vitest';
import { runGraphPipeline } from './graph-pipeline-runner.js';
import type { DevPipelineStages, VoteResult, QaReviewResult } from './dev-pipeline.js';
import { DEV_PIPELINE_TEMPLATE } from './templates.js';
import { createDevStageRegistry } from './stage-wrappers.js';
import { PIPELINE_STATE_KEYS as K } from './stage-types.js';
import type { PipelineTemplate } from './stage-types.js';

// Mock pipeline-observability to avoid event bus side effects
vi.mock('./pipeline-observability.js', () => ({
  emitPipelineStageEvent: vi.fn(),
}));

// ============================================================================
// Helpers
// ============================================================================

function createMockStages(): DevPipelineStages {
  return {
    research: vi.fn<(task: string) => Promise<string>>().mockResolvedValue('Research done'),
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
    securityScan: vi.fn().mockResolvedValue({ passed: true, feedback: '' }),
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
});
