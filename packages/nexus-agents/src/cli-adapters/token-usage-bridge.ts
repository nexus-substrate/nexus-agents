/**
 * Per-call token-usage conversions between the two adapter layers (#4440).
 *
 * Two per-call `TokenUsage` types exist on purpose:
 *
 * - `cli-adapters/types-core.ts` — what the CLI parsers emit. `totalTokens`
 *   is optional because not every CLI prints one.
 * - `core/types/model.ts` — the adapter response contract. `totalTokens` is
 *   required, and it carries `inputTokensMeasured` (#4835), which only a
 *   direct-API streaming producer sets.
 *
 * Neither field set is a subset of the other, and both are published, so
 * neither can be an alias of the other without a breaking change. They meet
 * in exactly two places — the CLI→model bridge and the model→CLI bridge — and
 * before this module each bridge copied fields by hand, which is how the
 * cache fields were dropped once (#4439) and `inputTokensMeasured` was still
 * being dropped on the way back. Both crossings now go through here.
 *
 * The empty case: an unreported field stays ABSENT. The readers on both sides
 * (`readTokenCount` → `VoteUsage`, the decision-cost rollup) treat absence as
 * "not measured" and `0` as a measurement, so filling in `0` would fabricate a
 * measurement — the exact defect #4439 removed. The one derived value is
 * `totalTokens` on the way INTO the contract, where the field is required:
 * the CLI-side field is documented as `input + output`, so the sum is the
 * definition, not an invented count.
 *
 * @module cli-adapters/token-usage-bridge
 */

import type { TokenUsage as ModelTokenUsage } from '../core/types/model.js';
import type { TokenUsage as CliTokenUsage } from './types-core.js';

/**
 * CLI parser output → adapter response contract.
 *
 * Carries every field the contract has. `totalTokens` is derived as
 * `inputTokens + outputTokens` only when the CLI reported none; a reported
 * total wins even when it differs from the sum, because a vendor total can
 * cover tokens neither counter does.
 */
export function toModelTokenUsage(usage: CliTokenUsage): ModelTokenUsage {
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens ?? usage.inputTokens + usage.outputTokens,
    ...carryOptionalFields(usage),
  };
}

/**
 * Adapter response contract → CLI response.
 *
 * Carries every field the CLI-side type has, `inputTokensMeasured` included:
 * a `false` flag marks `inputTokens` as a placeholder, and dropping it would
 * hand the CLI side a measured zero.
 */
export function toCliTokenUsage(usage: ModelTokenUsage): CliTokenUsage {
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
    ...carryOptionalFields(usage),
  };
}

/**
 * The optional fields both types share, spelled the same on each side. Each
 * key is copied only when present so an unreported value stays absent under
 * `exactOptionalPropertyTypes` rather than becoming an explicit `undefined`.
 */
function carryOptionalFields(
  usage: Pick<
    ModelTokenUsage,
    'cachedInputTokens' | 'cacheCreationInputTokens' | 'inputTokensMeasured'
  >
): Pick<CliTokenUsage, 'cachedInputTokens' | 'cacheCreationInputTokens' | 'inputTokensMeasured'> {
  return {
    ...(usage.cachedInputTokens !== undefined
      ? { cachedInputTokens: usage.cachedInputTokens }
      : {}),
    ...(usage.cacheCreationInputTokens !== undefined
      ? { cacheCreationInputTokens: usage.cacheCreationInputTokens }
      : {}),
    ...(usage.inputTokensMeasured !== undefined
      ? { inputTokensMeasured: usage.inputTokensMeasured }
      : {}),
  };
}
