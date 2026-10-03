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

import {
  carryVoterAttemptTelemetry,
  preserveVoterAttemptTelemetry,
} from './voter-attempt-events.js';
import type { AttemptTelemetry } from '../observability/attempt-usage.js';
import {
  mergeAttemptUsage,
  foldCompletionUsage,
  type AttemptUsage,
} from '../observability/attempt-usage.js';
import type { IModelAdapter, CompletionResponse } from '../core/index.js';
import { isGatewayModelAdapter } from '../adapters/openai-compat-adapter.js';
import type { AgentVoteResult, VoterRole } from './vote-types.js';
import type { VoteOutcome, VoteUsage } from './voter-execution.js';
import { inFamilyFallback } from './voter-fallback.js';

/**
 * `onto`, with `from`'s attempt usage added to its own. Unchanged when
 * neither carried any: the empty case stays absent, never a zero record.
 */
export function carryAttemptUsage(
  from:
    | {
        readonly attemptUsage?: AttemptUsage | undefined;
        readonly attemptTelemetry?: AttemptTelemetry | undefined;
      }
    | undefined,
  onto: AgentVoteResult
): AgentVoteResult {
  const attemptUsage = mergeAttemptUsage(from?.attemptUsage, onto.attemptUsage);
  const decorated =
    attemptUsage === undefined
      ? onto
      : preserveVoterAttemptTelemetry(onto, { ...onto, attemptUsage });
  return carryVoterAttemptTelemetry(from, decorated);
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

/** Read a usage token count when the adapter actually reported a number (#3910). */
function readTokenCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** The answering response's legacy counters; attempt events are captured separately. */
export function readVoteUsage(response: CompletionResponse): VoteUsage {
  // #3910: capture the adapter-reported per-call usage so it can ride up into
  // the AgentVoteResult and feed the decision-cost rollup as MEASURED. Cast
  // through a loose shape: the type guarantees `usage`, but a real adapter (or a
  // partial response) may omit the counts — read each defensively so a
  // non-reporting call stays unmeasured rather than throwing or fabricating 0.
  const reported = response.usage as unknown as
    | {
        inputTokens?: unknown;
        outputTokens?: unknown;
        cachedInputTokens?: unknown;
        cacheCreationInputTokens?: unknown;
      }
    | undefined;
  const usage: VoteUsage = {
    inputTokens: readTokenCount(reported?.inputTokens),
    outputTokens: readTokenCount(reported?.outputTokens),
    // #4435: an `inputTokens: 2` next to 3,980 cached tokens tells a very
    // different story than `inputTokens: 2` alone.
    cachedInputTokens: readTokenCount(reported?.cachedInputTokens),
    cacheCreationInputTokens: readTokenCount(reported?.cacheCreationInputTokens),
  };
  return usage;
}

/** Fold an attempt's reported usage, when the transport returned a response. */
export function foldAttempt(
  acc: AttemptUsage | undefined,
  usage: VoteUsage | undefined
): AttemptUsage | undefined {
  return usage === undefined ? acc : foldCompletionUsage(acc, usage);
}
