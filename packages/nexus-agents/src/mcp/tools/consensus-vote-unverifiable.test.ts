/**
 * The tally renders an unverifiable seat in its own bucket (#6094).
 *
 * These tests run the REAL classification path — `executeAgentVote` against a
 * fixture adapter — and then render the tally with `buildResponse`, so that
 * reverting the classifier fails them. A test that constructed
 * `source: 'unverifiable'` by hand would pass with the classifier deleted.
 */
import { describe, it, expect, vi } from 'vitest';

import { executeAgentVote } from '../../cli/voter-agents.js';
import type { AgentVoteResult, VoterRole } from '../../cli/vote-types.js';
import type { ConsensusResult } from '../../consensus/types.js';
import type { ILogger, IModelAdapter } from '../../core/index.js';
import { buildResponse, toAgentVoteSummary } from './consensus-vote-types.js';
import type { ExtendedVotingResult } from './consensus-vote-types.js';

const BLIND_APPROVE = JSON.stringify({
  decision: 'approve',
  reasoning:
    "I could not verify HEAD 7fe7f84df0 or inspect the implementation: repository reads failed with 'bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted', and resource discovery provided no repository access.",
  confidence: 0.8,
});

const CLEAN_APPROVE = JSON.stringify({
  decision: 'approve',
  reasoning: 'Approve: the diff is small, the empty case is named and tested.',
  confidence: 0.9,
});

function adapterReturning(text: string): IModelAdapter {
  return {
    providerId: 'cli-codex',
    modelId: 'codex-5.3',
    capabilities: [],
    complete: vi.fn().mockResolvedValue({
      ok: true,
      value: {
        // A string body: `extractTextFromResponse` accepts it, and the outer
        // cast on the adapter already erases the inner shape.
        content: text,
        stopReason: 'end_turn' as const,
        model: 'codex-5.3',
      },
    }),
    stream: vi.fn(),
    countTokens: vi.fn().mockResolvedValue(10),
    validateConfig: vi.fn().mockReturnValue({ ok: true }),
  };
}

function silentLogger(): ILogger {
  const l: ILogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
    setLevel: vi.fn(),
  };
  (l.child as ReturnType<typeof vi.fn>).mockReturnValue(l);
  return l;
}

async function seat(role: VoterRole, text: string): Promise<AgentVoteResult> {
  return executeAgentVote(role, 'Ratify commit abc', adapterReturning(text), silentLogger(), {
    timeoutMs: 5000,
    maxRetries: 0,
  });
}

/** Engine result over the votes as the legacy count fields see them. */
function engineResultOver(votes: readonly AgentVoteResult[]): ConsensusResult {
  const approve = votes.filter((v) => v.source !== 'error' && v.vote.decision === 'approve').length;
  const reject = votes.filter((v) => v.source !== 'error' && v.vote.decision === 'reject').length;
  const abstain = votes.filter((v) => v.source !== 'error' && v.vote.decision === 'abstain').length;
  const total = approve + reject + abstain;
  const now = '2026-09-10T00:00:00.000Z';
  return {
    proposalId: 'p',
    proposal: { title: 't', description: 'd', algorithm: 'supermajority' },
    outcome: approve / Math.max(1, approve + reject) >= 0.667 ? 'approved' : 'rejected',
    votes: new Map(),
    voteCounts: { approve, reject, abstain, total },
    approvalPercentage: total === 0 ? 0 : (approve / total) * 100,
    quorumReached: true,
    startedAt: now,
    closedAt: now,
    durationMs: 1,
  };
}

function extended(votes: readonly AgentVoteResult[]): ExtendedVotingResult {
  return {
    proposal: 'Ratify commit abc',
    threshold: 'supermajority',
    result: engineResultOver(votes),
    votes,
    totalTimeMs: 10,
    simulateVotes: false,
    strategy: 'supermajority',
    panelSize: votes.length,
    contrarianRequested: false,
  };
}

describe('consensus_vote tally: unverifiable bucket (#6094)', () => {
  it('counts a blind seat as unverifiable AND as abstain in the legacy field', async () => {
    const votes = [
      await seat('architect', CLEAN_APPROVE),
      await seat('security', CLEAN_APPROVE),
      await seat('scope_steward', BLIND_APPROVE),
    ];
    const response = buildResponse(
      { proposal: 'Ratify commit abc', simulateVotes: false, quickMode: true },
      extended(votes)
    );
    expect(response.voteCounts).toMatchObject({ approve: 2, reject: 0, abstain: 1, error: 0 });
    expect(response.voteCounts.unverifiable).toBe(1);
    const blind = response.votes.find((v) => v.role.startsWith('Scope Steward'));
    expect(blind?.unverifiable).toBe(true);
    expect(blind?.decision).toBe('abstain');
    expect(response.panelWarning).toContain('could not read the artifact');
  });

  it('the empty case is an explicit 0, never an omitted key', async () => {
    const votes = [await seat('architect', CLEAN_APPROVE), await seat('security', CLEAN_APPROVE)];
    const response = buildResponse(
      { proposal: 'Ratify commit abc', simulateVotes: false, quickMode: true },
      extended(votes)
    );
    expect(Object.keys(response.voteCounts)).toContain('unverifiable');
    expect(response.voteCounts.unverifiable).toBe(0);
    expect(response.votes.every((v) => v.unverifiable === undefined)).toBe(true);
  });

  it('under absolute_quorum an unverifiable seat voids the quorum like an errored one', async () => {
    const votes = [
      await seat('architect', CLEAN_APPROVE),
      await seat('security', CLEAN_APPROVE),
      await seat('scope_steward', BLIND_APPROVE),
    ];
    const response = buildResponse(
      {
        proposal: 'Ratify commit abc',
        simulateVotes: false,
        quickMode: true,
        errorPolicy: 'absolute_quorum',
      },
      extended(votes)
    );
    expect(response.decision).toBe('no_quorum');
    expect(response.policyReason).toContain('scope_steward');
    expect(response.policyReason).toContain('unverifiable');
    expect(response.voteCounts.error).toBe(0);
  });

  it('under absolute_quorum a clean panel still approves — the void is not vacuous', async () => {
    const votes = [
      await seat('architect', CLEAN_APPROVE),
      await seat('security', CLEAN_APPROVE),
      await seat('scope_steward', CLEAN_APPROVE),
    ];
    const response = buildResponse(
      {
        proposal: 'Ratify commit abc',
        simulateVotes: false,
        quickMode: true,
        errorPolicy: 'absolute_quorum',
      },
      extended(votes)
    );
    expect(response.decision).toBe('approved');
  });

  it('toAgentVoteSummary carries the flag present-only', () => {
    const summary = toAgentVoteSummary({
      role: 'devex',
      vote: { decision: 'abstain', confidence: 0, reasoning: 'bwrap: failed' },
      processingTimeMs: 1,
      source: 'unverifiable',
      unverifiableSignal: 'stderr',
    });
    expect(summary.unverifiable).toBe(true);
    expect(summary.error).toBe(false);
  });
});
