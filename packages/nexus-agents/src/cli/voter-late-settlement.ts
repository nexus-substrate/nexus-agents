/**
 * Lower-bound measurement of calls settling after the overall deadline (#6851).
 * Never-settling promises and process exit produce no event. Observing the raw
 * adapter call avoids raceAbort hiding its eventual response. No cost capture.
 */
import type { IModelAdapter, ILogger } from '../core/index.js';
import { getErrorMessage } from '../core/index.js';
import { isCallerAbortError } from '../cli-adapters/cli-error-helpers.js';
import { isCancelledSeatError } from './voter-cancel.js';
import { getAbortObservation } from '../adapters/abort-observation.js';
import { recordUsageEvent } from '../learning/usage-log.js';
import type { UsageMeasurement } from '../learning/usage-measurement.js';
import type { AgentVoteResult, VoterRole } from './vote-types.js';

type CompletionResult = Awaited<ReturnType<IModelAdapter['complete']>>;
type Settlement = AgentVoteResult | CompletionResult;

/** Retain only reported counts; an empty usage object is absence, never zero. */
function usageOf(value: object | undefined): UsageMeasurement['usage'] {
  const usage: NonNullable<UsageMeasurement['usage']> = {};
  const fields = [
    'inputTokens',
    'outputTokens',
    'totalTokens',
    'cachedInputTokens',
    'cacheCreationInputTokens',
  ] as const;
  for (const field of fields) {
    const count: unknown = value === undefined ? undefined : Reflect.get(value, field);
    if (typeof count === 'number' && Number.isFinite(count) && count >= 0) usage[field] = count;
  }
  return Object.keys(usage).length === 0 ? undefined : usage;
}

function settlementFields(
  result: Settlement | undefined
): Pick<UsageMeasurement, 'settled' | 'settledBy' | 'model' | 'usage'> {
  if (result === undefined) return { settled: 'error', settledBy: 'adapter' };
  if ('ok' in result) {
    return result.ok
      ? {
          settled: 'ok',
          settledBy: 'adapter',
          model: result.value.model,
          usage: usageOf(result.value.usage),
        }
      : { settled: 'error', settledBy: isCallerAbortError(result.error) ? 'abort' : 'adapter' };
  }
  // A voter function that settled with the seat-cancelled error ended because
  // the deadline aborted it, not because its adapter answered late.
  return {
    settled: result.source === 'error' ? 'error' : 'ok',
    settledBy:
      result.source === 'error' && isCancelledSeatError(result.error) ? 'abort' : 'adapter',
    model: result.model,
    usage: usageOf(result),
  };
}

interface PendingCall {
  promise: Promise<CompletionResult> | undefined;
  tracked: boolean;
}

const calls = new WeakMap<AbortSignal, PendingCall>();

/** Observe the original adapter promise before cancellation can mask its result. */
export function trackVoterCompletion(
  call: Promise<CompletionResult>,
  signal: AbortSignal | undefined
): Promise<CompletionResult> {
  const state = signal === undefined ? undefined : calls.get(signal);
  if (state === undefined) return call;
  state.tracked = true;
  state.promise = call;
  const clear = (): void => {
    if (state.promise === call) state.promise = undefined;
  };
  void call.then(clear, clear);
  return call;
}

/** `name` is not on IModelAdapter; only a string value may become the `cli` field. */
function adapterName(adapter: IModelAdapter): string | undefined {
  const name: unknown = Reflect.get(adapter, 'name');
  return typeof name === 'string' && name !== '' ? name : undefined;
}

function writeMeasurement(
  adapter: IModelAdapter,
  role: VoterRole,
  reason: DOMException,
  deadlineAt: number,
  result: Settlement | undefined
): void {
  const fields = settlementFields(result);
  const model = fields.model ?? adapter.modelId;
  recordUsageEvent({
    kind: 'measurement',
    event: 'voter_late_settlement',
    timestamp: new Date().toISOString(),
    role,
    cli: adapterName(adapter) ?? adapter.providerId,
    ...(model !== '' && model !== 'pending-detection' ? { model } : {}),
    msAfterDeadline: Math.max(0, Date.now() - deadlineAt),
    settled: fields.settled,
    settledBy: fields.settledBy,
    ...(fields.usage !== undefined ? { usage: fields.usage } : {}),
    ...getAbortObservation(reason),
  });
}

/** Register a call-scoped observer without replacing or mutating the adapter. */
export function observeLateVoter(
  adapter: IModelAdapter,
  role: VoterRole,
  logger: ILogger
): {
  readonly register: (signal: AbortSignal) => void;
  readonly afterDeadline: (
    vote: Promise<AgentVoteResult>,
    reason: DOMException,
    deadlineAt: number
  ) => void;
} {
  const state: PendingCall = { promise: undefined, tracked: false };
  return {
    register(signal): void {
      calls.set(signal, state);
    },
    afterDeadline(vote, reason, deadlineAt): void {
      // An instrumented seat in retry backoff has no call left to measure.
      if (state.tracked && state.promise === undefined) return;
      const write = (result: Settlement | undefined): void => {
        writeMeasurement(adapter, role, reason, deadlineAt, result);
      };
      // One continuation only: prefer the raw call when cancellation masks it.
      void (state.promise ?? vote)
        .then(write, () => {
          write(undefined);
        })
        .catch((error: unknown) => {
          try {
            logger.warn('Failed to persist late voter settlement measurement', {
              role,
              error: getErrorMessage(error),
            });
          } catch {
            // Even a failing logger must not reject into the process.
          }
        });
    },
  };
}
