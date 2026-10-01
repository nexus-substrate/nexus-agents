/**
 * Where a seat's result is built from its attempts (#6821).
 *
 * {@link buildLlmVoteResult} puts the answering completion's usage and the
 * usage of every settled attempt on the seat. A seat's result is then rebuilt
 * at three points — the retry loop's error result, the cross-CLI fallback
 * (#3587) and the per-role retry pass (#5578). Each used to drop the earlier
 * result's billed completions; {@link carryAttemptUsage} folds them forward.
 * `buildLlmVoteResult` moved here from `voter-agents.ts`, which is at its
 * line cap.
 *
 * @module cli/voter-attempt-usage
 */

import { mergeAttemptUsage, type AttemptUsage } from '../observability/attempt-usage.js';
import type { IModelAdapter } from '../core/index.js';
import { isGatewayModelAdapter } from '../adapters/openai-compat-adapter.js';
import type { AgentVoteResult, VoterRole } from './vote-types.js';
import type { VoteOutcome } from './voter-execution.js';
import { inFamilyFallback } from './voter-fallback.js';

/**
 * `onto`, with `from`'s attempt usage added to its own. Unchanged when
 * neither carried any: the empty case stays absent, never a zero record.
 */
export function carryAttemptUsage(
  from: { readonly attemptUsage?: AttemptUsage | undefined } | undefined,
  onto: AgentVoteResult
): AgentVoteResult {
  const attemptUsage = mergeAttemptUsage(from?.attemptUsage, onto.attemptUsage);
  return attemptUsage === undefined ? onto : { ...onto, attemptUsage };
}

/**
 * Builds the successful LLM `AgentVoteResult`, propagating the adapter-reported
 * per-call tokens so the decision-cost rollup attributes this voter as MEASURED,
 * not unmeasured (#3910). Only attaches a token field when the adapter actually
 * reported it — an absent count stays absent (⇒ unmeasured), never a fabricated 0.
 */
export function buildLlmVoteResult(
  role: VoterRole,
  { vote, usage, fallbackFrom, servedModel, attemptUsage }: VoteOutcome,
  adapter: IModelAdapter,
  processingTimeMs: number
): AgentVoteResult {
  return {
    role,
    vote,
    processingTimeMs,
    source: 'llm',
    cli: adapter.providerId,
    model: adapter.modelId,
    // #6660: the model that answered, as the adapter reported it — the
    // outcome row names and prices this one, not the requested `model`.
    ...(servedModel !== undefined ? { servedModel } : {}),
    // #4392 step 4: which gateway arm served the seat, so the cost rollup
    // prices it by the arm's declaration and not the model id's list price.
    ...(isGatewayModelAdapter(adapter) ? { gatewayArm: adapter.gatewayArm } : {}),
    // #6115: the CLI answered on another model of its family (#6120) — a
    // capacity fallback by construction, disclosed on the seat.
    ...(fallbackFrom !== undefined
      ? { fallback: inFamilyFallback(adapter.providerId, fallbackFrom) }
      : {}),
    // #4472: surface the voter's choice at the result level, where the tally
    // and the record read it. Absent when no options were declared or the
    // selection matched none of them.
    ...(vote.selectedOption !== undefined ? { selectedOption: vote.selectedOption } : {}),
    ...(usage.inputTokens !== undefined ? { inputTokens: usage.inputTokens } : {}),
    ...(usage.outputTokens !== undefined ? { outputTokens: usage.outputTokens } : {}),
    ...(usage.cachedInputTokens !== undefined
      ? { cachedInputTokens: usage.cachedInputTokens }
      : {}),
    ...(usage.cacheCreationInputTokens !== undefined
      ? { cacheCreationInputTokens: usage.cacheCreationInputTokens }
      : {}),
    // #6821: every settled completion, not only the one answering above.
    attemptUsage,
  };
}
