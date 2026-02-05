/**
 * Tests for voting-protocol-helpers.
 *
 * Covers: generateSessionId, generateFindingId, generateRoundId, createRound,
 * mostCommon, calculateAgreementScore, determineOutcome, consolidateFindings,
 * buildRoundSummaries, checkPrematureConsensus, checkOpinionConvergence,
 * checkConfidenceInflation, detectSycophancyPatterns.
 */

import { describe, expect, it } from 'vitest';

import type {
  VotingSession,
  VotingRound,
  VotingProtocolConfig,
  AgentFinding,
  FindingVote,
  Vote,
} from './types.js';
import {
  generateSessionId,
  generateFindingId,
  generateRoundId,
  createRound,
  mostCommon,
  calculateAgreementScore,
  determineOutcome,
  consolidateFindings,
  buildRoundSummaries,
  checkPrematureConsensus,
  checkOpinionConvergence,
  checkConfidenceInflation,
  detectSycophancyPatterns,
} from './voting-protocol-helpers.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makeConfig(overrides: Partial<VotingProtocolConfig> = {}): VotingProtocolConfig {
  return {
    committeeSize: 3,
    maxRounds: 3,
    roundTimeoutMs: 60000,
    agreementThreshold: 0.67,
    enableAntiSycophancy: true,
    sycophancyThreshold: 0.8,
    ...overrides,
  };
}

function makeVote(overrides: Partial<Vote> = {}): Vote {
  return {
    decision: 'approve',
    reasoning: 'Looks good',
    confidence: 0.8,
    ...overrides,
  };
}

function makeFinding(overrides: Partial<AgentFinding> = {}): AgentFinding {
  return {
    agentId: 'agent-1',
    category: 'bug',
    severity: 'major',
    description: 'Found a bug',
    confidence: 0.8,
    ...overrides,
  };
}

function makeFindingVote(overrides: Partial<FindingVote> = {}): FindingVote {
  return {
    agentId: 'agent-1',
    findingId: 'f1',
    agree: true,
    ...overrides,
  };
}

function makeEmptyRound(overrides: Partial<VotingRound> = {}): VotingRound {
  return {
    id: 'round-1',
    phase: 'analysis',
    status: 'completed',
    findings: new Map(),
    findingVotes: new Map(),
    finalVotes: new Map(),
    startedAt: '2026-01-15T12:00:00.000Z',
    roundNumber: 1,
    ...overrides,
  };
}

function makeSession(overrides: Partial<VotingSession> = {}): VotingSession {
  return {
    id: 'session-1',
    topic: 'Test review',
    committee: ['agent-1', 'agent-2', 'agent-3'],
    rounds: [],
    currentRound: 0,
    config: makeConfig(),
    status: 'active',
    createdAt: '2026-01-15T12:00:00.000Z',
    ...overrides,
  };
}

// ============================================================================
// ID Generation
// ============================================================================

describe('ID generation', () => {
  it('generateSessionId returns unique IDs', () => {
    const id1 = generateSessionId();
    const id2 = generateSessionId();
    expect(id1).toMatch(/^session_/);
    expect(id1).not.toBe(id2);
  });

  it('generateFindingId returns unique IDs', () => {
    const id1 = generateFindingId();
    const id2 = generateFindingId();
    expect(id1).toMatch(/^finding_/);
    expect(id1).not.toBe(id2);
  });

  it('generateRoundId returns unique IDs', () => {
    const id = generateRoundId();
    expect(id).toMatch(/^round_/);
  });
});

// ============================================================================
// createRound
// ============================================================================

describe('createRound', () => {
  it('creates a round with correct phase and number', () => {
    const round = createRound('analysis', 1);
    expect(round.phase).toBe('analysis');
    expect(round.roundNumber).toBe(1);
    expect(round.status).toBe('in_progress');
    expect(round.id).toMatch(/^round_/);
  });

  it('initializes empty maps', () => {
    const round = createRound('deliberation', 2);
    expect(round.findings.size).toBe(0);
    expect(round.findingVotes.size).toBe(0);
    expect(round.finalVotes.size).toBe(0);
  });
});

// ============================================================================
// mostCommon
// ============================================================================

describe('mostCommon', () => {
  it('returns undefined for empty array', () => {
    const result = mostCommon<string>([]);
    expect(result).toBeUndefined();
  });

  it('returns single element', () => {
    expect(mostCommon(['a'])).toBe('a');
  });

  it('returns most frequent element', () => {
    expect(mostCommon(['a', 'b', 'a', 'c', 'a'])).toBe('a');
  });

  it('returns first max for ties', () => {
    const result = mostCommon(['a', 'b', 'a', 'b']);
    expect(result === 'a' || result === 'b').toBe(true);
  });

  it('works with numbers', () => {
    expect(mostCommon([1, 2, 2, 3])).toBe(2);
  });
});

// ============================================================================
// calculateAgreementScore
// ============================================================================

describe('calculateAgreementScore', () => {
  it('returns 1 for single vote', () => {
    expect(calculateAgreementScore([makeVote()])).toBe(1);
  });

  it('returns 1 for empty votes', () => {
    expect(calculateAgreementScore([])).toBe(1);
  });

  it('returns 1 for unanimous agreement', () => {
    const votes = [
      makeVote({ decision: 'approve' }),
      makeVote({ decision: 'approve' }),
      makeVote({ decision: 'approve' }),
    ];
    expect(calculateAgreementScore(votes)).toBe(1);
  });

  it('returns 2/3 for majority agreement', () => {
    const votes = [
      makeVote({ decision: 'approve' }),
      makeVote({ decision: 'approve' }),
      makeVote({ decision: 'reject' }),
    ];
    expect(calculateAgreementScore(votes)).toBeCloseTo(2 / 3);
  });

  it('returns 0.5 for evenly split votes', () => {
    const votes = [makeVote({ decision: 'approve' }), makeVote({ decision: 'reject' })];
    expect(calculateAgreementScore(votes)).toBe(0.5);
  });
});

// ============================================================================
// determineOutcome
// ============================================================================

describe('determineOutcome', () => {
  it('returns no_consensus for empty votes', () => {
    expect(determineOutcome([], makeConfig())).toBe('no_consensus');
  });

  it('returns approved for unanimous approval', () => {
    const votes = [
      makeVote({ decision: 'approve' }),
      makeVote({ decision: 'approve' }),
      makeVote({ decision: 'approve' }),
    ];
    expect(determineOutcome(votes, makeConfig())).toBe('approved');
  });

  it('returns rejected for unanimous rejection', () => {
    const votes = [
      makeVote({ decision: 'reject' }),
      makeVote({ decision: 'reject' }),
      makeVote({ decision: 'reject' }),
    ];
    expect(determineOutcome(votes, makeConfig())).toBe('rejected');
  });

  it('returns needs_revision for mixed votes', () => {
    const votes = [
      makeVote({ decision: 'approve' }),
      makeVote({ decision: 'reject' }),
      makeVote({ decision: 'abstain' }),
    ];
    const result = determineOutcome(votes, makeConfig());
    expect(['needs_revision', 'no_consensus', 'approved', 'rejected']).toContain(result);
  });
});

// ============================================================================
// consolidateFindings
// ============================================================================

describe('consolidateFindings', () => {
  it('returns empty for session without deliberation round', () => {
    const session = makeSession({ rounds: [] });
    expect(consolidateFindings(session)).toEqual([]);
  });

  it('returns empty for session with only analysis round', () => {
    const session = makeSession({
      rounds: [makeEmptyRound({ phase: 'analysis' })],
    });
    expect(consolidateFindings(session)).toEqual([]);
  });

  it('consolidates findings with majority agreement', () => {
    const findings = new Map<string, AgentFinding>();
    findings.set('f1', makeFinding({ description: 'Bug found' }));

    const findingVotes = new Map<string, FindingVote[]>();
    findingVotes.set('f1', [
      makeFindingVote({ agentId: 'a1', agree: true }),
      makeFindingVote({ agentId: 'a2', agree: true }),
      makeFindingVote({ agentId: 'a3', agree: false }),
    ]);

    const session = makeSession({
      rounds: [
        makeEmptyRound({ phase: 'analysis' }),
        makeEmptyRound({ phase: 'deliberation', findings, findingVotes }),
      ],
    });

    const result = consolidateFindings(session);
    expect(result).toHaveLength(1);
    expect(result[0]?.agreementRatio).toBeCloseTo(2 / 3);
    expect(result[0]?.supportingAgents).toHaveLength(2);
  });

  it('excludes findings with less than 50% agreement', () => {
    const findings = new Map<string, AgentFinding>();
    findings.set('f1', makeFinding());

    const findingVotes = new Map<string, FindingVote[]>();
    findingVotes.set('f1', [
      makeFindingVote({ agree: false }),
      makeFindingVote({ agentId: 'a2', agree: false }),
      makeFindingVote({ agentId: 'a3', agree: true }),
    ]);

    const session = makeSession({
      rounds: [
        makeEmptyRound({ phase: 'analysis' }),
        makeEmptyRound({ phase: 'deliberation', findings, findingVotes }),
      ],
    });

    expect(consolidateFindings(session)).toHaveLength(0);
  });

  it('sorts by severity then agreement', () => {
    const findings = new Map<string, AgentFinding>();
    findings.set('f1', makeFinding({ severity: 'minor' }));
    findings.set('f2', makeFinding({ severity: 'critical' }));

    const findingVotes = new Map<string, FindingVote[]>();
    findingVotes.set('f1', [makeFindingVote({ agree: true })]);
    findingVotes.set('f2', [makeFindingVote({ agree: true })]);

    const session = makeSession({
      rounds: [
        makeEmptyRound({ phase: 'analysis' }),
        makeEmptyRound({ phase: 'deliberation', findings, findingVotes }),
      ],
    });

    const result = consolidateFindings(session);
    expect(result[0]?.severity).toBe('critical');
    expect(result[1]?.severity).toBe('minor');
  });

  it('includes location and suggestion when present', () => {
    const findings = new Map<string, AgentFinding>();
    findings.set(
      'f1',
      makeFinding({
        location: 'src/foo.ts:10',
        suggestion: 'Fix the bug',
      })
    );

    const findingVotes = new Map<string, FindingVote[]>();
    findingVotes.set('f1', [makeFindingVote({ agree: true })]);

    const session = makeSession({
      rounds: [
        makeEmptyRound({ phase: 'analysis' }),
        makeEmptyRound({ phase: 'deliberation', findings, findingVotes }),
      ],
    });

    const result = consolidateFindings(session);
    expect(result[0]?.location).toBe('src/foo.ts:10');
    expect(result[0]?.suggestion).toBe('Fix the bug');
  });
});

// ============================================================================
// Sycophancy Detection
// ============================================================================

describe('checkPrematureConsensus', () => {
  it('returns null for empty session', () => {
    const session = makeSession({ rounds: [] });
    expect(checkPrematureConsensus(session)).toBeNull();
  });

  it('returns null for normal confidence levels', () => {
    const findings = new Map<string, AgentFinding>();
    findings.set('f1', makeFinding({ agentId: 'a1', confidence: 0.7 }));
    findings.set('f2', makeFinding({ agentId: 'a2', confidence: 0.6 }));

    const session = makeSession({
      rounds: [makeEmptyRound({ phase: 'analysis', findings })],
    });

    expect(checkPrematureConsensus(session)).toBeNull();
  });

  it('detects unusually high confidence across agents', () => {
    const findings = new Map<string, AgentFinding>();
    findings.set('f1', makeFinding({ agentId: 'a1', confidence: 0.99 }));
    findings.set('f2', makeFinding({ agentId: 'a2', confidence: 0.98 }));

    const session = makeSession({
      rounds: [makeEmptyRound({ phase: 'analysis', findings })],
    });

    const result = checkPrematureConsensus(session);
    expect(result).not.toBeNull();
    expect(result?.type).toBe('premature_consensus');
    expect(result?.severity).toBe('medium');
  });
});

describe('checkOpinionConvergence', () => {
  it('returns null without deliberation round', () => {
    const session = makeSession({ rounds: [makeEmptyRound()] });
    expect(checkOpinionConvergence(session)).toBeNull();
  });

  it('returns null for low agreement', () => {
    const findingVotes = new Map<string, FindingVote[]>();
    findingVotes.set('f1', [
      makeFindingVote({ agree: true }),
      makeFindingVote({ agentId: 'a2', agree: false }),
      makeFindingVote({ agentId: 'a3', agree: false }),
      makeFindingVote({ agentId: 'a4', agree: false }),
    ]);

    const session = makeSession({
      config: makeConfig({ sycophancyThreshold: 0.8 }),
      rounds: [
        makeEmptyRound({ phase: 'analysis' }),
        makeEmptyRound({ phase: 'deliberation', findingVotes }),
      ],
    });

    expect(checkOpinionConvergence(session)).toBeNull();
  });

  it('detects high agreement rate above threshold', () => {
    const findingVotes = new Map<string, FindingVote[]>();
    findingVotes.set('f1', [
      makeFindingVote({ agentId: 'a1', agree: true }),
      makeFindingVote({ agentId: 'a2', agree: true }),
      makeFindingVote({ agentId: 'a3', agree: true }),
      makeFindingVote({ agentId: 'a4', agree: true }),
    ]);

    const session = makeSession({
      config: makeConfig({ sycophancyThreshold: 0.8 }),
      rounds: [
        makeEmptyRound({ phase: 'analysis' }),
        makeEmptyRound({ phase: 'deliberation', findingVotes }),
      ],
    });

    const result = checkOpinionConvergence(session);
    expect(result).not.toBeNull();
    expect(result?.type).toBe('opinion_convergence');
    expect(result?.severity).toBe('high');
  });
});

describe('checkConfidenceInflation', () => {
  it('returns null without consensus round', () => {
    const session = makeSession({ rounds: [makeEmptyRound()] });
    expect(checkConfidenceInflation(session)).toBeNull();
  });

  it('returns null for normal confidence', () => {
    const finalVotes = new Map<string, Vote>();
    finalVotes.set('a1', makeVote({ confidence: 0.7 }));
    finalVotes.set('a2', makeVote({ confidence: 0.6 }));

    const session = makeSession({
      rounds: [
        makeEmptyRound({ phase: 'analysis' }),
        makeEmptyRound({ phase: 'deliberation' }),
        makeEmptyRound({ phase: 'consensus', finalVotes }),
      ],
    });

    expect(checkConfidenceInflation(session)).toBeNull();
  });

  it('detects all-high confidence', () => {
    const finalVotes = new Map<string, Vote>();
    finalVotes.set('a1', makeVote({ confidence: 0.98 }));
    finalVotes.set('a2', makeVote({ confidence: 0.97 }));
    finalVotes.set('a3', makeVote({ confidence: 0.99 }));

    const session = makeSession({
      rounds: [
        makeEmptyRound({ phase: 'analysis' }),
        makeEmptyRound({ phase: 'deliberation' }),
        makeEmptyRound({ phase: 'consensus', finalVotes }),
      ],
    });

    const result = checkConfidenceInflation(session);
    expect(result).not.toBeNull();
    expect(result?.type).toBe('confidence_inflation');
  });
});

describe('detectSycophancyPatterns', () => {
  it('returns no detection for clean session', () => {
    const session = makeSession({ rounds: [] });
    const report = detectSycophancyPatterns(session);
    expect(report.detected).toBe(false);
    expect(report.indicators).toHaveLength(0);
    expect(report.confidenceScore).toBe(0);
  });

  it('aggregates multiple indicators', () => {
    // Build a session with both premature consensus and confidence inflation
    const findings = new Map<string, AgentFinding>();
    findings.set('f1', makeFinding({ agentId: 'a1', confidence: 0.99 }));
    findings.set('f2', makeFinding({ agentId: 'a2', confidence: 0.98 }));

    const findingVotes = new Map<string, FindingVote[]>();
    findingVotes.set('f1', [
      makeFindingVote({ agentId: 'a1', agree: true }),
      makeFindingVote({ agentId: 'a2', agree: true }),
      makeFindingVote({ agentId: 'a3', agree: true }),
      makeFindingVote({ agentId: 'a4', agree: true }),
    ]);

    const finalVotes = new Map<string, Vote>();
    finalVotes.set('a1', makeVote({ confidence: 0.98 }));
    finalVotes.set('a2', makeVote({ confidence: 0.97 }));
    finalVotes.set('a3', makeVote({ confidence: 0.99 }));

    const session = makeSession({
      config: makeConfig({ sycophancyThreshold: 0.8 }),
      rounds: [
        makeEmptyRound({ phase: 'analysis', findings }),
        makeEmptyRound({ phase: 'deliberation', findingVotes }),
        makeEmptyRound({ phase: 'consensus', finalVotes }),
      ],
    });

    const report = detectSycophancyPatterns(session);
    expect(report.detected).toBe(true);
    expect(report.indicators.length).toBeGreaterThanOrEqual(2);
    expect(report.confidenceScore).toBeGreaterThan(0);
    expect(report.affectedAgents.length).toBeGreaterThan(0);
  });

  it('deduplicates affected agents', () => {
    const findings = new Map<string, AgentFinding>();
    findings.set('f1', makeFinding({ agentId: 'a1', confidence: 0.99 }));
    findings.set('f2', makeFinding({ agentId: 'a1', confidence: 0.98 })); // same agent

    const session = makeSession({
      rounds: [makeEmptyRound({ phase: 'analysis', findings })],
    });

    const report = detectSycophancyPatterns(session);
    if (report.detected) {
      const agentSet = new Set(report.affectedAgents);
      expect(agentSet.size).toBe(report.affectedAgents.length);
    }
  });
});

// ============================================================================
// buildRoundSummaries
// ============================================================================

describe('buildRoundSummaries', () => {
  it('returns empty for session with no rounds', () => {
    const session = makeSession({ rounds: [] });
    expect(buildRoundSummaries(session)).toEqual([]);
  });

  it('builds summary for analysis round', () => {
    const findings = new Map<string, AgentFinding>();
    findings.set('f1', makeFinding());

    const session = makeSession({
      rounds: [
        makeEmptyRound({
          phase: 'analysis',
          findings,
          completedAt: '2026-01-15T12:01:00.000Z',
        }),
      ],
    });

    const summaries = buildRoundSummaries(session);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.phase).toBe('analysis');
    expect(summaries[0]?.findingsCount).toBe(1);
    expect(summaries[0]?.roundNumber).toBe(1);
  });

  it('computes agreement score for deliberation round', () => {
    const findingVotes = new Map<string, FindingVote[]>();
    findingVotes.set('f1', [
      makeFindingVote({ agree: true }),
      makeFindingVote({ agentId: 'a2', agree: true }),
      makeFindingVote({ agentId: 'a3', agree: false }),
    ]);

    const session = makeSession({
      rounds: [
        makeEmptyRound({ phase: 'analysis' }),
        makeEmptyRound({
          phase: 'deliberation',
          findingVotes,
          completedAt: '2026-01-15T12:02:00.000Z',
        }),
      ],
    });

    const summaries = buildRoundSummaries(session);
    expect(summaries).toHaveLength(2);
    expect(summaries[1]?.phase).toBe('deliberation');
    expect(summaries[1]?.votesCount).toBe(3);
    expect(summaries[1]?.agreementScore).toBeCloseTo(2 / 3);
  });

  it('computes agreement score for consensus round', () => {
    const finalVotes = new Map<string, Vote>();
    finalVotes.set('a1', makeVote({ decision: 'approve' }));
    finalVotes.set('a2', makeVote({ decision: 'approve' }));
    finalVotes.set('a3', makeVote({ decision: 'reject' }));

    const session = makeSession({
      rounds: [
        makeEmptyRound({ phase: 'analysis' }),
        makeEmptyRound({ phase: 'deliberation' }),
        makeEmptyRound({
          phase: 'consensus',
          finalVotes,
          completedAt: '2026-01-15T12:03:00.000Z',
        }),
      ],
    });

    const summaries = buildRoundSummaries(session);
    expect(summaries).toHaveLength(3);
    expect(summaries[2]?.phase).toBe('consensus');
    expect(summaries[2]?.votesCount).toBe(3);
    expect(summaries[2]?.agreementScore).toBeCloseTo(2 / 3);
  });
});
