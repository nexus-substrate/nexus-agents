/**
 * The engine→strategy seam for weight provenance (#5117).
 *
 * `proof_of_learning` reported "X% weighted approval" for tallies where every
 * weight was structurally 1.0, because `recordVote` called
 * `calculateVoteWeight(undefined)` — which returns the 1.0 new-agent default —
 * for every voter, whether or not any performance record existed. The strategy
 * received a fully-populated map either way, so by the time it computed the
 * tally the distinction was already gone.
 *
 * These tests exist because mutation testing showed the strategy-level tests
 * could NOT catch that: reverting `recordVote` to write a weight for every
 * voter left all 554 consensus tests green. Both ends were tested and the wire
 * between them was not.
 */
import { describe, it, expect, beforeEach } from 'vitest';

import { createConsensusEngine, type ConsensusEngine } from './index.js';

const VOTERS = ['agent-1', 'agent-2', 'agent-3'] as const;

async function runProposal(engine: ConsensusEngine, weightedVoters: readonly string[] = []) {
  for (const id of weightedVoters) {
    // The only writer of performance history. Its absence in production is the
    // subject of #5234; here it is called directly to prove the basis FLIPS.
    engine.updateAgentPerformance(id, true);
  }

  const proposed = await engine.propose({
    title: 'Weight basis probe',
    description: 'Exercises the engine to strategy seam for weight provenance',
    algorithm: 'proof_of_learning',
  });
  if (!proposed.ok) throw new Error('propose failed');

  for (const id of VOTERS) {
    const voted = await engine.vote(proposed.value, id, {
      decision: 'approve',
      confidence: 0.9,
      reasoning: 'probe',
    });
    if (!voted.ok) throw new Error(`vote failed for ${id}: ${voted.error.message}`);
  }

  const closed = await engine.close(proposed.value);
  if (!closed.ok) throw new Error('close failed');
  return closed.value;
}

describe('weight provenance survives the engine seam (#5117)', () => {
  let engine: ConsensusEngine;

  beforeEach(() => {
    engine = createConsensusEngine({
      defaultTimeout: 60000,
      minVotersForQuorum: 2,
      maxActiveProposals: 10,
    });
  });

  it('reports unweighted when no voter has performance history', () => {
    // The production state today: nothing calls updateAgentPerformance, so
    // every real proof_of_learning tally is this case.
    return runProposal(engine).then((result) => {
      expect(result.weightBasis).toBe('unweighted');
    });
  });

  it('reports performance once every voter has history', () => {
    // The seam test proper. If `recordVote` went back to writing a default
    // weight for everyone, the unweighted case above would silently become
    // 'performance' — so this pairing is what makes the field mean something.
    return runProposal(engine, VOTERS).then((result) => {
      expect(result.weightBasis).toBe('performance');
    });
  });

  it('reports partial when only some voters have history', () => {
    return runProposal(engine, [VOTERS[0]]).then((result) => {
      expect(result.weightBasis).toBe('partial');
    });
  });

  it('carries the basis on the RESULT, not only inside the strategy', () => {
    // ConsensusResult originally dropped the field, so the strategy computed an
    // honest basis and the consumer never saw it — the fix would have been
    // real and invisible.
    return runProposal(engine).then((result) => {
      expect(Object.hasOwn(result, 'weightBasis')).toBe(true);
    });
  });
});
