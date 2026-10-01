/**
 * Private call-scoped stdout evidence for late-settlement measurement (#6851).
 * The shared deadline reason survives AbortSignal.any; weak keys retain no calls
 * beyond their lifetimes. An absent observation means stdout was not measured.
 */
interface AbortObservation {
  readonly stdoutBytes: number;
  readonly sawFirstByte: boolean;
}

const observations = new WeakMap<object, AbortObservation>();

/** Preserve subprocess evidence only for a deadline; operator cancels are unrelated. */
export function recordAbortObservation(reason: unknown, observation: AbortObservation): void {
  if (!(reason instanceof DOMException) || reason.name !== 'TimeoutError') return;
  observations.set(reason, observation);
}

/** Missing reason or snapshot stays absent, including a subprocess that never started. */
export function getAbortObservation(reason: unknown): AbortObservation | undefined {
  if (!(reason instanceof DOMException) || reason.name !== 'TimeoutError') return undefined;
  return observations.get(reason);
}
