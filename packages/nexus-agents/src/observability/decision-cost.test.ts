/**
 * Fixture tests for the pure per-decision cost rollup (#3855).
 *
 * Pins the acceptance-criteria math:
 *  - per-voter → per-decision totals
 *  - per-model breakdown
 *  - missing-cost handling as UNMEASURED, not zero
 *  - plan mode records 0-cost but keeps token counts
 *
 * @module observability/decision-cost.test
 */

import { describe, it, expect } from 'vitest';

import {
  rollupDecisionCost,
  DecisionCostSummarySchema,
  UNKNOWN_MODEL,
  type VoterCostInput,
} from './decision-cost.js';

describe('rollupDecisionCost', () => {
  describe('per-voter → per-decision totals (api mode)', () => {
    it('sums tokens and cost across measured voters', () => {
      const voters: VoterCostInput[] = [
        {
          role: 'architect',
          model: 'claude-sonnet',
          inputTokens: 1000,
          outputTokens: 200,
          costUsd: 0.006,
        },
        {
          role: 'security',
          model: 'claude-sonnet',
          inputTokens: 500,
          outputTokens: 100,
          costUsd: 0.003,
        },
        {
          role: 'devex',
          model: 'gemini-flash',
          inputTokens: 2000,
          outputTokens: 400,
          costUsd: 0.0016,
        },
      ];

      const summary = rollupDecisionCost(voters, 'api');

      expect(summary.voterCount).toBe(3);
      expect(summary.measuredVoters).toBe(3);
      expect(summary.unmeasuredVoters).toBe(0);
      expect(summary.totalInputTokens).toBe(3500);
      expect(summary.totalOutputTokens).toBe(700);
      expect(summary.totalTokens).toBe(4200);
      expect(summary.totalCostUsd).toBeCloseTo(0.0106, 9);
      expect(summary.perVoter).toHaveLength(3);
    });

    it('preserves per-voter breakdown in input order', () => {
      const voters: VoterCostInput[] = [
        {
          role: 'architect',
          model: 'claude-opus',
          inputTokens: 10,
          outputTokens: 5,
          costUsd: 0.001,
        },
        {
          role: 'catfish',
          model: 'gemini-flash',
          inputTokens: 20,
          outputTokens: 8,
          costUsd: 0.0001,
        },
      ];

      const summary = rollupDecisionCost(voters, 'api');

      expect(summary.perVoter[0]?.role).toBe('architect');
      expect(summary.perVoter[0]?.totalTokens).toBe(15);
      expect(summary.perVoter[0]?.unmeasured).toBe(false);
      expect(summary.perVoter[1]?.role).toBe('catfish');
      expect(summary.perVoter[1]?.totalTokens).toBe(28);
    });
  });

  describe('per-model breakdown', () => {
    it('groups voters by model and sums per model', () => {
      const voters: VoterCostInput[] = [
        {
          role: 'architect',
          model: 'claude-sonnet',
          inputTokens: 1000,
          outputTokens: 200,
          costUsd: 0.006,
        },
        {
          role: 'security',
          model: 'claude-sonnet',
          inputTokens: 500,
          outputTokens: 100,
          costUsd: 0.003,
        },
        {
          role: 'devex',
          model: 'gemini-flash',
          inputTokens: 2000,
          outputTokens: 400,
          costUsd: 0.0016,
        },
      ];

      const summary = rollupDecisionCost(voters, 'api');

      expect(summary.perModel).toHaveLength(2);
      const sonnet = summary.perModel.find((m) => m.model === 'claude-sonnet');
      const flash = summary.perModel.find((m) => m.model === 'gemini-flash');
      expect(sonnet?.voterCount).toBe(2);
      expect(sonnet?.inputTokens).toBe(1500);
      expect(sonnet?.outputTokens).toBe(300);
      expect(sonnet?.totalTokens).toBe(1800);
      expect(sonnet?.costUsd).toBeCloseTo(0.009, 9);
      expect(flash?.voterCount).toBe(1);
      expect(flash?.totalTokens).toBe(2400);
    });

    it('sorts per-model breakdown by cost desc (highest spend first)', () => {
      const voters: VoterCostInput[] = [
        {
          role: 'devex',
          model: 'cheap-model',
          inputTokens: 100,
          outputTokens: 50,
          costUsd: 0.0001,
        },
        {
          role: 'architect',
          model: 'pricey-model',
          inputTokens: 100,
          outputTokens: 50,
          costUsd: 0.5,
        },
      ];

      const summary = rollupDecisionCost(voters, 'api');

      expect(summary.perModel[0]?.model).toBe('pricey-model');
      expect(summary.perModel[1]?.model).toBe('cheap-model');
    });
  });

  describe('missing-cost handling: UNMEASURED, not zero', () => {
    it('counts a voter with no usage as unmeasured, not a measured $0', () => {
      const voters: VoterCostInput[] = [
        {
          role: 'architect',
          model: 'claude-sonnet',
          inputTokens: 1000,
          outputTokens: 200,
          costUsd: 0.006,
        },
        // A CLI-subscription / error voter that reported NO usage:
        { role: 'security', model: 'claude-cli' },
      ];

      const summary = rollupDecisionCost(voters, 'api');

      expect(summary.voterCount).toBe(2);
      expect(summary.measuredVoters).toBe(1);
      expect(summary.unmeasuredVoters).toBe(1);
      // The total is a FLOOR — the unmeasured voter contributes 0, not its
      // unknown real cost.
      expect(summary.totalCostUsd).toBeCloseTo(0.006, 9);
      const unmeasured = summary.perVoter.find((v) => v.role === 'security');
      expect(unmeasured?.unmeasured).toBe(true);
      expect(unmeasured?.costUsd).toBe(0);
      expect(unmeasured?.totalTokens).toBe(0);
    });

    it('treats a voter with no model as the unknown-model sentinel', () => {
      const voters: VoterCostInput[] = [{ role: 'catfish' }];

      const summary = rollupDecisionCost(voters, 'api');

      expect(summary.perVoter[0]?.model).toBe(UNKNOWN_MODEL);
      expect(summary.perVoter[0]?.unmeasured).toBe(true);
      expect(summary.perModel[0]?.model).toBe(UNKNOWN_MODEL);
    });

    it('a measured voter with zero cost (free model) is NOT unmeasured', () => {
      // Reported tokens but a free model ⇒ measured, cost genuinely 0.
      const voters: VoterCostInput[] = [
        { role: 'devex', model: 'free-model', inputTokens: 500, outputTokens: 100, costUsd: 0 },
      ];

      const summary = rollupDecisionCost(voters, 'api');

      expect(summary.measuredVoters).toBe(1);
      expect(summary.unmeasuredVoters).toBe(0);
      expect(summary.perVoter[0]?.unmeasured).toBe(false);
      expect(summary.totalTokens).toBe(600);
      expect(summary.totalCostUsd).toBe(0);
    });
  });

  describe('plan mode: 0-cost recorded, token counts kept', () => {
    it('zeroes every cost but preserves tokens', () => {
      const voters: VoterCostInput[] = [
        {
          role: 'architect',
          model: 'claude-sonnet',
          inputTokens: 1000,
          outputTokens: 200,
          costUsd: 0.006,
        },
        {
          role: 'security',
          model: 'claude-sonnet',
          inputTokens: 500,
          outputTokens: 100,
          costUsd: 0.003,
        },
      ];

      const summary = rollupDecisionCost(voters, 'plan');

      expect(summary.billingMode).toBe('plan');
      expect(summary.totalCostUsd).toBe(0);
      expect(summary.perVoter.every((v) => v.costUsd === 0)).toBe(true);
      expect(summary.perModel.every((m) => m.costUsd === 0)).toBe(true);
      // Tokens are KEPT — plan mode still measures consumption.
      expect(summary.totalInputTokens).toBe(1500);
      expect(summary.totalOutputTokens).toBe(300);
      expect(summary.totalTokens).toBe(1800);
      // Token-reporting voters are still measured in plan mode.
      expect(summary.measuredVoters).toBe(2);
    });
  });

  describe('edge cases', () => {
    it('handles an empty panel (all zeros, no NaN)', () => {
      const summary = rollupDecisionCost([], 'api');

      expect(summary.voterCount).toBe(0);
      expect(summary.measuredVoters).toBe(0);
      expect(summary.unmeasuredVoters).toBe(0);
      expect(summary.totalTokens).toBe(0);
      expect(summary.totalCostUsd).toBe(0);
      expect(summary.perVoter).toEqual([]);
      expect(summary.perModel).toEqual([]);
    });

    it('rounds totals to micro-USD to avoid float drift', () => {
      const voters: VoterCostInput[] = [
        { role: 'a', model: 'm', inputTokens: 1, outputTokens: 1, costUsd: 0.1 },
        { role: 'b', model: 'm', inputTokens: 1, outputTokens: 1, costUsd: 0.2 },
      ];

      const summary = rollupDecisionCost(voters, 'api');

      // 0.1 + 0.2 = 0.30000000000000004 in IEEE-754; rounded to micro-USD = 0.3.
      expect(summary.totalCostUsd).toBe(0.3);
    });
  });
});

describe('DecisionCostSummarySchema (#4032 — pins the MCP cost-summary shape)', () => {
  // This schema rides consensus_vote/pr_review `outputSchema`. A strict MCP client
  // validates the cost summary recursively, so any field the producer emits that
  // the schema does not declare → `-32602 additional properties`. Validate a REAL
  // rollup output strictly so producer↔schema drift fails the test, not a client.
  it('strictly accepts a real rollup output, top-level and per-row', () => {
    const voters: VoterCostInput[] = [
      {
        role: 'architect',
        model: 'claude-sonnet',
        inputTokens: 1000,
        outputTokens: 200,
        costUsd: 0.006,
      },
      { role: 'security', model: 'gemini-flash' }, // unmeasured (no token/cost report)
    ];
    const summary = rollupDecisionCost(voters, 'api');

    expect(() => DecisionCostSummarySchema.strict().parse(summary)).not.toThrow();
    expect(Object.keys(summary.perVoter[0]!).sort()).toEqual([
      'costUsd',
      'inputTokens',
      'model',
      'outputTokens',
      'role',
      'totalTokens',
      'unmeasured',
    ]);
    expect(Object.keys(summary.perModel[0]!).sort()).toEqual([
      'costUsd',
      'inputTokens',
      'model',
      'outputTokens',
      'totalTokens',
      'voterCount',
    ]);
  });
});
