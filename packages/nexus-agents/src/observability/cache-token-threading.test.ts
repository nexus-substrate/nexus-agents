/**
 * Cache token figures must reach the decision-cost rollup (#4435).
 *
 * The parser extracts them (#4438) and the adapter response now carries them
 * (#4439). This is the last hop: VoteUsage → AgentVoteResult → VoterCostInput
 * → VoterCostBreakdown, so an operator reading a decision's cost record can
 * see that a voter's `inputTokens: 2` sits next to 3,980 cached tokens rather
 * than being the whole story.
 *
 * Read and creation stay separate all the way down: cache reads bill at ~0.1x
 * the uncached input rate and cache writes at ~1.25x, so a single merged
 * "cached" number could not be priced correctly later.
 *
 * @module observability/cache-token-threading.test
 */

import { describe, it, expect } from 'vitest';
import {
  rollupDecisionCost,
  DecisionCostSummarySchema,
  type VoterCostInput,
} from './decision-cost.js';

const voter = (over: Partial<VoterCostInput> = {}): VoterCostInput => ({
  role: 'architect',
  model: 'claude-fable-5',
  inputTokens: 2,
  outputTokens: 500,
  costUsd: 0.01,
  ...over,
});

describe('cache tokens reach the rollup (#4435)', () => {
  it('surfaces cache-read tokens on the per-voter line', () => {
    const out = rollupDecisionCost([voter({ cachedInputTokens: 3980 })], 'plan');

    expect(out.perVoter[0]?.cachedInputTokens).toBe(3980);
  });

  it('surfaces cache-creation tokens separately from reads', () => {
    // Different billing rates — merging them would foreclose correct pricing.
    const out = rollupDecisionCost(
      [voter({ cachedInputTokens: 300, cacheCreationInputTokens: 700 })],
      'plan'
    );

    expect(out.perVoter[0]?.cachedInputTokens).toBe(300);
    expect(out.perVoter[0]?.cacheCreationInputTokens).toBe(700);
  });

  it('omits the fields entirely when the voter reported no cache activity', () => {
    // Absent stays absent, consistent with #4439 — a 0 would assert "no cache
    // was used", which is a different claim from "we were not told".
    const out = rollupDecisionCost([voter()], 'plan');

    expect(out.perVoter[0]?.cachedInputTokens).toBeUndefined();
    expect(out.perVoter[0]?.cacheCreationInputTokens).toBeUndefined();
  });

  it('leaves totalTokens meaning uncached input + output', () => {
    // Deliberately unchanged in this increment. Redefining a widely-read field
    // is a semantics change for every existing consumer and record, and needs
    // its own decision — see the follow-up filed alongside this.
    const out = rollupDecisionCost([voter({ cachedInputTokens: 3980 })], 'plan');

    expect(out.perVoter[0]?.totalTokens).toBe(502);
    expect(out.totalTokens).toBe(502);
  });

  it('does not let cache tokens affect measured/unmeasured', () => {
    // Cache figures are extra detail, not the evidence #4436 gates on.
    const out = rollupDecisionCost([voter({ cachedInputTokens: 10 })], 'plan');

    expect(out.perVoter[0]?.unmeasured).toBe(false);
  });
});

describe('schema still pins the producer (#4032 guard extended)', () => {
  it('strictly accepts a rollup carrying cache fields', () => {
    // The schema rides consensus_vote's MCP outputSchema. A field the producer
    // emits but the schema omits is a `-32602 additional properties` rejection
    // at a strict client, so this must fail here rather than there.
    const out = rollupDecisionCost(
      [voter({ cachedInputTokens: 300, cacheCreationInputTokens: 700 })],
      'api'
    );

    expect(() => DecisionCostSummarySchema.strict().parse(out)).not.toThrow();
  });

  it('strictly accepts a rollup with no cache fields at all', () => {
    const out = rollupDecisionCost([voter()], 'api');

    expect(() => DecisionCostSummarySchema.strict().parse(out)).not.toThrow();
  });
});
