/**
 * Per-seat fallback disclosure (#6115).
 *
 * Three consecutive 7-seat ratification panels on 2026-09-13 answered every
 * seat on one gemini model: the three claude seats fell over (#3587) during a
 * claude capacity window, the two codex seats errored and landed on the same
 * sticky default, and the two gemini seats were native. Quorum was real,
 * independence was not, and nothing in the live result said so — the assigned
 * CLI was not recoverable and the fallover reason was only in a log line.
 *
 * This module stamps the assignment on every seat and, when a seat answered
 * elsewhere, the class of error that moved it. Classification reuses the
 * predicates the adapter layer already classifies by; it adds no taxonomy of
 * its own.
 *
 * @module cli/voter-fallback
 */

import type { IModelAdapter } from '../core/index.js';
import { isDurableCapacityText, isRateLimitText } from '../adapters/rate-limit-detector.js';
import { classifyExtractedError } from '../cli-adapters/cli-error-envelope.js';
import { isTimeoutText } from '../cli-adapters/cli-error-helpers.js';
import { UNRESOLVED_MODEL_ID } from '../config/model-equivalence.js';
import type { AgentVoteResult, FallbackReason, SeatFallback } from './vote-types.js';
import { UNVERIFIABLE_STDERR_RE } from './voter-unverifiable.js';

/**
 * Strip the `cli-` prefix `CliToModelAdapter` and a pinned `ResilientAdapter`
 * put on `providerId`, so a seat's assignment reads `claude`, not `cli-claude`.
 * Any other id (a gateway provider, `resilient-proxy`) is returned unchanged.
 */
export function bareCliName(id: string): string {
  return id.startsWith('cli-') ? id.slice('cli-'.length) : id;
}

/**
 * Classify the error that moved a seat off its assigned adapter.
 *
 * Order matters and mirrors the adapter layer: a durable capacity cap is
 * checked before the transient rate-limit list because `RATE_LIMIT_PATTERNS`
 * is the union of both (#5359), and the #6094 sandbox signature before the
 * timeout words because a sandbox failure line can mention one.
 */
export function classifyFallbackReason(message: string): FallbackReason {
  if (isDurableCapacityText(message)) return 'capacity';
  if (isRateLimitText(message)) return 'rate-limit';
  if (classifyExtractedError(message, 'unknown').code === 'NOT_AUTHENTICATED') return 'auth';
  if (UNVERIFIABLE_STDERR_RE.test(message)) return 'sandbox';
  if (isTimeoutText(message)) return 'timeout';
  return 'unknown';
}

/** The assigned adapter's model when it had detected one; the placeholder is not disclosed. */
function detectedModel(adapter: IModelAdapter): string | undefined {
  // `unknown`, not `string`: the interface promises a string, but an adapter
  // constructed without one reports undefined at runtime (#4983).
  const id: unknown = adapter.modelId;
  return typeof id === 'string' && id !== '' && id !== UNRESOLVED_MODEL_ID ? id : undefined;
}

/**
 * The assignment key as a bare CLI name, or undefined when the adapter had
 * none. `unknown` for the same reason as {@link detectedModel}: `adapterCliKey`
 * is typed string but reads `name ?? providerId`, and a bare test adapter has
 * neither.
 */
function assignedCliOf(key: unknown): string | undefined {
  return typeof key === 'string' && key !== '' ? bareCliName(key) : undefined;
}

/**
 * The cross-CLI fallover disclosure for a seat assigned to `assigned` that
 * errored with `error` and was re-run on the fallback (#3587). A seat whose
 * adapter carried no id is disclosed as `unknown` — the fallover still
 * happened and the reason is still measured.
 */
export function crossCliFallback(
  assigned: IModelAdapter,
  assignedKey: string,
  error: string
): SeatFallback {
  const fromModel = detectedModel(assigned);
  return {
    fromCli: assignedCliOf(assignedKey) ?? 'unknown',
    ...(fromModel !== undefined ? { fromModel } : {}),
    reason: classifyFallbackReason(error),
  };
}

/**
 * The in-family disclosure for a seat whose CLI answered on a different model
 * alias than requested (#6120): the claude adapter substitutes the next
 * registry alias after an out-of-credits envelope, which is a capacity class
 * by construction — it is the only condition that triggers the substitution.
 */
export function inFamilyFallback(cli: string, fromModel: string): SeatFallback {
  return { fromCli: bareCliName(cli), fromModel, reason: 'capacity' };
}

/**
 * Stamp the seat's assignment on a result, keeping any fallback the seat
 * already carries (the in-family one is set where the answer is built).
 */
export function withAssignedCli(result: AgentVoteResult, assignedKey: string): AgentVoteResult {
  const assignedCli = assignedCliOf(assignedKey);
  return assignedCli === undefined ? result : { ...result, assignedCli };
}
