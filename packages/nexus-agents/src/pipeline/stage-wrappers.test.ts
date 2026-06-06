/**
 * Tests for Stage Wrappers + Graph Pipeline Runner (#1735, Phase 2)
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createResearchStageWrapper,
  createPlanStageWrapper,
  createVoteStageWrapper,
  createDecomposeStageWrapper,
  createSecurityStageWrapper,
  createDevStageRegistry,
  createParseSpecStageWrapper,
} from './stage-wrappers.js';
import type { DevPipelineStages, VoteResult, QaReviewResult } from './dev-pipeline.js';
import type { PipelineContext } from './stage-types.js';
import { PIPELINE_STATE_KEYS as K } from './stage-types.js';

// #2795: the research stage prepends accumulated context (flag-gated). Mock the
// helper to `undefined` by default so existing tests are deterministic
// regardless of env/registry; one test overrides it to assert the prepend.
const contextPrefixMock = vi.fn<() => Promise<string | undefined>>(() =>
  Promise.resolve(undefined)
);
vi.mock('../context/context-retriever.js', () => ({
  getContextPromptPrefix: (): Promise<string | undefined> => contextPrefixMock(),
}));

// ============================================================================
// Helpers
// ============================================================================

function makeContext(stateOverrides?: Record<string, unknown>): PipelineContext {
  return {
    executionId: 'test-exec-1',
    task: 'Build feature X',
    templateId: 'dev',
    state: {
      [K.TASK]: 'Build feature X',
      [K.RESEARCH]: 'Prior research results',
      [K.PLAN]: 'Implementation plan',
      ...stateOverrides,
    },
  };
}

function createMockStages(): DevPipelineStages {
  return {
    research: vi.fn<(task: string) => Promise<string>>().mockResolvedValue('Research output'),
    plan: vi
      .fn<(task: string, research: string, feedback?: string) => Promise<string>>()
      .mockResolvedValue('Plan output'),
    vote: vi
      .fn<(plan: string) => Promise<VoteResult>>()
      .mockResolvedValue({ kind: 'approved', approvalPercentage: 83 }),
    decompose: vi
      .fn()
      .mockResolvedValue([
        { id: 't1', title: 'Task 1', description: 'Desc', assignedTo: 'coder', status: 'pending' },
      ]),
    implement: vi.fn<() => Promise<string>>().mockResolvedValue('Implementation'),
    qaReview: vi
      .fn<() => Promise<QaReviewResult>>()
      .mockResolvedValue({ verdict: 'pass', feedback: '', issues: [] }),
    securityScan: vi.fn().mockResolvedValue({ passed: true, feedback: 'Clean' }),
  };
}

// ============================================================================
// Stage Wrapper Tests
// ============================================================================

describe('Stage Wrappers', () => {
  describe('createResearchStageWrapper', () => {
    it('wraps research stage with correct state key', async () => {
      const stages = createMockStages();
      const wrapper = createResearchStageWrapper(stages);

      expect(wrapper.id).toBe('research');
      const result = await wrapper.execute(makeContext());

      expect(result.stateKey).toBe(K.RESEARCH);
      expect(result.value).toBe('Research output');
      expect(result.success).toBe(true);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('handles errors gracefully', async () => {
      const stages = createMockStages();
      vi.mocked(stages.research).mockRejectedValue(new Error('Timeout'));
      const wrapper = createResearchStageWrapper(stages);

      const result = await wrapper.execute(makeContext());

      expect(result.success).toBe(false);
      expect(result.error).toContain('Timeout');
    });

    it('preserves the message when a stage throws a non-Error value (#3176)', async () => {
      const stages = createMockStages();
      // A thrown non-Error object previously stringified to "[object Object]",
      // losing all context. getErrorMessage extracts the real message.
      vi.mocked(stages.research).mockRejectedValue({ message: 'adapter exploded', code: 'E_BOOM' });
      const wrapper = createResearchStageWrapper(stages);

      const result = await wrapper.execute(makeContext());

      expect(result.success).toBe(false);
      expect(result.error).toBe('adapter exploded');
      expect(result.error).not.toContain('[object Object]');
    });

    it('passes the bare task to research when no memory prefix is available (#2795)', async () => {
      contextPrefixMock.mockResolvedValueOnce(undefined);
      const stages = createMockStages();
      await createResearchStageWrapper(stages).execute(makeContext());
      // Gate off / no signal → research sees the task unprefixed.
      expect(vi.mocked(stages.research)).toHaveBeenCalledWith('Build feature X');
    });

    it('prepends the memory prefix ahead of the task when available (#2795)', async () => {
      contextPrefixMock.mockResolvedValueOnce('## Prior Context (Nexus Memory)\n### Beliefs\n- x');
      const stages = createMockStages();
      await createResearchStageWrapper(stages).execute(makeContext());
      const arg = vi.mocked(stages.research).mock.calls[0]?.[0] ?? '';
      expect(arg.startsWith('## Prior Context (Nexus Memory)')).toBe(true);
      expect(arg).toContain('Build feature X');
    });
  });

  describe('createPlanStageWrapper', () => {
    it('passes research context from state', async () => {
      const stages = createMockStages();
      const wrapper = createPlanStageWrapper(stages);

      await wrapper.execute(makeContext());

      expect(stages.plan).toHaveBeenCalledWith(
        'Build feature X',
        'Prior research results',
        undefined
      );
    });

    it('passes vote feedback when present', async () => {
      const stages = createMockStages();
      const wrapper = createPlanStageWrapper(stages);

      await wrapper.execute(makeContext({ [K.VOTE_FEEDBACK]: 'Needs more detail' }));

      expect(stages.plan).toHaveBeenCalledWith(
        'Build feature X',
        'Prior research results',
        'Needs more detail'
      );
    });
  });

  describe('createVoteStageWrapper', () => {
    it('returns approved vote result', async () => {
      const stages = createMockStages();
      const wrapper = createVoteStageWrapper(stages);

      const result = await wrapper.execute(makeContext());

      expect(result.stateKey).toBe(K.VOTE_RESULT);
      expect(result.success).toBe(true);
      const val = result.value as { vote: VoteResult; feedback: string };
      expect(val.vote.kind).toBe('approved');
      expect(val.feedback).toBe('');
    });

    it('returns rejected vote with feedback', async () => {
      const stages = createMockStages();
      vi.mocked(stages.vote).mockResolvedValue({
        kind: 'rejected',
        feedback: 'Missing tests',
        approvalPercentage: 33,
      });
      const wrapper = createVoteStageWrapper(stages);

      const result = await wrapper.execute(makeContext());

      expect(result.success).toBe(false);
      const val = result.value as { vote: VoteResult; feedback: string };
      expect(val.vote.kind).toBe('rejected');
      expect(val.feedback).toBe('Missing tests');
    });

    it('fails closed (success=false, error in feedback) when stages.vote throws (#3267)', async () => {
      // Subsumed onto runConsensusGate: a thrown voter fails CLOSED to a
      // rejected verdict — still success=false so the pipeline iterates, with
      // the error surfaced in feedback rather than dropped.
      const stages = createMockStages();
      vi.mocked(stages.vote).mockRejectedValue(new Error('voter adapter offline'));
      const result = await createVoteStageWrapper(stages).execute(makeContext());

      expect(result.success).toBe(false);
      const val = result.value as { vote: VoteResult | undefined; feedback: string };
      expect(val.feedback).toContain('voter adapter offline');
    });
  });

  describe('createDecomposeStageWrapper', () => {
    it('reads plan from state and returns tasks', async () => {
      const stages = createMockStages();
      const wrapper = createDecomposeStageWrapper(stages);

      const result = await wrapper.execute(makeContext());

      expect(result.stateKey).toBe(K.TASKS);
      expect(Array.isArray(result.value)).toBe(true);
      expect(stages.decompose).toHaveBeenCalledWith('Implementation plan');
    });
  });

  describe('createSecurityStageWrapper', () => {
    it('returns security scan result', async () => {
      const stages = createMockStages();
      const wrapper = createSecurityStageWrapper(stages);

      const result = await wrapper.execute(makeContext());

      expect(result.stateKey).toBe(K.SECURITY_PASSED);
      expect(result.value).toBe(true);
      expect(result.success).toBe(true);
    });

    it('reports failure on security block', async () => {
      const stages = createMockStages();
      vi.mocked(stages.securityScan).mockResolvedValue({
        passed: false,
        feedback: 'Critical finding',
      });
      const wrapper = createSecurityStageWrapper(stages);

      const result = await wrapper.execute(makeContext());

      expect(result.success).toBe(false);
      expect(result.value).toBe(false);
    });
  });
});

// ============================================================================
// Registry Factory Tests
// ============================================================================

describe('createDevStageRegistry', () => {
  it('creates a registry with all 7 dev pipeline stages', () => {
    const stages = createMockStages();
    const registry = createDevStageRegistry(stages);

    expect(registry.size).toBe(7);
    expect(registry.has('research')).toBe(true);
    expect(registry.has('plan')).toBe(true);
    expect(registry.has('vote')).toBe(true);
    expect(registry.has('decompose')).toBe(true);
    expect(registry.has('implement')).toBe(true);
    expect(registry.has('qa')).toBe(true);
    expect(registry.has('security')).toBe(true);
  });

  it('each stage has correct id', () => {
    const stages = createMockStages();
    const registry = createDevStageRegistry(stages);

    for (const [key, stage] of registry) {
      expect(stage.id).toBe(key);
    }
  });
});

describe('createParseSpecStageWrapper', () => {
  it('parses valid spec from task content', async () => {
    const wrapper = createParseSpecStageWrapper();
    const ctx = makeContext();

    const specCtx = { ...ctx, task: '# My Feature\n\n## Overview\nDo the thing.\n' };

    const result = await wrapper.execute(specCtx);

    expect(result.stateKey).toBe(K.PARSED_SPEC);
    expect(result.success).toBe(true);
    const spec = result.value as { title: string };
    expect(spec.title).toBe('My Feature');
  });

  it('fails on empty task', async () => {
    const wrapper = createParseSpecStageWrapper();
    const ctx = { ...makeContext(), task: '' };

    const result = await wrapper.execute(ctx);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Spec is empty');
  });

  it('fails on task with no title heading', async () => {
    const wrapper = createParseSpecStageWrapper();
    const ctx = { ...makeContext(), task: 'Just some text without headings' };

    const result = await wrapper.execute(ctx);

    expect(result.success).toBe(false);
    expect(result.error).toBe('No title heading found (expected # or ## heading)');
  });
});
