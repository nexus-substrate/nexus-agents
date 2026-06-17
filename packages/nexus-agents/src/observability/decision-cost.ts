/**
 * decision-cost — per-DECISION cost aggregation over a governed panel's voters.
 *
 * Source: Issue #3855 (epic #3854 child, M4).
 *
 * A governed decision — a `consensus_vote` or `pr_review` run — fans out to N
 * voter calls; each voter is one LLM call. Per-CALL usage telemetry already
 * exists ({@link module:learning/usage-log} — token + cost per model call,
 * PR #2479/#2480 era). This module is the AGGREGATION layer that rolls those
 * per-call numbers UP into a single per-decision answer: "what did this
 * governed decision cost?".
 *
 * It is a PURE rollup (no I/O, no clock, no env reads at the math layer):
 * {@link rollupDecisionCost} takes the per-voter cost inputs + the billing mode
 * and returns a {@link DecisionCostSummary} — total tokens, total USD, a
 * per-voter breakdown, and a per-model breakdown. Persistence + the live
 * `process.env` billing-mode read live in the callers (the store + the tools),
 * mirroring the usage-log split between `computeCostUSD` (pure) and
 * `recordUsageEvent` (I/O).
 *
 * Design decisions that the fixture tests pin (#3855 acceptance criteria):
 *
 *  - **Missing cost is UNMEASURED, not zero.** A voter with no token counts
 *    (e.g. a CLI-subscription adapter that doesn't report usage, or an error
 *    vote that never reached the model) is counted in `unmeasuredVoters` and
 *    contributes 0 to the totals — but the summary records that the total is a
 *    floor, not an exact figure (`measured` < `voterCount`). Treating unmeasured
 *    as a true $0 would silently understate spend; this keeps the honesty.
 *  - **Plan mode records 0-cost but keeps tokens.** Under `NEXUS_BILLING_MODE=plan`
 *    the spend is pre-covered by a subscription, so cost is recorded as $0 while
 *    token counts are preserved (so the operator can still see consumption and
 *    a later `api`-mode reprice is possible). This mirrors how plan mode zeroes
 *    cost in routing/scoring without dropping the token signal.
 *
 * @module observability/decision-cost
 */

/** Billing mode in effect for a decision. Mirrors `NEXUS_BILLING_MODE`. */
export type DecisionBillingMode = 'plan' | 'api';

/**
 * One voter's measured (or unmeasured) cost contribution to a decision.
 *
 * Token counts and cost are OPTIONAL: a voter whose adapter reported no usage
 * (CLI subscription, error vote, simulation) leaves them `undefined` and is
 * folded in as `unmeasured` — never silently zeroed. `costUsd`, when present,
 * is the API-mode cost (e.g. from `computeCostUSD`); plan mode zeroes it at
 * rollup time but keeps the tokens.
 */
export interface VoterCostInput {
  /** Voter role (e.g. 'architect', 'security'). */
  readonly role: string;
  /** Model id the voter call used, when known (e.g. 'claude-sonnet'). */
  readonly model?: string | undefined;
  /** Input tokens for the voter call, when the adapter reported them. */
  readonly inputTokens?: number | undefined;
  /** Output tokens for the voter call, when the adapter reported them. */
  readonly outputTokens?: number | undefined;
  /**
   * API-mode cost in USD for the voter call, when computable. Absent ⇒ the
   * voter is unmeasured (see module doc). Present ⇒ used as-is in `api` mode,
   * zeroed in `plan` mode.
   */
  readonly costUsd?: number | undefined;
}

/** Per-voter line in the decision rollup. */
export interface VoterCostBreakdown {
  readonly role: string;
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  /** Effective cost after billing-mode application (0 in plan mode). */
  readonly costUsd: number;
  /**
   * True when this voter reported NO usage at all (no tokens, no cost). Its
   * zeros are placeholders, not a measured $0 / 0-token call.
   */
  readonly unmeasured: boolean;
}

/** Per-model rollup line within a single decision. */
export interface ModelCostBreakdown {
  readonly model: string;
  readonly voterCount: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  readonly costUsd: number;
}

/** Sentinel model id for a voter call whose model is unknown. */
export const UNKNOWN_MODEL = 'unknown';

/**
 * The per-decision cost rollup. Totals are a FLOOR when `unmeasuredVoters > 0`
 * — read alongside `measuredVoters` / `voterCount` for the confidence.
 */
export interface DecisionCostSummary {
  /** Billing mode applied to produce `totalCostUsd` (and per-line `costUsd`). */
  readonly billingMode: DecisionBillingMode;
  /** Total voters folded into this decision. */
  readonly voterCount: number;
  /** Voters that reported usage (tokens and/or cost). */
  readonly measuredVoters: number;
  /** Voters that reported no usage at all (counted, not zeroed-as-fact). */
  readonly unmeasuredVoters: number;
  readonly totalInputTokens: number;
  readonly totalOutputTokens: number;
  readonly totalTokens: number;
  /**
   * Total cost in USD. 0 under `plan` mode by construction. A FLOOR when
   * `unmeasuredVoters > 0` (unmeasured voters contribute 0, not their unknown
   * real cost).
   */
  readonly totalCostUsd: number;
  /** Per-voter breakdown, in input order. */
  readonly perVoter: readonly VoterCostBreakdown[];
  /** Per-model breakdown, sorted by total cost desc then total tokens desc. */
  readonly perModel: readonly ModelCostBreakdown[];
}

/** A voter contributes usage iff it reported any token count or a cost. */
function isMeasured(v: VoterCostInput): boolean {
  return (
    (v.inputTokens !== undefined && v.inputTokens > 0) ||
    (v.outputTokens !== undefined && v.outputTokens > 0) ||
    v.costUsd !== undefined
  );
}

/** Round to micro-USD so summaries don't drift to floating-point noise. */
function roundUsd(usd: number): number {
  return Math.round(usd * 1_000_000) / 1_000_000;
}

/** Per-model accumulator used while folding voters. */
interface ModelAcc {
  input: number;
  output: number;
  cost: number;
  count: number;
}

/**
 * Resolve one voter into its per-decision breakdown line under the billing mode.
 * Plan mode zeroes cost (tokens kept); unmeasured voters surface zeros flagged
 * as placeholders.
 */
function toVoterBreakdown(v: VoterCostInput, isPlan: boolean): VoterCostBreakdown {
  const measured = isMeasured(v);
  const inputTokens = v.inputTokens ?? 0;
  const outputTokens = v.outputTokens ?? 0;
  // Plan mode: cost is pre-covered, record 0 but keep tokens. Api mode: use the
  // supplied cost (a measured voter with no costUsd ⇒ 0, e.g. a free model).
  const costUsd = isPlan ? 0 : roundUsd(v.costUsd ?? 0);
  return {
    role: v.role,
    model: v.model ?? UNKNOWN_MODEL,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    costUsd,
    unmeasured: !measured,
  };
}

/**
 * Roll N per-voter cost inputs up into one {@link DecisionCostSummary}.
 *
 * Pure and deterministic: no I/O, no clock, no env reads. `plan` mode zeroes
 * every cost (tokens kept); `api` mode uses the supplied `costUsd`. Voters that
 * reported no usage are counted in `unmeasuredVoters` and contribute zeros that
 * are explicitly NOT a measured $0 (see module doc / `unmeasured` flag).
 */
export function rollupDecisionCost(
  voters: readonly VoterCostInput[],
  billingMode: DecisionBillingMode
): DecisionCostSummary {
  const isPlan = billingMode === 'plan';
  const perVoter: VoterCostBreakdown[] = [];
  const modelAcc = new Map<string, ModelAcc>();

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCostUsd = 0;
  let measuredVoters = 0;

  for (const v of voters) {
    const line = toVoterBreakdown(v, isPlan);
    if (!line.unmeasured) measuredVoters++;
    totalInputTokens += line.inputTokens;
    totalOutputTokens += line.outputTokens;
    totalCostUsd += line.costUsd;
    perVoter.push(line);

    const acc = modelAcc.get(line.model) ?? { input: 0, output: 0, cost: 0, count: 0 };
    acc.input += line.inputTokens;
    acc.output += line.outputTokens;
    acc.cost += line.costUsd;
    acc.count += 1;
    modelAcc.set(line.model, acc);
  }

  const perModel = buildPerModelBreakdowns(modelAcc);

  return {
    billingMode,
    voterCount: voters.length,
    measuredVoters,
    unmeasuredVoters: voters.length - measuredVoters,
    totalInputTokens,
    totalOutputTokens,
    totalTokens: totalInputTokens + totalOutputTokens,
    totalCostUsd: roundUsd(totalCostUsd),
    perVoter,
    perModel,
  };
}

/** Aggregate the per-model accumulator into sorted {@link ModelCostBreakdown} rows. */
function buildPerModelBreakdowns(modelAcc: Map<string, ModelAcc>): ModelCostBreakdown[] {
  return [...modelAcc.entries()]
    .map(([model, a]) => ({
      model,
      voterCount: a.count,
      inputTokens: a.input,
      outputTokens: a.output,
      totalTokens: a.input + a.output,
      costUsd: roundUsd(a.cost),
    }))
    .sort(
      (x, y) =>
        y.costUsd - x.costUsd || y.totalTokens - x.totalTokens || x.model.localeCompare(y.model)
    );
}
