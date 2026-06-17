/**
 * decision-cost-aggregate — windowed CROSS-decision cost rollups by gate type.
 *
 * Source: Issue #3856 (epic #3854 child, M4).
 *
 * Where {@link module:observability/decision-cost} rolls N voters UP into one
 * per-decision summary, this module rolls N *decisions* up into one per-GATE
 * answer: "across the recent window, what does a `consensus_vote` / `pr_review`
 * decision cost on average?". It is the aggregation `weather_report` surfaces
 * (#3856) so an operator sees what governed decisions are costing without a new
 * MCP tool — the report reads the {@link DecisionCostStore}'s persisted records
 * and folds them through this PURE function.
 *
 * Pure and deterministic: no I/O, no clock, no env reads. The caller supplies
 * the records (already windowed/queried) and this returns the per-gate averages.
 * Averages are reported alongside the decision count and the measured/unmeasured
 * voter split so a reader knows the confidence — a per-gate average is a FLOOR
 * when unmeasured voters contributed (their unknown real cost counts as 0), the
 * same honesty {@link module:observability/decision-cost} keeps per-decision.
 *
 * @module observability/decision-cost-aggregate
 */

import type { DecisionGate, DecisionCostRecord } from './decision-cost-store.js';

/** Per-gate windowed cost aggregate surfaced in the weather report (#3856). */
export interface GateCostAggregate {
  /** Which gate type these decisions came from. */
  readonly gate: DecisionGate;
  /** Number of decisions folded in. */
  readonly decisionCount: number;
  /** Mean total cost (USD) per decision over the window. */
  readonly avgCostUsd: number;
  /** Mean total tokens per decision over the window. */
  readonly avgTokens: number;
  /** Mean number of voters per decision. */
  readonly avgVoters: number;
  /** Sum of cost (USD) across all decisions in the window. */
  readonly totalCostUsd: number;
  /** Sum of tokens across all decisions in the window. */
  readonly totalTokens: number;
  /**
   * Total voters that reported usage across the window. With `unmeasuredVoters`
   * this is the confidence signal: the averages are a FLOOR when
   * `unmeasuredVoters > 0` (unmeasured voters contribute 0, not their real cost).
   */
  readonly measuredVoters: number;
  /** Total voters that reported no usage across the window. */
  readonly unmeasuredVoters: number;
  /**
   * True when `unmeasuredVoters > 0` — the averages understate true spend
   * because some voter calls reported no usage and were folded in as 0.
   */
  readonly costIsFloor: boolean;
}

/** The decision-cost section of the weather report (#3856). */
export interface DecisionCostReport {
  /** Lookback window the records were drawn from, in ms (0 ⇒ all history). */
  readonly windowMs: number;
  /** Per-gate-type aggregates, sorted by total cost desc then gate name. */
  readonly byGate: readonly GateCostAggregate[];
  /** Total decisions across all gates in the window. */
  readonly totalDecisions: number;
  /** Total cost (USD) across all gates in the window. */
  readonly totalCostUsd: number;
}

/** Round to micro-USD so aggregates don't drift to floating-point noise. */
function roundUsd(usd: number): number {
  return Math.round(usd * 1_000_000) / 1_000_000;
}

/** Mutable per-gate accumulator used while folding records. */
interface GateAcc {
  decisions: number;
  cost: number;
  tokens: number;
  voters: number;
  measured: number;
  unmeasured: number;
}

function emptyAcc(): GateAcc {
  return { decisions: 0, cost: 0, tokens: 0, voters: 0, measured: 0, unmeasured: 0 };
}

/** Fold one record's summary into its gate accumulator. */
function foldRecord(acc: GateAcc, record: DecisionCostRecord): void {
  const s = record.summary;
  acc.decisions += 1;
  acc.cost += s.totalCostUsd;
  acc.tokens += s.totalTokens;
  acc.voters += s.voterCount;
  acc.measured += s.measuredVoters;
  acc.unmeasured += s.unmeasuredVoters;
}

/** Turn a gate accumulator into its reported aggregate (means + floor flag). */
function toAggregate(gate: DecisionGate, acc: GateAcc): GateCostAggregate {
  const n = acc.decisions;
  return {
    gate,
    decisionCount: n,
    avgCostUsd: n > 0 ? roundUsd(acc.cost / n) : 0,
    avgTokens: n > 0 ? Math.round(acc.tokens / n) : 0,
    avgVoters: n > 0 ? Math.round((acc.voters / n) * 10) / 10 : 0,
    totalCostUsd: roundUsd(acc.cost),
    totalTokens: acc.tokens,
    measuredVoters: acc.measured,
    unmeasuredVoters: acc.unmeasured,
    costIsFloor: acc.unmeasured > 0,
  };
}

/**
 * Aggregate persisted per-decision cost records into a per-gate report (#3856).
 *
 * Pure: the caller supplies the already-windowed records and the `windowMs`
 * they were drawn from (for the report header). Records are grouped by their
 * gate type; each group's totals are averaged over its decision count. Returns
 * an empty `byGate` when no records are supplied.
 */
export function aggregateDecisionCosts(
  records: readonly DecisionCostRecord[],
  windowMs: number
): DecisionCostReport {
  const byGate = new Map<DecisionGate, GateAcc>();
  for (const record of records) {
    const acc = byGate.get(record.gate) ?? emptyAcc();
    foldRecord(acc, record);
    byGate.set(record.gate, acc);
  }

  const aggregates = [...byGate.entries()]
    .map(([gate, acc]) => toAggregate(gate, acc))
    .sort((a, b) => b.totalCostUsd - a.totalCostUsd || a.gate.localeCompare(b.gate));

  return {
    windowMs,
    byGate: aggregates,
    totalDecisions: aggregates.reduce((sum, g) => sum + g.decisionCount, 0),
    totalCostUsd: roundUsd(aggregates.reduce((sum, g) => sum + g.totalCostUsd, 0)),
  };
}
