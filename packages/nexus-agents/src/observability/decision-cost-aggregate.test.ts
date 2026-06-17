/**
 * Fixture tests for the pure cross-decision cost aggregation (#3856).
 *
 * Pins the per-gate windowed rollup the weather_report cost section surfaces:
 *  - grouping records by gate type
 *  - per-gate averages (cost / tokens / voters) over the decision count
 *  - the measured/unmeasured voter split + the `costIsFloor` honesty flag
 *  - deterministic sort (total cost desc, then gate name)
 *
 * @module observability/decision-cost-aggregate.test
 */

import { describe, it, expect } from 'vitest';

import { aggregateDecisionCosts } from './decision-cost-aggregate.js';
import type { DecisionCostRecord, DecisionGate } from './decision-cost-store.js';
import type { DecisionCostSummary } from './decision-cost.js';

/** Build a minimal decision-cost summary for a record fixture. */
function summary(over: Partial<DecisionCostSummary> = {}): DecisionCostSummary {
  return {
    billingMode: 'api',
    voterCount: 0,
    measuredVoters: 0,
    unmeasuredVoters: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalTokens: 0,
    totalCostUsd: 0,
    perVoter: [],
    perModel: [],
    ...over,
  };
}

function record(
  gate: DecisionGate,
  over: Partial<DecisionCostSummary> = {},
  id = `d-${Math.random().toString(36).slice(2)}`
): DecisionCostRecord {
  return { decisionId: id, gate, timestamp: '2026-06-17T00:00:00.000Z', summary: summary(over) };
}

describe('aggregateDecisionCosts', () => {
  it('returns empty byGate for no records', () => {
    const report = aggregateDecisionCosts([], 1000);
    expect(report.byGate).toEqual([]);
    expect(report.totalDecisions).toBe(0);
    expect(report.totalCostUsd).toBe(0);
    expect(report.windowMs).toBe(1000);
  });

  it('averages cost, tokens, and voters per gate over the decision count', () => {
    const records: DecisionCostRecord[] = [
      record('consensus_vote', {
        voterCount: 7,
        measuredVoters: 7,
        totalTokens: 1000,
        totalCostUsd: 0.06,
      }),
      record('consensus_vote', {
        voterCount: 5,
        measuredVoters: 5,
        totalTokens: 2000,
        totalCostUsd: 0.12,
      }),
    ];
    const report = aggregateDecisionCosts(records, 0);
    expect(report.byGate).toHaveLength(1);
    const gate = report.byGate[0];
    expect(gate?.gate).toBe('consensus_vote');
    expect(gate?.decisionCount).toBe(2);
    expect(gate?.avgCostUsd).toBeCloseTo(0.09, 6);
    expect(gate?.avgTokens).toBe(1500);
    expect(gate?.avgVoters).toBe(6); // (7 + 5) / 2
    expect(gate?.totalCostUsd).toBeCloseTo(0.18, 6);
    expect(gate?.totalTokens).toBe(3000);
    expect(gate?.measuredVoters).toBe(12);
    expect(gate?.costIsFloor).toBe(false);
  });

  it('groups by gate type and sorts by total cost desc', () => {
    const records: DecisionCostRecord[] = [
      record('pr_review', { voterCount: 5, measuredVoters: 5, totalCostUsd: 0.02 }),
      record('consensus_vote', { voterCount: 7, measuredVoters: 7, totalCostUsd: 0.5 }),
    ];
    const report = aggregateDecisionCosts(records, 0);
    expect(report.byGate.map((g) => g.gate)).toEqual(['consensus_vote', 'pr_review']);
    expect(report.totalDecisions).toBe(2);
    expect(report.totalCostUsd).toBeCloseTo(0.52, 6);
  });

  it('flags costIsFloor when any voter in the gate window was unmeasured', () => {
    const records: DecisionCostRecord[] = [
      record('pr_review', {
        voterCount: 5,
        measuredVoters: 4,
        unmeasuredVoters: 1,
        totalCostUsd: 0.03,
      }),
    ];
    const report = aggregateDecisionCosts(records, 0);
    const gate = report.byGate[0];
    expect(gate?.unmeasuredVoters).toBe(1);
    expect(gate?.measuredVoters).toBe(4);
    expect(gate?.costIsFloor).toBe(true);
  });
});
