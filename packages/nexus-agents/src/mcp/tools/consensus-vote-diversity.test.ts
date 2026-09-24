/**
 * The response discloses panel model diversity and per-seat fallbacks (#6115).
 *
 * Three consecutive 7-seat panels on 2026-09-13 answered every seat on one
 * gemini model after the claude and codex seats fell over, and the response
 * read identically to a three-model panel. `panelDiversity` is always present
 * (explicit zeros), the warning fires on a single-model panel of 3+ seats, and
 * the per-voter cost row names the assigned CLI beside the model that answered.
 */
import { describe, it, expect } from 'vitest';

import type { AgentVoteResult, VoterRole } from '../../cli/vote-types.js';
import type { ConsensusResult } from '../../consensus/types.js';
import { buildResponse, toAgentVoteSummary } from './consensus-vote-types.js';
import type { ExtendedVotingResult } from './consensus-vote-types.js';
import { votesToCostInputs } from './decision-cost-recording.js';
import { rollupDecisionCost } from '../../observability/decision-cost.js';

const SEVEN: readonly VoterRole[] = [
  'architect',
  'security',
  'devex',
  'ai_ml',
  'pm',
  'catfish',
  'scope_steward',
];

function seat(role: VoterRole, over: Partial<AgentVoteResult> = {}): AgentVoteResult {
  return {
    role,
    vote: { decision: 'approve', reasoning: 'ok', confidence: 0.8 },
    processingTimeMs: 10,
    source: 'llm',
    cli: 'cli-gemini',
    model: 'gemini-3.1-pro-preview',
    assignedCli: 'gemini',
    ...over,
  };
}

function engineResultOver(votes: readonly AgentVoteResult[]): ConsensusResult {
  const approve = votes.filter((v) => v.source === 'llm' && v.vote.decision === 'approve').length;
  const now = '2026-09-13T00:00:00.000Z';
  return {
    proposalId: 'p',
    proposal: { title: 't', description: 'd', algorithm: 'supermajority' },
    outcome: 'approved',
    votes: new Map(),
    voteCounts: { approve, reject: 0, abstain: 0, total: approve },
    approvalPercentage: 100,
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
    contrarianRequested: votes.length === 7,
  };
}

const INPUT = { proposal: 'Ratify commit abc', simulateVotes: false, quickMode: false } as const;

describe('consensus_vote response: panel diversity (#6115)', () => {
  it('an all-one-model panel of 7 reports distinctModels 1 and appends the warning', () => {
    const votes = SEVEN.map((role, i) =>
      seat(
        role,
        i % 2 === 0
          ? {
              assignedCli: 'claude',
              fallback: { fromCli: 'claude', fromModel: 'claude-fable-5', reason: 'capacity' },
            }
          : {}
      )
    );
    const response = buildResponse(INPUT, extended(votes));
    expect(response.panelDiversity).toEqual({
      distinctModels: 1,
      distinctFamilies: 1,
      unclassifiedSeats: 0,
      unresolvedSeats: 0,
      fallbacks: 4,
    });
    expect(response.panelWarning).toContain(
      'All 7 seats answered on gemini-3.1-pro-preview; independence is weaker than assigned.'
    );
  });

  it('a clean three-model panel reports fallbacks 0 and no warning', () => {
    const votes = [
      seat('architect', { cli: 'cli-claude', model: 'claude-opus', assignedCli: 'claude' }),
      seat('security', { cli: 'cli-codex', model: 'codex-5.3', assignedCli: 'codex' }),
      seat('scope_steward'),
    ];
    const response = buildResponse(INPUT, extended(votes));
    expect(response.panelDiversity).toEqual({
      distinctModels: 3,
      distinctFamilies: 3,
      unclassifiedSeats: 0,
      unresolvedSeats: 0,
      fallbacks: 0,
    });
    expect(response.panelWarning).toBeUndefined();
  });

  it('reports unclassified seats when an answering model names no recognised vendor', () => {
    const votes = [
      seat('architect', { cli: 'cli-claude', model: 'claude-opus', assignedCli: 'claude' }),
      seat('security', { model: 'unrecognised-custom-model' }),
      seat('scope_steward'),
    ];
    const response = buildResponse(INPUT, extended(votes));
    expect(response.panelDiversity).toEqual({
      distinctModels: 3,
      distinctFamilies: 2,
      unclassifiedSeats: 1,
      unresolvedSeats: 0,
      fallbacks: 0,
    });
  });

  it('the empty case is explicit zeros on the response, never an absent key', () => {
    const response = buildResponse(INPUT, extended([]));
    expect(Object.keys(response)).toContain('panelDiversity');
    expect(response.panelDiversity).toEqual({
      distinctModels: 0,
      distinctFamilies: 0,
      unclassifiedSeats: 0,
      unresolvedSeats: 0,
      fallbacks: 0,
    });
  });

  it('the diversity warning is appended to an existing degradation warning, not assigned over it', () => {
    const votes = [
      ...SEVEN.slice(0, 6).map((role) => seat(role)),
      seat('scope_steward', { source: 'error', model: undefined, error: 'boom' }),
    ];
    const response = buildResponse(INPUT, extended(votes));
    expect(response.panelWarning).toContain('Panel degraded: 1 of 7 voters errored');
    expect(response.panelWarning).toContain('All 6 seats answered on gemini-3.1-pro-preview');
  });
});

describe('consensus_vote response: panel families (#6606)', () => {
  const oneFamily = [
    seat('architect', { cli: 'api:gw', model: 'gpt-5.2' }),
    seat('security', { cli: 'api:gw', model: 'openai/o3' }),
    seat('scope_steward', { cli: 'api:gw', model: 'openai/gpt-4o' }),
  ];

  it('a one-family panel reports distinctFamilies 1 and appends the family warning', () => {
    const response = buildResponse(INPUT, extended(oneFamily));
    expect(response.panelDiversity).toMatchObject({ distinctModels: 3, distinctFamilies: 1 });
    expect(response.panelWarning).toContain(
      'All 3 answering seats ran openai models (3 distinct); independence is weaker than assigned.'
    );
  });

  it('counts only seats that voted: an errored seat on another family adds nothing', () => {
    const votes = [
      ...oneFamily,
      seat('pm', { source: 'error', model: 'claude_4_5_opus', error: 'boom' }),
    ];
    const response = buildResponse(INPUT, extended(votes));
    expect(response.panelDiversity.distinctFamilies).toBe(1);
  });

  it('each vote entry names the model that seat ran on', () => {
    const response = buildResponse(INPUT, extended(oneFamily));
    expect(response.votes.map((v) => v.modelUsed)).toEqual([
      'gpt-5.2',
      'openai/o3',
      'openai/gpt-4o',
    ]);
  });

  it('a seat with no resolved model carries no modelUsed', () => {
    expect('modelUsed' in toAgentVoteSummary(seat('pm', { model: undefined }))).toBe(false);
    expect('modelUsed' in toAgentVoteSummary(seat('pm', { model: 'pending-detection' }))).toBe(
      false
    );
  });
});

describe('per-seat fallback on the vote summary (#6115)', () => {
  it('is present only on a seat that answered elsewhere', () => {
    const moved = toAgentVoteSummary(
      seat('devex', {
        assignedCli: 'codex',
        fallback: { fromCli: 'codex', reason: 'rate-limit' },
      })
    );
    expect(moved.fallback).toEqual({ fromCli: 'codex', reason: 'rate-limit' });
    expect('fallback' in toAgentVoteSummary(seat('devex'))).toBe(false);
  });
});

describe('per-seat retriedFrom on the vote summary (#6246)', () => {
  it('is present only on a seat the per-role retry replaced — a caller sees what the ledger will', () => {
    const recovered = toAgentVoteSummary(
      seat('catfish', {
        retried: true,
        retriedFrom: {
          source: 'error',
          error: 'Vote parsing failed: Unexpected end of JSON input',
        },
      })
    );
    expect(recovered.retried).toBe(true);
    expect(recovered.retriedFrom).toEqual({
      source: 'error',
      error: 'Vote parsing failed: Unexpected end of JSON input',
    });
    expect('retriedFrom' in toAgentVoteSummary(seat('catfish'))).toBe(false);
  });
});

describe('per-voter cost row names the assigned CLI (#6115)', () => {
  it('carries assignedCli beside the model that answered', () => {
    const inputs = votesToCostInputs([
      seat('architect', { assignedCli: 'claude' }),
      seat('security', { assignedCli: undefined }),
    ]);
    expect(inputs[0]?.assignedCli).toBe('claude');
    expect('assignedCli' in (inputs[1] ?? {})).toBe(false);
    const summary = rollupDecisionCost(inputs, 'plan');
    expect(summary.perVoter[0]).toMatchObject({
      model: 'gemini-3.1-pro-preview',
      assignedCli: 'claude',
    });
    expect('assignedCli' in (summary.perVoter[1] ?? {})).toBe(false);
  });
});
