/**
 * Tests for `applyErrorPolicy` (#2630).
 *
 * Pins behavior of each policy plus the hard floor:
 * - `reduce_denominator`: errors filtered out
 * - `count_as_abstain`: errors converted to abstain, kept in engine input
 * - `fail_closed`: any error short-circuits
 * - Hard floor: errors > 50% always short-circuits regardless of policy
 *
 * @module mcp/tools/consensus-vote-error-policy.test
 */

import { describe, expect, it } from 'vitest';

import type { AgentVoteResult, VoterRole } from '../../cli/vote-types.js';
import { applyErrorPolicy } from './consensus-vote-error-policy.js';

function makeVote(
  role: VoterRole,
  decision: 'approve' | 'reject' | 'abstain',
  source: 'llm' | 'simulation' | 'error'
): AgentVoteResult {
  return {
    role,
    vote: {
      decision,
      confidence: source === 'error' ? 0 : 0.9,
      reasoning: `${decision} from ${role}`,
    },
    source,
    processingTimeMs: source === 'error' ? 60_010 : 1_000,
  };
}

describe('applyErrorPolicy (#2630)', () => {
  describe('reduce_denominator', () => {
    it('passes through clean votes unchanged', () => {
      const votes = [
        makeVote('architect', 'approve', 'llm'),
        makeVote('security', 'approve', 'llm'),
        makeVote('devex', 'reject', 'llm'),
      ];
      const decision = applyErrorPolicy(votes, 'reduce_denominator');
      expect(decision.shortCircuit).toBe(false);
      expect(decision.engineVotes).toHaveLength(3);
    });

    it('filters error votes out before the engine sees them', () => {
      const votes = [
        makeVote('architect', 'approve', 'llm'),
        makeVote('security', 'approve', 'llm'),
        makeVote('scope_steward', 'abstain', 'error'),
      ];
      const decision = applyErrorPolicy(votes, 'reduce_denominator');
      expect(decision.shortCircuit).toBe(false);
      expect(decision.engineVotes).toHaveLength(2);
      expect(decision.engineVotes.every((v) => v.source !== 'error')).toBe(true);
    });
  });

  describe('count_as_abstain', () => {
    it('keeps error votes in engine input but converts decision to abstain', () => {
      const votes = [
        makeVote('architect', 'approve', 'llm'),
        makeVote('security', 'reject', 'llm'),
        makeVote('scope_steward', 'reject', 'error'), // decision was 'reject' but source 'error'
      ];
      const decision = applyErrorPolicy(votes, 'count_as_abstain');
      expect(decision.shortCircuit).toBe(false);
      expect(decision.engineVotes).toHaveLength(3);

      const errorVote = decision.engineVotes.find((v) => v.source === 'error');
      expect(errorVote).toBeDefined();
      expect(errorVote?.vote.decision).toBe('abstain'); // forced to abstain
      expect(errorVote?.source).toBe('error'); // source preserved for visibility
    });

    it('preserves non-error votes verbatim', () => {
      const votes = [
        makeVote('architect', 'approve', 'llm'),
        makeVote('security', 'reject', 'llm'),
      ];
      const decision = applyErrorPolicy(votes, 'count_as_abstain');
      expect(decision.engineVotes[0]?.vote.decision).toBe('approve');
      expect(decision.engineVotes[1]?.vote.decision).toBe('reject');
    });
  });

  describe('fail_closed', () => {
    it('passes through when there are zero errors', () => {
      const votes = [
        makeVote('architect', 'approve', 'llm'),
        makeVote('security', 'approve', 'llm'),
      ];
      const decision = applyErrorPolicy(votes, 'fail_closed');
      expect(decision.shortCircuit).toBe(false);
      expect(decision.engineVotes).toHaveLength(2);
    });

    it('short-circuits on any error, regardless of count', () => {
      // Single error in a 7-voter run trips fail_closed — that's the point.
      const votes = [
        makeVote('architect', 'approve', 'llm'),
        makeVote('security', 'approve', 'llm'),
        makeVote('devex', 'approve', 'llm'),
        makeVote('ai_ml', 'approve', 'llm'),
        makeVote('pm', 'approve', 'llm'),
        makeVote('catfish', 'approve', 'llm'),
        makeVote('scope_steward', 'abstain', 'error'),
      ];
      const decision = applyErrorPolicy(votes, 'fail_closed');
      expect(decision.shortCircuit).toBe(true);
      expect(decision.reason).toContain('fail_closed');
      expect(decision.reason).toContain('1 voter');
      expect(decision.engineVotes).toEqual([]);
    });
  });

  describe('hard floor (errors > 50%)', () => {
    it('short-circuits regardless of policy when errors exceed 50% (reduce_denominator)', () => {
      // 4 of 7 voters errored. reduce_denominator alone would happily count
      // 3 voters as the "consensus" — the floor catches that.
      const votes = [
        makeVote('architect', 'approve', 'llm'),
        makeVote('security', 'approve', 'llm'),
        makeVote('devex', 'approve', 'llm'),
        makeVote('ai_ml', 'abstain', 'error'),
        makeVote('pm', 'abstain', 'error'),
        makeVote('catfish', 'abstain', 'error'),
        makeVote('scope_steward', 'abstain', 'error'),
      ];
      const decision = applyErrorPolicy(votes, 'reduce_denominator');
      expect(decision.shortCircuit).toBe(true);
      expect(decision.reason).toContain('Errors exceeded');
      expect(decision.reason).toContain('4/7');
    });

    it('short-circuits regardless of policy when errors exceed 50% (count_as_abstain)', () => {
      const votes = [
        makeVote('architect', 'approve', 'llm'),
        makeVote('security', 'abstain', 'error'),
        makeVote('devex', 'abstain', 'error'),
      ];
      const decision = applyErrorPolicy(votes, 'count_as_abstain');
      expect(decision.shortCircuit).toBe(true);
      expect(decision.reason).toContain('Errors exceeded');
    });

    it('does not trip when errors equal exactly 50%', () => {
      // The floor is strict-greater-than 50%, not >=. Exactly half is a
      // judgment call — let the policy decide. This documents that line.
      const votes = [
        makeVote('architect', 'approve', 'llm'),
        makeVote('security', 'approve', 'llm'),
        makeVote('devex', 'abstain', 'error'),
        makeVote('ai_ml', 'abstain', 'error'),
      ];
      const decision = applyErrorPolicy(votes, 'reduce_denominator');
      expect(decision.shortCircuit).toBe(false);
      expect(decision.engineVotes).toHaveLength(2);
    });
  });

  describe('edge cases', () => {
    it('handles empty vote array (no votes, no errors)', () => {
      const decision = applyErrorPolicy([], 'reduce_denominator');
      expect(decision.shortCircuit).toBe(false);
      expect(decision.engineVotes).toEqual([]);
    });

    it('handles all-error case under fail_closed', () => {
      const votes = [
        makeVote('architect', 'abstain', 'error'),
        makeVote('security', 'abstain', 'error'),
      ];
      // All-error trips BOTH the hard floor and fail_closed. The floor
      // check runs first, so its message is what the caller sees.
      const decision = applyErrorPolicy(votes, 'fail_closed');
      expect(decision.shortCircuit).toBe(true);
      expect(decision.reason).toContain('Errors exceeded');
    });
  });
});
