import { describe, expect, it } from 'vitest';

import { summarizeConsensusDecisionTokens } from './consensus-decision-tokens.js';
import type { DecisionCostRecord } from './decision-cost-store.js';
import type { VoteRecord } from '../audit/vote-record.js';

type LinkedVote = Pick<VoteRecord, 'correlationId' | 'decision'>;

function cost(
  id: string,
  tokens: number,
  measured: boolean | null = true,
  gate: DecisionCostRecord['gate'] = 'consensus_vote'
): DecisionCostRecord {
  const perVoter = [
    {
      role: 'architect',
      model: 'test-model',
      inputTokens: tokens,
      outputTokens: 0,
      totalTokens: tokens,
      costUsd: 0,
      unmeasured: false,
      ...(measured !== null ? { tokenUsageMeasured: measured } : {}),
    },
  ];
  return {
    decisionId: id,
    gate,
    timestamp: '2026-09-28T00:00:00.000Z',
    summary: {
      billingMode: 'plan',
      voterCount: 1,
      measuredVoters: 1,
      unmeasuredVoters: 0,
      totalInputTokens: tokens,
      totalOutputTokens: 0,
      totalTokens: tokens,
      totalCostUsd: 0,
      perVoter,
      perModel: [],
      ...(measured !== null
        ? {
            tokenMeasuredVoters: measured ? 1 : 0,
            tokenUnmeasuredVoters: measured ? 0 : 1,
          }
        : {}),
    },
  };
}

function vote(id: string | undefined, decision: VoteRecord['decision']): LinkedVote {
  return { ...(id !== undefined ? { correlationId: id } : {}), decision };
}

describe('summarizeConsensusDecisionTokens', () => {
  it('includes failed no-quorum final-seat tokens in the numerator but not the success denominator', () => {
    const report = summarizeConsensusDecisionTokens(
      [
        cost('approved', 40),
        cost('rejected', 60),
        cost('failed', 20),
        cost('unmatched', 100),
        cost('review', 900, true, 'pr_review'),
      ],
      [
        vote('approved', 'approved'),
        vote('rejected', 'rejected'),
        vote('failed', 'no_quorum'),
        vote('missing', 'approved'),
        vote('missing-failure', 'no_quorum'),
      ]
    );

    expect(report).toMatchObject({
      matchedQuorumDecisions: 2,
      matchedNoQuorumDecisions: 1,
      unmatchedQuorumVoteRecords: 1,
      unmatchedNoQuorumVoteRecords: 1,
      unmatchedCostRecords: 1,
      totalReportedFinalSeatTokens: 120,
      noQuorumReportedFinalSeatTokens: 20,
      reportedTokensPerMatchedQuorumDecision: 60,
      tokenMeasuredVoters: 3,
      tokenUnmeasuredVoters: 0,
      tokenCoverage: 1,
      measurement: 'lower-bound-final-seats',
    });
  });

  it('keeps explicit zero usage measured but legacy and partial usage unmeasured', () => {
    const report = summarizeConsensusDecisionTokens(
      [cost('zero', 0), cost('legacy', 8, null), cost('partial', 5, false)],
      [vote('zero', 'approved'), vote('legacy', 'approved'), vote('partial', 'no_quorum')]
    );

    expect(report.totalReportedFinalSeatTokens).toBe(13);
    expect(report.tokenMeasuredVoters).toBe(1);
    expect(report.tokenUnmeasuredVoters).toBe(2);
    expect(report.tokenCoverage).toBeCloseTo(1 / 3);
  });

  it('excludes duplicate IDs and invalid cost rows instead of multiplying tokens', () => {
    const invalid = { ...cost('bad', 9), summary: { ...cost('bad', 9).summary, totalTokens: -9 } };
    const report = summarizeConsensusDecisionTokens(
      [cost('dup', 7), cost('dup', 7), invalid, cost('good', 4)],
      [
        vote('dup', 'approved'),
        vote('bad', 'approved'),
        vote('good', 'approved'),
        vote('vote-dup', 'approved'),
        vote('vote-dup', 'rejected'),
      ]
    );

    expect(report.totalReportedFinalSeatTokens).toBe(4);
    expect(report.matchedQuorumDecisions).toBe(1);
    expect(report.ambiguousDecisionIds).toBe(2);
    expect(report.invalidCostRecords).toBe(1);
    expect(report.unmatchedQuorumVoteRecords).toBe(1);
  });

  it('does not accept a valid row when a second damaged row reuses its decision ID', () => {
    const damaged = {
      ...cost('shared', 9),
      summary: { ...cost('shared', 9).summary, totalTokens: -9 },
    };
    const report = summarizeConsensusDecisionTokens(
      [cost('shared', 9), damaged],
      [vote('shared', 'approved')]
    );
    expect(report.totalReportedFinalSeatTokens).toBe(0);
    expect(report.ambiguousDecisionIds).toBe(1);
    expect(report.invalidCostRecords).toBe(1);
  });

  it('reports an unmeasured ratio and coverage with no quorum-backed decisions or seats', () => {
    const noSuccess = summarizeConsensusDecisionTokens(
      [cost('failed', 6)],
      [vote('failed', 'no_quorum')]
    );
    expect(noSuccess.reportedTokensPerMatchedQuorumDecision).toBeNull();
    expect(noSuccess.noQuorumReportedFinalSeatTokens).toBe(6);

    const empty = summarizeConsensusDecisionTokens([], []);
    expect(empty.reportedTokensPerMatchedQuorumDecision).toBeNull();
    expect(empty.tokenCoverage).toBeNull();
    expect(empty.totalReportedFinalSeatTokens).toBe(0);
    expect(empty.matchedQuorumDecisions).toBe(0);
  });

  it('does not turn an approved zero-seat cost row into a free measured decision', () => {
    const zeroSeat = cost('empty', 0);
    const emptySummary = {
      ...zeroSeat.summary,
      voterCount: 0,
      measuredVoters: 0,
      tokenMeasuredVoters: 0,
      tokenUnmeasuredVoters: 0,
      perVoter: [],
    };
    const report = summarizeConsensusDecisionTokens(
      [{ ...zeroSeat, summary: emptySummary }],
      [vote('empty', 'approved')]
    );
    expect(report.reportedTokensPerMatchedQuorumDecision).toBeNull();
    expect(report.matchedQuorumDecisions).toBe(0);
    expect(report.invalidCostRecords).toBe(1);
  });

  it('rejects a schema-valid summary that invents tokens absent from its voter lines', () => {
    const honest = cost('inflated', 2);
    const report = summarizeConsensusDecisionTokens(
      [{ ...honest, summary: { ...honest.summary, totalInputTokens: 20, totalTokens: 20 } }],
      [vote('inflated', 'approved')]
    );
    expect(report.totalReportedFinalSeatTokens).toBe(0);
    expect(report.invalidCostRecords).toBe(1);
  });
});
