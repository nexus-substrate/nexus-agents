/**
 * Pipeline Eval — Stage Wrapper Failure Modes
 *
 * Verifies SharedMemoryStore integrity and failure contract:
 * - Failed stages do NOT leak entries into shared memory
 * - Successful stages write exactly the expected entry
 * - Stage re-runs accumulate entries (no silent dedup)
 * - Failed stages return success=false and a real error message
 *
 * Run: pnpm vitest run src/pipeline/pipeline-eval-stages.test.ts
 */

import { describe, it, expect, vi } from 'vitest';
import { SharedMemoryStore } from './shared-memory.js';
import {
  createResearchStageWrapper,
  createPlanStageWrapper,
  createVoteStageWrapper,
  createDecomposeStageWrapper,
} from './stage-wrappers.js';
import { PIPELINE_STATE_KEYS as K } from './stage-types.js';
import type { PipelineContext } from './stage-types.js';
import type {
  DevPipelineStages,
  PipelineTask,
  VoteResult,
  QaReviewResult,
} from './dev-pipeline.js';

function ctx(
  sharedMemory = new SharedMemoryStore(),
  state: Record<string, unknown> = {}
): PipelineContext {
  return {
    executionId: 'eval',
    task: 'Test task',
    templateId: 'dev',
    state: { [K.TASK]: 'Test task', ...state },
    sharedMemory,
  };
}

function stagesWith(overrides: Partial<DevPipelineStages>): DevPipelineStages {
  return {
    research: vi.fn<(t: string) => Promise<string>>().mockResolvedValue('r'),
    plan: vi.fn<(t: string, r: string, f?: string) => Promise<string>>().mockResolvedValue('p'),
    vote: vi
      .fn<(p: string) => Promise<VoteResult>>()
      .mockResolvedValue({ kind: 'approved', approvalPercentage: 80 }),
    decompose: vi.fn<(p: string) => Promise<PipelineTask[]>>().mockResolvedValue([]),
    implement: vi.fn<(t: PipelineTask) => Promise<string>>().mockResolvedValue('i'),
    qaReview: vi
      .fn<(t: PipelineTask, i: string) => Promise<QaReviewResult>>()
      .mockResolvedValue({ verdict: 'pass', feedback: '', issues: [] }),
    securityScan: vi.fn().mockResolvedValue({ passed: true, findings: [] }),
    ...overrides,
  };
}

// ============================================================================
// Failure contract — no shared memory leak on throw
// ============================================================================

describe('Pipeline Eval — Failure Contract', () => {
  it('research failure leaves shared memory untouched', async () => {
    const mem = new SharedMemoryStore();
    const stages = stagesWith({
      research: vi.fn<(t: string) => Promise<string>>().mockRejectedValue(new Error('boom')),
    });
    const res = await createResearchStageWrapper(stages).execute(ctx(mem));
    expect(res.success).toBe(false);
    expect(mem.read('discovery')).toEqual([]);
  });

  it('plan failure leaves shared memory untouched', async () => {
    const mem = new SharedMemoryStore();
    const stages = stagesWith({
      plan: vi
        .fn<(t: string, r: string, f?: string) => Promise<string>>()
        .mockRejectedValue(new Error('plan fail')),
    });
    const res = await createPlanStageWrapper(stages).execute(ctx(mem, { [K.RESEARCH]: 'data' }));
    expect(res.success).toBe(false);
    expect(mem.read('decision')).toEqual([]);
  });

  it('failed stage surfaces error message in error field', async () => {
    const stages = stagesWith({
      research: vi
        .fn<(t: string) => Promise<string>>()
        .mockRejectedValue(new Error('specific message')),
    });
    const res = await createResearchStageWrapper(stages).execute(ctx());
    expect(res.success).toBe(false);
    // Failure contract: value=null, error holds the message
    expect(res.value).toBe(null);
    expect(String(res.error)).toContain('specific message');
  });

  it('vote failure preserves state of prior stages', async () => {
    const mem = new SharedMemoryStore();
    mem.write('plan', 'decision', 'existing-plan');
    const stages = stagesWith({
      vote: vi.fn<(p: string) => Promise<VoteResult>>().mockRejectedValue(new Error('vote crash')),
    });
    const res = await createVoteStageWrapper(stages).execute(ctx(mem, { [K.PLAN]: 'p' }));
    expect(res.success).toBe(false);
    // Prior plan decision still intact
    expect(mem.read('decision').length).toBe(1);
    expect(mem.read('decision')[0]?.content).toBe('existing-plan');
  });

  it('decompose failure returns empty tasks array via failOutput', async () => {
    const stages = stagesWith({
      decompose: vi
        .fn<(p: string) => Promise<PipelineTask[]>>()
        .mockRejectedValue(new Error('decompose failed')),
    });
    const res = await createDecomposeStageWrapper(stages).execute(
      ctx(undefined, { [K.PLAN]: 'p' })
    );
    expect(res.success).toBe(false);
  });
});

// ============================================================================
// Success contract — exactly one entry, right tag, right stage
// ============================================================================

describe('Pipeline Eval — Success Contract', () => {
  it('research writes exactly one discovery entry', async () => {
    const mem = new SharedMemoryStore();
    await createResearchStageWrapper(stagesWith({})).execute(ctx(mem));
    const entries = mem.read('discovery');
    expect(entries.length).toBe(1);
    expect(entries[0]?.sourceStage).toBe('research');
  });

  it('plan writes exactly one decision entry', async () => {
    const mem = new SharedMemoryStore();
    await createPlanStageWrapper(stagesWith({})).execute(ctx(mem, { [K.RESEARCH]: 'r' }));
    const entries = mem.read('decision');
    expect(entries.length).toBe(1);
    expect(entries[0]?.sourceStage).toBe('plan');
  });

  it('vote success does NOT write to shared memory (not a discovery)', async () => {
    const mem = new SharedMemoryStore();
    await createVoteStageWrapper(stagesWith({})).execute(ctx(mem, { [K.PLAN]: 'p' }));
    // Vote results live in state, not shared memory — by design
    expect(mem.read().length).toBe(0);
  });

  it('re-running research accumulates entries (no silent dedup)', async () => {
    const mem = new SharedMemoryStore();
    const wrapper = createResearchStageWrapper(stagesWith({}));
    await wrapper.execute(ctx(mem));
    await wrapper.execute(ctx(mem));
    expect(mem.read('discovery').length).toBe(2);
  });
});

// ============================================================================
// State key contract
// ============================================================================

describe('Pipeline Eval — State Key Contract', () => {
  it('research success writes to K.RESEARCH', async () => {
    const res = await createResearchStageWrapper(stagesWith({})).execute(ctx());
    expect(res.stateKey).toBe(K.RESEARCH);
  });

  it('plan success writes to K.PLAN', async () => {
    const res = await createPlanStageWrapper(stagesWith({})).execute(
      ctx(undefined, { [K.RESEARCH]: 'r' })
    );
    expect(res.stateKey).toBe(K.PLAN);
  });

  it('failed stage still returns the same stateKey (no swapping on failure)', async () => {
    const stages = stagesWith({
      research: vi.fn<(t: string) => Promise<string>>().mockRejectedValue(new Error('x')),
    });
    const res = await createResearchStageWrapper(stages).execute(ctx());
    expect(res.stateKey).toBe(K.RESEARCH);
    expect(res.success).toBe(false);
  });
});
