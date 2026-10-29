import type { Result } from '../../core/index.js';
import { createLogger, getTimeProvider } from '../../core/index.js';
import type { GraphExecuteOptions, HookError } from './graph-types.js';

const logger = createLogger({ component: 'GraphHookDeadline' });
const MAX_TIMER_DELAY_MS = 2_147_483_647;

/** Schedule a timeout without passing Node's signed 32-bit timer limit. */
export function scheduleDeadlineTimer(timeoutMs: number, onTimeout: () => void): () => void {
  let remainingMs = timeoutMs;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancelled = false;

  const scheduleNextChunk = (): void => {
    if (cancelled) return;
    const delayMs = Math.min(MAX_TIMER_DELAY_MS, Math.max(1, Math.ceil(remainingMs)));
    remainingMs -= delayMs;
    timer = setTimeout(() => {
      timer = undefined;
      if (cancelled) return;
      if (remainingMs <= 0) onTimeout();
      else scheduleNextChunk();
    }, delayMs);
  };

  scheduleNextChunk();
  return () => {
    cancelled = true;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
}

export class GraphTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GraphTimeoutError';
  }
}

export function graphTimeoutError(message: string): GraphTimeoutError {
  return new GraphTimeoutError(message);
}

export function isGraphTimeoutAbort(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true && signal.reason instanceof GraphTimeoutError;
}

export interface LateHookSettlementDetails {
  readonly nodeId: string;
  readonly hookName: string;
  readonly hookPhase: 'precondition' | 'verify';
  readonly outcome: 'resolved' | 'rejected';
  readonly durationMs: number;
  readonly error?: string | undefined;
  readonly stepNumber: number;
}

export function emitLateHookSettlement(
  options: GraphExecuteOptions | undefined,
  details: LateHookSettlementDetails
): void {
  const emit = options?.onEvent;
  if (emit === undefined) return;
  try {
    const { error, ...event } = details;
    emit({
      type: 'hook_late_settlement',
      ...event,
      ...(error === undefined ? {} : { error }),
      timestamp: getTimeProvider().now(),
    });
  } catch (error: unknown) {
    logger.warn('Late hook settlement event listener failed', {
      nodeId: details.nodeId,
      hookName: details.hookName,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export interface HookDeadlineContext {
  readonly nodeId: string;
  readonly hookName: string;
  readonly hookPhase: 'precondition' | 'verify';
  readonly stepNumber: number;
  readonly options?: GraphExecuteOptions | undefined;
  readonly onLateSettlement: (
    outcome: 'resolved' | 'rejected',
    durationMs: number,
    error?: string
  ) => void;
}

type CallbackOutcome =
  | { readonly kind: 'resolved'; readonly result: Result<void, HookError> }
  | { readonly kind: 'rejected'; readonly error: unknown };

export type HookRunOutcome =
  | { readonly kind: 'settled'; readonly callback: CallbackOutcome; readonly durationMs: number }
  | {
      readonly kind: 'aborted';
      readonly failureKind: 'timeout' | 'abort';
      readonly durationMs: number;
      readonly observeLateSettlement?: () => void;
    };

interface HookSignal {
  readonly signal: AbortSignal;
  readonly controller: AbortController;
  readonly remainingMs: number | undefined;
}

function createHookSignal(options: GraphExecuteOptions | undefined): HookSignal {
  const controller = new AbortController();
  const signal =
    options?.signal === undefined
      ? controller.signal
      : AbortSignal.any([options.signal, controller.signal]);
  const remainingMs =
    options?.deadlineAt === undefined ? undefined : options.deadlineAt - getTimeProvider().now();
  return { signal, controller, remainingMs };
}

function toCallbackOutcome(result: Result<void, HookError>): CallbackOutcome {
  return { kind: 'resolved', result };
}

function toRejectedOutcome(error: unknown): CallbackOutcome {
  return { kind: 'rejected', error };
}

function lateError(outcome: CallbackOutcome): string | undefined {
  if (outcome.kind === 'rejected') {
    return outcome.error instanceof Error ? outcome.error.message : String(outcome.error);
  }
  return outcome.result.ok ? undefined : outcome.result.error.message;
}

async function callbackOrAbort(
  callback: Promise<CallbackOutcome>,
  signal: AbortSignal
): Promise<CallbackOutcome | { readonly kind: 'aborted' }> {
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<{ readonly kind: 'aborted' }>((resolve) => {
    if (signal.aborted) resolve({ kind: 'aborted' });
    else {
      onAbort = () => {
        resolve({ kind: 'aborted' });
      };
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
  try {
    return await Promise.race([callback, aborted]);
  } finally {
    if (onAbort !== undefined) signal.removeEventListener('abort', onAbort);
  }
}

function deadlineElapsed(context: HookDeadlineContext, signal: AbortSignal): boolean {
  return (
    isGraphTimeoutAbort(signal) ||
    (context.options?.deadlineAt !== undefined &&
      getTimeProvider().now() >= context.options.deadlineAt)
  );
}

function observeLateSettlement(
  context: HookDeadlineContext,
  callback: Promise<CallbackOutcome>,
  startTime: number
): () => void {
  return () => {
    void callback.then((late) => {
      context.onLateSettlement(late.kind, getTimeProvider().now() - startTime, lateError(late));
    });
  };
}

function abortedHookOutcome(
  context: HookDeadlineContext,
  signal: AbortSignal,
  startTime: number,
  callback?: Promise<CallbackOutcome>
): HookRunOutcome {
  const timedOut = deadlineElapsed(context, signal);
  return {
    kind: 'aborted',
    failureKind: timedOut ? 'timeout' : 'abort',
    durationMs: getTimeProvider().now() - startTime,
    ...(callback === undefined
      ? {}
      : { observeLateSettlement: observeLateSettlement(context, callback, startTime) }),
  };
}

export async function runHookUntilDeadline(
  context: HookDeadlineContext,
  run: (signal: AbortSignal) => Promise<Result<void, HookError>>,
  startTime: number
): Promise<HookRunOutcome> {
  const { signal, controller, remainingMs } = createHookSignal(context.options);
  if (remainingMs !== undefined && remainingMs <= 0) {
    return abortedHookOutcome(context, signal, startTime);
  }
  if (signal.aborted) return abortedHookOutcome(context, signal, startTime);

  const cancelTimer =
    remainingMs === undefined || !Number.isFinite(remainingMs)
      ? undefined
      : scheduleDeadlineTimer(remainingMs, () => {
          controller.abort(
            graphTimeoutError(`Graph execution timed out during ${context.hookPhase} hook`)
          );
        });
  const callback = Promise.resolve()
    .then(() => {
      if (signal.aborted) throw signal.reason;
      return run(signal);
    })
    .then(toCallbackOutcome, toRejectedOutcome);
  const outcome = await callbackOrAbort(callback, signal);
  cancelTimer?.();

  if (outcome.kind === 'aborted' || deadlineElapsed(context, signal)) {
    return abortedHookOutcome(context, signal, startTime, callback);
  }
  return {
    kind: 'settled',
    callback: outcome,
    durationMs: getTimeProvider().now() - startTime,
  };
}
