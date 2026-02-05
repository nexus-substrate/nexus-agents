/**
 * Tests for Free-MAD Helpers
 * @module agents/collaboration/free-mad-helpers.test
 */

import { describe, it, expect } from 'vitest';
import type { AntiConformityScore, DebateTrajectory, AgentTrajectory } from './free-mad-types.js';
import {
  findMajority,
  computePositionScores,
  findWinningPosition,
  countSimpleVotes,
  getSimpleMajority,
  generateReasoning,
} from './free-mad-helpers.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makeTrajectory(
  agents: Array<{ id: string; positions: Array<{ round: number; position: string }> }>
): DebateTrajectory {
  const agentTrajectories = new Map<string, AgentTrajectory>();
  for (const agent of agents) {
    agentTrajectories.set(agent.id, {
      agentId: agent.id,
      positions: agent.positions.map((p) => ({
        ...p,
        agentId: agent.id,
        confidence: 0.8,
      })),
      positionChanges: 0,
      conformedToMajority: false,
      conformityRounds: [],
    } as unknown as AgentTrajectory);
  }
  return {
    agentTrajectories,
    roundSnapshots: [],
    totalRounds: 0,
  } as unknown as DebateTrajectory;
}

function makeScore(overrides: Partial<AntiConformityScore> = {}): AntiConformityScore {
  return {
    agentId: 'agent-1',
    baseScore: 1.0,
    conformityPenalty: 0,
    finalScore: 1.0,
    ...overrides,
  } as AntiConformityScore;
}

// ============================================================================
// findMajority
// ============================================================================

describe('findMajority', () => {
  it('finds majority when threshold met', () => {
    const distribution = new Map([
      ['approve', ['a', 'b', 'c']],
      ['reject', ['d']],
    ]);
    const { majorityPosition, majorityStrength } = findMajority(distribution, 4, 0.5);
    expect(majorityPosition).toBe('approve');
    expect(majorityStrength).toBe(0.75);
  });

  it('returns null when no majority', () => {
    const distribution = new Map([
      ['approve', ['a']],
      ['reject', ['b']],
    ]);
    const { majorityPosition } = findMajority(distribution, 2, 0.75);
    expect(majorityPosition).toBeNull();
  });

  it('picks strongest when multiple meet threshold', () => {
    const distribution = new Map([
      ['approve', ['a', 'b', 'c']],
      ['reject', ['d', 'e']],
    ]);
    const { majorityPosition } = findMajority(distribution, 5, 0.3);
    expect(majorityPosition).toBe('approve');
  });
});

// ============================================================================
// computePositionScores
// ============================================================================

describe('computePositionScores', () => {
  it('computes weighted scores', () => {
    const trajectory = makeTrajectory([
      { id: 'a', positions: [{ round: 0, position: 'approve' }] },
      { id: 'b', positions: [{ round: 0, position: 'approve' }] },
      { id: 'c', positions: [{ round: 0, position: 'reject' }] },
    ]);
    const scores = [
      makeScore({ agentId: 'a', finalScore: 1.0 }),
      makeScore({ agentId: 'b', finalScore: 0.8 }),
      makeScore({ agentId: 'c', finalScore: 0.5 }),
    ];
    const result = computePositionScores(trajectory, scores);
    expect(result.get('approve')).toBeCloseTo(1.8);
    expect(result.get('reject')).toBeCloseTo(0.5);
  });

  it('returns empty for no agents', () => {
    const trajectory = makeTrajectory([]);
    const result = computePositionScores(trajectory, []);
    expect(result.size).toBe(0);
  });
});

// ============================================================================
// findWinningPosition
// ============================================================================

describe('findWinningPosition', () => {
  it('finds highest scoring position', () => {
    const scores = new Map([
      ['approve', 2.5],
      ['reject', 1.0],
    ]);
    const { winningPosition, maxScore } = findWinningPosition(scores);
    expect(winningPosition).toBe('approve');
    expect(maxScore).toBe(2.5);
  });

  it('returns empty for empty scores', () => {
    const { winningPosition } = findWinningPosition(new Map());
    expect(winningPosition).toBe('');
  });
});

// ============================================================================
// countSimpleVotes
// ============================================================================

describe('countSimpleVotes', () => {
  it('counts final positions', () => {
    const trajectory = makeTrajectory([
      {
        id: 'a',
        positions: [
          { round: 0, position: 'approve' },
          { round: 1, position: 'approve' },
        ],
      },
      {
        id: 'b',
        positions: [
          { round: 0, position: 'reject' },
          { round: 1, position: 'approve' },
        ],
      },
      { id: 'c', positions: [{ round: 0, position: 'reject' }] },
    ]);
    const counts = countSimpleVotes(trajectory);
    expect(counts.get('approve')).toBe(2);
    expect(counts.get('reject')).toBe(1);
  });
});

// ============================================================================
// getSimpleMajority
// ============================================================================

describe('getSimpleMajority', () => {
  it('returns position with most votes', () => {
    const counts = new Map([
      ['approve', 3],
      ['reject', 2],
    ]);
    expect(getSimpleMajority(counts)).toBe('approve');
  });

  it('returns empty for empty map', () => {
    expect(getSimpleMajority(new Map())).toBe('');
  });
});

// ============================================================================
// generateReasoning
// ============================================================================

describe('generateReasoning', () => {
  it('includes winning position', () => {
    const scores = new Map([['approve', 2.5]]);
    const reasoning = generateReasoning('approve', scores, [], false);
    expect(reasoning).toContain('approve');
  });

  it('mentions anti-conformity when it mattered', () => {
    const scores = new Map([['approve', 2.5]]);
    const agentScores = [makeScore({ conformityPenalty: -0.3 })];
    const reasoning = generateReasoning('approve', scores, agentScores, true);
    expect(reasoning).toContain('Anti-conformity');
    expect(reasoning).toContain('penalized');
  });

  it('does not mention anti-conformity when irrelevant', () => {
    const scores = new Map([['approve', 2.5]]);
    const reasoning = generateReasoning('approve', scores, [], false);
    expect(reasoning).not.toContain('Anti-conformity');
  });
});
