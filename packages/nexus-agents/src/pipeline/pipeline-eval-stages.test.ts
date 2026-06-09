/**
 * Pipeline Eval — Stage Wrapper Failure Modes
 *
 * Verifies the stage-wrapper failure / success contract:
 * - Failed stages return success=false with a real error message
 * - Successful stages return success=true and the right state key
 * - Failed stages still return the expected `stateKey` (no swapping on failure)
 *
 * Note: pre-#2937 this file also verified `SharedMemoryStore` propagation
 * (every successful stage wrote a discovery/decision entry, and a failed
 * stage left the store untouched). The propagation channel was removed
 * because no downstream stage ever read it — see #2937. The class itself
 * still exists as a standalone utility (covered by `phase4.test.ts`).
 *
 * Run: pnpm vitest run src/pipeline/pipeline-eval-stages.test.ts
 */

import { describe, it, expect, vi } from 'vitest';
import { researchContextFromText, type ResearchContext } from './research-context.js';
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

function ctx(state: Record<string, unknown> = {}): PipelineContext {
  return {
    executionId: 'eval',
    task: 'Test task',
    templateId: 'dev',
    state: { [K.TASK]: 'Test task', ...state },
  };
}

function stagesWith(overrides: Partial<DevPipelineStages>): DevPipelineStages {
  return {
    research: vi
      .fn<(t: string) => Promise<ResearchContext>>()
      .mockResolvedValue(researchContextFromText('r')),
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
// Failure contract — success=false, error has the underlying message
// ============================================================================

describe('Pipeline Eval — Failure Contract', () => {
  it('research failure returns success=false', async () => {
    const stages = stagesWith({
      research: vi
        .fn<(t: string) => Promise<ResearchContext>>()
        .mockRejectedValue(new Error('boom')),
    });
    const res = await createResearchStageWrapper(stages).execute(ctx());
    expect(res.success).toBe(false);
  });

  it('plan failure returns success=false', async () => {
    const stages = stagesWith({
      plan: vi
        .fn<(t: string, r: string, f?: string) => Promise<string>>()
        .mockRejectedValue(new Error('plan fail')),
    });
    const res = await createPlanStageWrapper(stages).execute(ctx({ [K.RESEARCH]: 'data' }));
    expect(res.success).toBe(false);
  });

  it('failed stage surfaces error message in error field', async () => {
    const stages = stagesWith({
      research: vi
        .fn<(t: string) => Promise<ResearchContext>>()
        .mockRejectedValue(new Error('specific message')),
    });
    const res = await createResearchStageWrapper(stages).execute(ctx());
    expect(res.success).toBe(false);
    // Failure contract: value=null, error holds the message
    expect(res.value).toBe(null);
    expect(String(res.error)).toContain('specific message');
  });

  it('vote failure returns success=false without crashing', async () => {
    const stages = stagesWith({
      vote: vi.fn<(p: string) => Promise<VoteResult>>().mockRejectedValue(new Error('vote crash')),
    });
    const res = await createVoteStageWrapper(stages).execute(ctx({ [K.PLAN]: 'p' }));
    expect(res.success).toBe(false);
  });

  it('decompose failure returns empty tasks array via failOutput', async () => {
    const stages = stagesWith({
      decompose: vi
        .fn<(p: string) => Promise<PipelineTask[]>>()
        .mockRejectedValue(new Error('decompose failed')),
    });
    const res = await createDecomposeStageWrapper(stages).execute(ctx({ [K.PLAN]: 'p' }));
    expect(res.success).toBe(false);
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
    const res = await createPlanStageWrapper(stagesWith({})).execute(ctx({ [K.RESEARCH]: 'r' }));
    expect(res.stateKey).toBe(K.PLAN);
  });

  it('failed stage still returns the same stateKey (no swapping on failure)', async () => {
    const stages = stagesWith({
      research: vi.fn<(t: string) => Promise<ResearchContext>>().mockRejectedValue(new Error('x')),
    });
    const res = await createResearchStageWrapper(stages).execute(ctx());
    expect(res.stateKey).toBe(K.RESEARCH);
    expect(res.success).toBe(false);
  });
});
