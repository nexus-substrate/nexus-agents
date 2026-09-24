/**
 * Panel cancellation at the seat level (#6729).
 *
 * #5393 threaded `cancel_job`'s signal as far as the vote launcher, which
 * stopped LAUNCHING seats but let every seat already inside its adapter call
 * run to completion — minutes of quota after the cancel, with the job holding
 * its async concurrency slot until the slowest seat settled. These helpers
 * carry the same signal into each seat's adapter call.
 *
 * @module cli/voter-cancel
 */
import { raceAbort } from '../adapters/abort-utils.js';

/** The error a seat records when the panel was cancelled before or during its attempts. */
const SEAT_CANCELLED_MESSAGE = 'cancelled while this voter was in flight';

/**
 * Read through a function (#5393): a narrowed `signal?.aborted` check is
 * unsound across an `await`, where the whole point is that it can flip.
 */
export function isCancelled(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

/**
 * The signal a seat's adapter call runs under: its own deadline and, when the
 * panel has one, the caller's cancel. `AbortSignal.any` keeps the reason of
 * whichever source fired — a `TimeoutError` for the deadline, the caller's
 * reason for a cancel — so the adapter's classifier (#6709,
 * `isTimeoutAbortReason`) records a cancel as a cancel and a deadline as a
 * timeout.
 */
export function seatSignal(timeoutMs: number, cancel: AbortSignal | undefined): AbortSignal {
  const deadline = AbortSignal.timeout(timeoutMs);
  return cancel === undefined ? deadline : AbortSignal.any([deadline, cancel]);
}

/**
 * Await an adapter call unless the panel is cancelled first. The signal is
 * also handed to the adapter, which stops its subprocess or request; this
 * covers an adapter that ignores it, so a cancelled seat is never awaited to
 * completion. Absent signal ⇒ a plain await.
 */
export function unlessCancelled<T>(call: Promise<T>, cancel: AbortSignal | undefined): Promise<T> {
  return raceAbort(call, cancel);
}

/** The failed-attempt result for a cancelled seat, keeping the last real error when there was one. */
export function cancelledSeat(lastError: string): { ok: false; error: string } {
  const error =
    lastError !== '' ? `${SEAT_CANCELLED_MESSAGE}: ${lastError}` : SEAT_CANCELLED_MESSAGE;
  return { ok: false, error };
}
