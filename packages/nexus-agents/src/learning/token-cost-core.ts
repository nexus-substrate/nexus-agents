/**
 * The one place token counts become USD (#5122, epic #5121).
 *
 * An audit found ELEVEN implementations of this arithmetic across the tree,
 * disagreeing by **3.3x on identical usage**: 1M input + 1M output on
 * `claude-sonnet` gave $18.00 from six of them, $20.00 from three, and $6.00
 * from one. They also disagreed on rounding — one input token at $2.50/1M
 * returned `0.000003` from the usage-log path and `0.0000025` from the trace
 * path, off the same registry rate.
 *
 * The panel that ratified this shape (6/6 on the option) separated two causes
 * that need opposite treatment:
 *
 *  - **Arithmetic drift** — per-1M vs per-1K, blended vs split, rounded vs not.
 *    Pure duplication. It lives here, once.
 *  - **Unpriced policy** — return `0` with `priced:false`, return `undefined`,
 *    or substitute a conservative non-$0 rate. These are *deliberate and
 *    different per call site*, so they stay in named wrappers where a reader can
 *    see which one they get. A policy enum on one function was explicitly
 *    rejected: it makes picking the wrong policy a one-character mistake that
 *    typechecks and ships green, which is how #4165/#4196 happened.
 *
 * WHAT THIS MODULE DOES NOT DO, deliberately:
 *
 *  - **No registry lookup.** Rates are injected. That is what lets the routing
 *    profile (`topsis-helpers`) and the operator-configured rate
 *    (`orchestration-observer-helpers`) share this arithmetic instead of
 *    reimplementing it.
 *  - **No rounding.** The usage log rounds to micro-USD so its JSONL does not
 *    drift into floating-point noise; that is a *ledger* requirement, not a
 *    property of cost. Rounding here would impose it on every consumer and bake
 *    in the upward bias on sub-micro calls.
 *  - **No unpriced policy.** A caller with no rate must not reach this function.
 *
 * @module learning/token-cost-core
 */

/**
 * Token counts for one call, split by how each component bills.
 *
 * `cacheRead` and `cacheWrite` are separate fields rather than folded into
 * `input` because vendors bill them at genuinely different rates — a cache read
 * at a discount, a cache write at a premium — and because providers report them
 * as counts SEPARATE from `input_tokens`, so adding them to `input` would double
 * count. Both optional: absent means the provider reported none, which is
 * different from zero of them (#5170).
 */
export interface TokenCounts {
  readonly input: number;
  readonly output: number;
  /** Tokens served from cache, billed at a discount when a rate is known. */
  readonly cacheRead?: number | undefined;
  /** Tokens written to cache, billed at a premium when a rate is known. */
  readonly cacheWrite?: number | undefined;
  /**
   * Tokens whose input/output split is UNKNOWN, priced at a single blended
   * rate. Lower fidelity than the split fields by construction — output
   * typically bills at several times input, so a blended figure is only as good
   * as the assumed mix.
   *
   * Exists because two in-tree paths genuinely have no split to offer: an
   * e2e harness that only sums totals, and a per-model rate table that stores
   * one number. Naming the shape is better than folding those totals into
   * `input`, which would be arithmetically exact and semantically false —
   * a reader could no longer tell a real input-only call from a blended guess.
   *
   * Prefer the split fields whenever the caller HAS the split. A caller that
   * holds `inputTokens` and `outputTokens` and passes `blended` anyway is
   * discarding fidelity it already paid for (see #5180).
   */
  readonly blended?: number | undefined;
}

/**
 * Per-million-token rates in USD.
 *
 * Cache rates are optional because the registry cannot yet supply them: the
 * internal `PricingSchema` carries only `inputPer1M`/`outputPer1M` (#5170).
 *
 * Upstream DOES publish both. The generator validates `cache_read` and
 * `cache_write` at `scripts/build-model-registry-types.ts:49-50`, then drops
 * them one step later where `toPricing` maps only input and output
 * (`scripts/build-model-registry-helpers.ts:192-198`), so
 * `model-registry.generated.json` carries neither.
 *
 * An earlier version of this comment cited `config/models-dev-client.ts` as the
 * fetch path. That module has zero non-test importers (#5200) and does not run;
 * citing it led to a wrong cost estimate on #5170. The generator above is the
 * live path.
 *
 * The signature takes cache rates from day one on the panel's binding condition
 * — consolidating onto an input/output-only shape would guarantee a second
 * sweeping refactor the moment those rates land.
 */
export interface TokenRates {
  readonly inputPer1M: number;
  readonly outputPer1M: number;
  readonly cacheReadPer1M?: number | undefined;
  readonly cacheWritePer1M?: number | undefined;
  /** Single rate for tokens with no known split. See {@link TokenCounts.blended}. */
  readonly blendedPer1M?: number | undefined;
}

/**
 * A cost and an honest account of what it covers.
 *
 * `unpricedComponents` is the load-bearing field. A cache-heavy call whose cache
 * rates are unknown yields a cost computed from input and output alone — a real
 * number that is nonetheless a LOWER BOUND, and one that today's callers present
 * as a finished total. Naming the gap is what stops a partial from reading as
 * complete; per this repo's rule, an instrument must be able to represent what
 * it did not measure.
 */
export interface TokenCostBreakdown {
  /** Cost in USD of the components that had a rate. Never rounded. */
  readonly costUsd: number;
  /**
   * Components the caller reported tokens for but supplied no rate for.
   * Empty means the cost covers every reported component.
   */
  readonly unpricedComponents: readonly (keyof TokenCounts)[];
  /** True when `unpricedComponents` is empty — the cost is a total, not a floor. */
  readonly complete: boolean;
}

/** USD for `tokens` at `perMillion`. */
function componentCost(tokens: number, perMillion: number): number {
  return (tokens * perMillion) / 1_000_000;
}

/**
 * Convert token counts to USD at the supplied rates.
 *
 * Pure: no registry, no rounding, no fallback. A component with tokens but no
 * rate contributes nothing to `costUsd` and is named in `unpricedComponents`,
 * so a caller can tell a complete total from a floor.
 *
 * @example
 * // 1M in + 1M out on claude-sonnet's 3/15 rates — the audit's golden value.
 * computeTokenCost({ input: 1e6, output: 1e6 }, { inputPer1M: 3, outputPer1M: 15 })
 * // → { costUsd: 18, unpricedComponents: [], complete: true }
 */
export function computeTokenCost(tokens: TokenCounts, rates: TokenRates): TokenCostBreakdown {
  const unpriced: (keyof TokenCounts)[] = [];
  let costUsd = componentCost(tokens.input, rates.inputPer1M);
  costUsd += componentCost(tokens.output, rates.outputPer1M);

  // A component is unpriced only when tokens were actually reported for it.
  // Zero cache-read tokens with no cache-read rate is not a measurement gap —
  // there was nothing to price. Naming it anyway would make `complete` false
  // for every ordinary uncached call and render the flag useless.
  if (tokens.cacheRead !== undefined && tokens.cacheRead > 0) {
    if (rates.cacheReadPer1M === undefined) unpriced.push('cacheRead');
    else costUsd += componentCost(tokens.cacheRead, rates.cacheReadPer1M);
  }
  if (tokens.cacheWrite !== undefined && tokens.cacheWrite > 0) {
    if (rates.cacheWritePer1M === undefined) unpriced.push('cacheWrite');
    else costUsd += componentCost(tokens.cacheWrite, rates.cacheWritePer1M);
  }
  if (tokens.blended !== undefined && tokens.blended > 0) {
    if (rates.blendedPer1M === undefined) unpriced.push('blended');
    else costUsd += componentCost(tokens.blended, rates.blendedPer1M);
  }

  return { costUsd, unpricedComponents: unpriced, complete: unpriced.length === 0 };
}

/**
 * Round a USD figure to whole micro-USD.
 *
 * Ledger-only. The usage log needs it so its JSONL does not accumulate
 * floating-point noise across many small calls; nothing else should, and it is
 * NOT applied inside {@link computeTokenCost}. It rounds half away from zero,
 * so a sub-micro call biases upward — pinned by test so the bias is a recorded
 * decision rather than an artefact.
 */
export function roundToMicroUsd(costUsd: number): number {
  return Math.round(costUsd * 1_000_000) / 1_000_000;
}
