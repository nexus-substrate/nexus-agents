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

// `core/price-basis` is a dependency-free leaf module (zod only), so importing
// it at RUNTIME here is safe: the cycle this import used to close — via
// `core/trace-pricing` → model registry → weather-report → decision-cost-store
// → this module, which left the schema undefined at evaluation time — does not
// exist through the leaf. It previously came in type-only alongside a
// hand-written zod mirror of the union; that mirror's `satisfies` guard could
// not catch a member being ADDED, and an unrecognised value makes JsonlStore
// reject the whole decision record. One definition, so nothing can drift.
import { PriceBasisSchema, type PriceBasis } from '../core/price-basis.js';

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
  /** Input tokens read from an existing prompt cache, when reported (#4435). */
  readonly cachedInputTokens?: number | undefined;
  /** Input tokens spent writing the cache, when reported (#4435). */
  readonly cacheCreationInputTokens?: number | undefined;
  /**
   * API-mode cost in USD for the voter call, when computable. Absent ⇒ the
   * voter is unmeasured (see module doc). Present ⇒ used as-is in `api` mode,
   * zeroed in `plan` mode.
   *
   * A cost alone no longer certifies a measurement: a voter that reported
   * neither token count is unmeasured regardless of cost (#4430).
   */
  readonly costUsd?: number | undefined;
  /**
   * What kind of rate `costUsd` rests on (#4406). A cost the registry chain
   * resolved arrives as `'list'` — an assumed published rate, so an estimate
   * rather than a figure verified against the operator's bill. It is NOT a
   * guarantee the number is a vendor list price: see {@link PriceBasis} for the
   * overlay and fuzzy-match paths that report something else under that label.
   *
   * Orthogonal to `unmeasured`: that flag is about evidence of CONSUMPTION
   * (were tokens reported?), this is about the PRICE the money figure was
   * computed from. A voter can be unmeasured and still have a list-derived
   * cost, and it still reaches `totalCostUsd`.
   *
   * Absent means the caller never looked a price up — NOT `'unknown'`, which
   * is the positive claim that the chain resolved no price for the model.
   */
  readonly priceBasis?: PriceBasis | undefined;
}

/** Per-voter line in the decision rollup. */
export interface VoterCostBreakdown {
  readonly role: string;
  readonly model: string;
  /** Uncached input tokens. See {@link cachedInputTokens} for the rest. */
  readonly inputTokens: number;
  readonly outputTokens: number;
  /**
   * Uncached input + output.
   *
   * Deliberately EXCLUDES the cache figures (#4435). Redefining this field to
   * include them is a semantics change for every existing consumer and every
   * record already written, so it is tracked separately rather than slipped in
   * — read it alongside `cachedInputTokens` for true consumption.
   */
  readonly totalTokens: number;
  /**
   * Input tokens read from an existing prompt cache, when reported. Omitted
   * when the adapter said nothing — absent is not zero (#4439).
   */
  readonly cachedInputTokens?: number | undefined;
  /** Input tokens spent writing the cache, when reported. */
  readonly cacheCreationInputTokens?: number | undefined;
  /** Effective cost after billing-mode application (0 in plan mode). */
  readonly costUsd: number;
  /**
   * True when no cost was computable for this voter — no usage report at all,
   * or a token-reporting call on an unpriced model (#4165). Its cost zero is a
   * placeholder, not a measured $0.
   */
  readonly unmeasured: boolean;
  /**
   * What kind of rate `costUsd` rests on, when the caller stated one (#4406).
   * Omitted when it did not — absent is not a claim, the same discipline the
   * cache counters follow (#4439).
   *
   * Also omitted in `plan` mode, where `costUsd` was forced to 0: that zero
   * rests on no price, so attributing it to one would be a fiction. Same rule
   * as {@link DecisionCostSummary.priceBasis}, applied at the row level.
   */
  readonly priceBasis?: PriceBasis | undefined;
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
  /** Voters with a computable cost AND at least one reported token count. */
  readonly measuredVoters: number;
  /**
   * Voters whose cost could not be computed — an unpriced model (#4165) — or
   * which reported no token counts at all (#4430). Counted, not zeroed-as-fact.
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
  /**
   * What kind of rate `totalCostUsd` rests on (#4406) — `'list'` if ANY voter
   * that contributed a price used a list rate, `'unknown'` if every voter that
   * stated a basis had no price at all.
   *
   * OMITTED when no voter stated a basis (nothing was claimed) and in `plan`
   * mode, where the recorded $0 is pre-covered by a subscription and rests on
   * no price at all — `billingMode` already explains that figure, and labelling
   * it `'list'` would credit a rate that produced nothing.
   */
  readonly priceBasis?: PriceBasis | undefined;
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
  priceBasis: PriceBasisSchema.optional(),
  perVoter: z.array(
    z.object({
      role: z.string(),
      model: z.string(),
      inputTokens: z.number(),
      outputTokens: z.number(),
      totalTokens: z.number(),
      cachedInputTokens: z.number().optional(),
      cacheCreationInputTokens: z.number().optional(),
      costUsd: z.number(),
      unmeasured: z.boolean(),
      priceBasis: PriceBasisSchema.optional(),
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
 * A voter is measured iff BOTH hold:
 *
 *  - a cost was computable (`costUsd` present — a genuinely free model arrives
 *    as `costUsd: 0`, still measured). Token counts alone do NOT make a voter
 *    cost-measured (#4165): an unpriced model's tokens stay in the consumption
 *    totals, but its unknown cost must surface as UNMEASURED, because a
 *    measured $0 would silently understate spend; and
 *  - at least one token counter was reported (#4430). Cost alone certified
 *    `0/0` token lines as measurements, since the breakdown coerces absent
 *    counts to 0. An explicit 0 is evidence; absent is not, and collapsing the
 *    two makes the consumption totals a floor that claims to be exact.
 */
function isMeasured(v: VoterCostInput): boolean {
  // Cost alone is not evidence (#4430). A voter whose adapter reported no usage
  // still gets `inputTokens ?? 0` below, so keying only on cost certified 0/0
  // as a measurement — observed live on every gpt-5.5 voter across three
  // panels, each returning full reasoning that counted toward the verdict.
  //
  // An explicit 0 IS a measurement and stays measured; absent is not. Either
  // counter suffices, because some adapters report only completion tokens and
  // demanding both would newly discard voters that were previously counted.
  const reportedTokens = v.inputTokens !== undefined || v.outputTokens !== undefined;
  return v.costUsd !== undefined && reportedTokens;
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
 * Plan mode zeroes cost (tokens kept) and, because that zero rests on no price,
 * drops the stated price basis with it (#4406). Unmeasured voters surface zeros
 * flagged as placeholders — including the TOKEN zeros, which previously passed
 * as a measurement whenever a cost happened to be present (#4430).
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
    ...(v.cachedInputTokens !== undefined ? { cachedInputTokens: v.cachedInputTokens } : {}),
    ...(v.cacheCreationInputTokens !== undefined
      ? { cacheCreationInputTokens: v.cacheCreationInputTokens }
      : {}),
    costUsd,
    unmeasured: !measured,
    // Plan mode forced `costUsd` to 0, so this row's money figure rests on no
    // price — the same reasoning the decision total applies (#4406 review).
    // Echoing 'list' here would attribute a $0 to a rate that produced nothing,
    // and since `plan` is the DEFAULT billing mode that fiction would be on
    // most persisted rows. `billingMode` already explains the zero.
    ...(isPlan ? {} : basisField(v.priceBasis)),
  };
}

/**
 * The basis the decision TOTAL rests on (#4406), or undefined when the record
 * should stay silent.
 *
 * Silent when no voter stated a basis: emitting `'unknown'` there would assert
 * that no price existed for anyone, when in fact nobody looked. `'list'` wins
 * over `'unknown'` because the total is a sum — one list-derived contribution
 * makes the whole figure an estimate, and that is the caveat a reader needs.
 */
function decisionPriceBasis(voters: readonly VoterCostInput[]): PriceBasis | undefined {
  const stated = voters.filter((v) => v.priceBasis !== undefined);
  if (stated.length === 0) return undefined;
  return stated.some((v) => v.priceBasis === 'list') ? 'list' : 'unknown';
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
    // Plan mode's $0 is pre-covered spend, not a priced figure — no basis to
    // report, so the field stays off rather than crediting a rate.
    ...(isPlan ? {} : basisField(decisionPriceBasis(voters))),
    perVoter,
    perModel,
  };
}

/** Spread-friendly optional wrapper so an absent basis stays absent, not `undefined`. */
function basisField(basis: PriceBasis | undefined): { priceBasis?: PriceBasis } {
  return basis === undefined ? {} : { priceBasis: basis };
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
