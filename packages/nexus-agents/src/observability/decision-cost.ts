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
 *  - **Missing cost is UNMEASURED, not zero.** A voter with no computable cost
 *    — no usage report at all (a CLI-subscription adapter, an error vote that
 *    never reached the model) or a model with no pricing anywhere in the
 *    registry chain (#4165) — is counted in `unmeasuredVoters` and contributes
 *    0 to the COST totals (reported tokens still count toward consumption) —
 *    but the summary records that the total is a floor, not an exact figure
 *    (`measured` < `voterCount`). Treating unmeasured as a true $0 would
 *    silently understate spend; this keeps the honesty.
 *  - **Plan mode records 0-cost but keeps tokens.** Under `NEXUS_BILLING_MODE=plan`
 *    the spend is pre-covered by a subscription, so cost is recorded as $0 while
 *    token counts are preserved (so the operator can still see consumption and
 *    a later `api`-mode reprice is possible). This mirrors how plan mode zeroes
 *    cost in routing/scoring without dropping the token signal.
 *
 * @module observability/decision-cost
 */

import { z } from 'zod';

/** Billing mode in effect for a decision. Mirrors `NEXUS_BILLING_MODE`. */
export type DecisionBillingMode = 'plan' | 'api';

/**
 * One voter's measured (or unmeasured) cost contribution to a decision.
 *
 * Token counts and cost are OPTIONAL: a voter whose adapter reported no usage
 * (CLI subscription, error vote, simulation) leaves them `undefined` and is
 * folded in as `unmeasured` — never silently zeroed. `costUsd`, when present,
 * is the API-mode cost (e.g. from `computeCostDetail`); plan mode zeroes it at
 * rollup time but keeps the tokens. A voter with tokens but NO `costUsd`
 * (unpriced model, #4165) is likewise unmeasured — its tokens count toward
 * consumption while its unknown cost is honestly excluded from the total.
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
   * True when no cost was computable for this voter — no usage report at all,
   * or a token-reporting call on an unpriced model (#4165). Its cost zero is a
   * placeholder, not a measured $0.
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
  /** Voters with a computable cost (`costUsd` present on the input). */
  readonly measuredVoters: number;
  /**
   * Voters whose cost could not be computed — no usage report, or an unpriced
   * model (#4165). Counted, not zeroed-as-fact.
   */
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

/**
 * Zod schema for {@link DecisionCostSummary} — the single source of truth for
 * the cost-rollup shape when it rides an MCP tool's `outputSchema`. `consensus_vote`
 * declares this in its `outputSchema`, so a spec-strict MCP client validates the
 * cost summary against it; declaring the shape once here is what fixed #4032's
 * `-32602 additional properties` rejection. `pr_review` returns the same object
 * but does not yet advertise an `outputSchema`, so it will reuse this when it does.
 * A runtime guard test pins the schema to the producer output (`rollupDecisionCost`)
 * so the shape can't drift.
 */
export const DecisionCostSummarySchema = z.object({
  billingMode: z.enum(['plan', 'api']),
  voterCount: z.number(),
  measuredVoters: z.number(),
  unmeasuredVoters: z.number(),
  totalInputTokens: z.number(),
  totalOutputTokens: z.number(),
  totalTokens: z.number(),
  totalCostUsd: z.number(),
  perVoter: z.array(
    z.object({
      role: z.string(),
      model: z.string(),
      inputTokens: z.number(),
      outputTokens: z.number(),
      totalTokens: z.number(),
      costUsd: z.number(),
      unmeasured: z.boolean(),
    })
  ),
  perModel: z.array(
    z.object({
      model: z.string(),
      voterCount: z.number(),
      inputTokens: z.number(),
      outputTokens: z.number(),
      totalTokens: z.number(),
      costUsd: z.number(),
    })
  ),
});

/**
 * A voter's cost is measured iff a cost was computable for it (`costUsd`
 * present — a genuinely free model arrives as `costUsd: 0`, still measured).
 * Token counts alone do NOT make a voter cost-measured (#4165): an unpriced
 * model's tokens are kept in the consumption totals, but its unknown cost must
 * surface as UNMEASURED — a measured $0 would silently understate spend.
 */
function isMeasured(v: VoterCostInput): boolean {
  return v.costUsd !== undefined;
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
  // supplied cost (absence ⇒ unmeasured, recorded as a placeholder 0 — a free
  // model arrives as an explicit costUsd: 0 and stays measured, #4165).
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
 * every cost (tokens kept); `api` mode uses the supplied `costUsd`. Voters with
 * no computable cost (no usage report, or an unpriced model, #4165) are counted
 * in `unmeasuredVoters` and contribute cost zeros that are explicitly NOT a
 * measured $0 (see module doc / `unmeasured` flag).
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
