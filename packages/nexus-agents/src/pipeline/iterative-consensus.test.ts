/**
 * Tests for Iterative Consensus Stage (#1734, Phase 1.2)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runIterativeConsensus } from './iterative-consensus.js';
import type { VoteResult } from './dev-pipeline.js';

// Mock consensus-vote module
vi.mock('../mcp/tools/consensus-vote.js', () => ({
  executeVoting: vi.fn(),
}));

// Mock pipeline-observability
vi.mock('./pipeline-observability.js', () => ({
  emitPipelineStageEvent: vi.fn(),
}));

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeVotingResult(outcome: string, approves: number, rejects: number, feedback?: string) {
  const votes = [];
  for (let i = 0; i < approves; i++) {
    votes.push({ vote: { decision: 'approve', reasoning: 'LGTM' } });
  }
  for (let i = 0; i < rejects; i++) {
    votes.push({ vote: { decision: 'reject', reasoning: feedback ?? 'Needs work' } });
  }
  return {
    result: { outcome, voteCounts: { approve: approves, reject: rejects, abstain: 0, error: 0 } },
    votes,
    durationMs: 1000,
  };
}

describe('runIterativeConsensus', () => {
  let mockExecuteVoting: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetAllMocks();
    const mod = await import('../mcp/tools/consensus-vote.js');
    mockExecuteVoting = vi.mocked(mod.executeVoting);
  });

  it('returns approved on first vote when plan is accepted', async () => {
    mockExecuteVoting.mockResolvedValueOnce(makeVotingResult('approved', 5, 1));

    const result = await runIterativeConsensus('My plan', vi.fn());

    expect(result.vote.kind).toBe('approved');
    expect(result.iterations).toBe(1);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(mockExecuteVoting).toHaveBeenCalledOnce();
  });

  it('iterates on rejection with feedback', async () => {
    mockExecuteVoting
      .mockResolvedValueOnce(makeVotingResult('rejected', 2, 4, 'Add error handling'))
      .mockResolvedValueOnce(makeVotingResult('approved', 5, 1));

    const revisePlan = vi
      .fn<(plan: string, feedback: string) => Promise<string>>()
      .mockResolvedValue('Revised plan');

    const result = await runIterativeConsensus('Initial plan', revisePlan, {
      maxIterations: 3,
    });

    expect(result.vote.kind).toBe('approved');
    expect(result.iterations).toBe(2);
    expect(revisePlan).toHaveBeenCalledOnce();
    expect(revisePlan).toHaveBeenCalledWith(
      'Initial plan',
      expect.stringContaining('Add error handling')
    );
  });

  it('respects maxIterations limit', async () => {
    mockExecuteVoting.mockResolvedValue(makeVotingResult('rejected', 1, 5, 'Still bad'));

    const revisePlan = vi
      .fn<(plan: string, feedback: string) => Promise<string>>()
      .mockResolvedValue('Revised');

    const result = await runIterativeConsensus('Plan', revisePlan, {
      maxIterations: 2,
    });

    expect(result.vote.kind).toBe('rejected');
    expect(result.iterations).toBe(2);
    expect(revisePlan).toHaveBeenCalledTimes(1); // Only revise between iterations, not after last
  });

  it('passes configuration to executeVoting', async () => {
    mockExecuteVoting.mockResolvedValueOnce(makeVotingResult('approved', 6, 0));

    await runIterativeConsensus('Plan', vi.fn(), {
      strategy: 'supermajority',
      simulateVotes: true,
      quickMode: true,
      maxProposalLength: 500,
    });

    expect(mockExecuteVoting).toHaveBeenCalledWith(
      expect.objectContaining({
        strategy: 'supermajority',
        simulateVotes: true,
        quickMode: true,
      }),
      expect.anything()
    );
  });

  it('truncates proposal to maxProposalLength', async () => {
    mockExecuteVoting.mockResolvedValueOnce(makeVotingResult('approved', 4, 2));
    const longPlan = 'x'.repeat(10000);

    await runIterativeConsensus(longPlan, vi.fn(), { maxProposalLength: 100 });

    const call = mockExecuteVoting.mock.calls[0];
    expect(call?.[0].proposal).toHaveLength(100);
  });

  it('fails closed when vote execution throws (#2951 — was auto-approve, inverted the gate)', async () => {
    // Pre-#2951 this returned { kind: 'approved' } — auto-approving on
    // infrastructure failure inverts the gate's purpose. A vote that
    // physically didn't happen is NOT consensus to proceed; the rejected
    // verdict carries the error message in feedback so the operator sees it.
    mockExecuteVoting.mockRejectedValueOnce(new Error('Timeout'));

    const result = await runIterativeConsensus('Plan', vi.fn(), { maxIterations: 1 });

    expect(result.vote.kind).toBe('rejected');
    expect(result.vote.approvalPercentage).toBe(0);
    if (result.vote.kind === 'rejected') {
      expect(result.vote.feedback).toContain('Vote infrastructure failed');
      expect(result.vote.feedback).toContain('Timeout');
    }
    expect(result.iterations).toBe(1);
  });

  it('calculates approval percentage correctly', async () => {
    mockExecuteVoting.mockResolvedValueOnce(makeVotingResult('approved', 4, 2));

    const result = await runIterativeConsensus('Plan', vi.fn());

    const vote = result.vote as VoteResult & { kind: 'approved' };
    expect(vote.approvalPercentage).toBeCloseTo(66.67, 0);
  });

  it('collects rejection feedback from all rejecting agents', async () => {
    const votingResult = {
      result: { outcome: 'rejected', voteCounts: { approve: 1, reject: 2, abstain: 0, error: 0 } },
      votes: [
        { vote: { decision: 'approve', reasoning: 'Fine' } },
        { vote: { decision: 'reject', reasoning: 'Security concern' } },
        { vote: { decision: 'reject', reasoning: 'Missing tests' } },
      ],
      durationMs: 500,
    };
    mockExecuteVoting.mockResolvedValue(votingResult);

    const result = await runIterativeConsensus('Plan', vi.fn().mockResolvedValue('v2'), {
      maxIterations: 1,
    });

    expect(result.vote.kind).toBe('rejected');
    if (result.vote.kind === 'rejected') {
      expect(result.vote.feedback).toContain('Security concern');
      expect(result.vote.feedback).toContain('Missing tests');
    }
  });

  // ==========================================================================
  // #4135 — no_quorum recovery (bounded re-run of the SAME plan, then terminate)
  // ==========================================================================

  // A vote whose response-layer decision is `no_quorum` (a missing voice, not a
  // rejection). `outcome` stays 'rejected' (the engine is 2-valued) — the point is
  // parseVotingResult must read `decision`, not `outcome`.
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  function makeNoQuorumResult() {
    return {
      decision: 'no_quorum',
      result: { outcome: 'rejected', voteCounts: { approve: 1, reject: 0, abstain: 0, error: 1 } },
      votes: [{ vote: { decision: 'approve', reasoning: 'ok' } }],
      durationMs: 100,
    };
  }

  it('re-runs the SAME plan on no_quorum up to maxNoQuorumRetries, then terminates non-rejected', async () => {
    // Every vote comes back no_quorum → the bounded re-runs exhaust and the result
    // is a TERMINAL no_quorum failure, NOT a rejection, and revisePlan is never called.
    mockExecuteVoting.mockResolvedValue(makeNoQuorumResult());
    const revisePlan = vi
      .fn<(plan: string, feedback: string) => Promise<string>>()
      .mockResolvedValue('Revised');

    const result = await runIterativeConsensus('Plan', revisePlan, {
      maxIterations: 3,
      maxNoQuorumRetries: 2,
    });

    expect(result.vote.kind).toBe('no_quorum');
    if (result.vote.kind === 'no_quorum') {
      expect(result.vote.reason).toContain('could not reach quorum');
      expect(result.vote.reason).toContain('2 re-run');
    }
    // 1 initial vote + 2 bounded re-runs, all within the first iteration.
    expect(mockExecuteVoting).toHaveBeenCalledTimes(3);
    // The plan is fine — a voice was missing — so we NEVER revise on no_quorum.
    expect(revisePlan).not.toHaveBeenCalled();
    expect(result.iterations).toBe(1);
  });

  it('recovers when a bounded re-run reaches approval (does not terminate)', async () => {
    mockExecuteVoting
      .mockResolvedValueOnce(makeNoQuorumResult())
      .mockResolvedValueOnce(makeVotingResult('approved', 5, 1));
    const revisePlan = vi.fn<(plan: string, feedback: string) => Promise<string>>();

    const result = await runIterativeConsensus('Plan', revisePlan, {
      maxIterations: 3,
      maxNoQuorumRetries: 2,
    });

    expect(result.vote.kind).toBe('approved');
    expect(mockExecuteVoting).toHaveBeenCalledTimes(2); // initial no_quorum + 1 recovery re-run
    expect(revisePlan).not.toHaveBeenCalled();
    expect(result.iterations).toBe(1);
  });

  it('a normal approve/reject path is unaffected when decision is absent (fallback)', async () => {
    // Mocks that don't set `decision` fall back to the legacy outcome mapping —
    // the pre-#4135 behavior, proving the default path is inert.
    mockExecuteVoting.mockResolvedValueOnce(makeVotingResult('rejected', 1, 5, 'Nope'));
    const result = await runIterativeConsensus('Plan', vi.fn(), { maxIterations: 1 });
    expect(result.vote.kind).toBe('rejected');
  });
});
