/**
 * One place to summarise token usage across contributors (#4743).
 *
 * `result-aggregator` and `session-helpers` computed this separately with
 * equivalent-but-duplicated expressions. They agreed by coincidence, and would
 * have diverged the moment either was corrected — which happened immediately:
 * the count needs `=== false` while the sum needs `!== false`, and only one
 * copy got that right.
 *
 * @module agents/collaboration/token-usage-summary
 */
import type { ResultMetadata } from '../../core/index.js';

/** Total measured tokens, plus how many contributors reported none. */
export interface TokenUsageSummary {
  readonly totalTokensUsed: number;
  readonly unmeasuredResults?: number;
}

/**
 * Sums measured usage and counts the contributors that reported none.
 *
 * The two predicates are deliberately different:
 *
 * - The SUM excludes `tokensMeasured === false`. Arithmetically a no-op today,
 *   since every producer that sets the flag false pairs it with `0`, but it
 *   keeps the sum honest if one ever reports a number it cannot vouch for.
 * - The COUNT includes only `=== false`. A contributor with no flag is a legacy
 *   producer — unknown, not known-unmeasured — and counting it would make the
 *   report over-claim.
 *
 * `unmeasuredResults` is omitted rather than reported as `0`, so absent means
 * "nothing known-unmeasured", matching the field's documented meaning.
 */
export function summarizeTokenUsage(contributors: readonly ResultMetadata[]): TokenUsageSummary {
  const totalTokensUsed = contributors
    .filter((m) => m.tokensMeasured !== false)
    .reduce((sum, m) => sum + m.tokensUsed, 0);
  const unmeasuredResults = contributors.filter((m) => m.tokensMeasured === false).length;

  return unmeasuredResults > 0 ? { totalTokensUsed, unmeasuredResults } : { totalTokensUsed };
}
