/**
 * Adapter cancellation utilities (#3036).
 *
 * Some vendor SDKs don't expose a per-call AbortSignal (notably the
 * `ollama` SDK, whose only abort surface is `Ollama.abort()` — which
 * cancels every ongoing streamed request on the client, not the one
 * call we want). For those, `raceAbort` lets us stop awaiting the
 * pending promise without affecting other in-flight work: when the
 * signal aborts, the race rejects with `AbortError` and the late SDK
 * result is discarded.
 *
 * The underlying HTTP request may still run to completion on the
 * server — `raceAbort` does NOT cancel the wire — but the local
 * caller stops awaiting it, so no late result lands in OutcomeStore
 * or LinUCB for a decision already discarded.
 */

/** Error thrown by `raceAbort` when the signal aborts before the inner promise settles. */
export class AbortError extends Error {
  override readonly name = 'AbortError';
  constructor(message = 'Operation aborted') {
    super(message);
  }
}

/**
 * Throw an {@link AbortError} with `message` once `signal` has fired (#6747).
 * Unlike `signal.throwIfAborted()`, which throws the raw reason (a bare string
 * from `cancel_job`), the error type is fixed, so a caller can tell an abort
 * from a failure. Read through a call: TypeScript narrows `signal.aborted`
 * after one check, which is unsound across `await`s.
 */
export function throwIfAborted(signal: AbortSignal | undefined, message: string): void {
  if (signal?.aborted === true) throw new AbortError(message);
}

/**
 * Whether an error records a call its caller cancelled (#6691): its `cause` is
 * an {@link AbortError}. A cancel says nothing about the adapter's health, so
 * circuit breakers skip it and retry loops stop on it. Accepts both a
 * `CliError` and a `ModelError`, since the cause crosses the CLI→model bridge.
 */
export function isCallerCancelled(error: { readonly cause?: unknown }): boolean {
  return error.cause instanceof AbortError;
}

/**
 * Whether an abort `reason` says a deadline fired rather than a cancel
 * (#6691). `AbortSignal.timeout()` aborts with a `DOMException` named
 * `TimeoutError`, and core's `TimeoutError` carries the same name. Any other
 * reason — `cancel_job`'s string, a bare `abort()` — is a cancel.
 */
export function isTimeoutAbortReason(reason: unknown): boolean {
  return (
    typeof reason === 'object' &&
    reason !== null &&
    (reason as { readonly name?: unknown }).name === 'TimeoutError'
  );
}

/**
 * Races `promise` against `signal`. Resolves with the promise's value
 * if it settles first; rejects with {@link AbortError} if the signal
 * aborts first.
 *
 * If `signal` is undefined or already aborted at call time, the
 * behavior matches a plain `await promise` / immediate rejection
 * respectively — no signal listener is installed in the undefined
 * case.
 */
export function raceAbort<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (signal === undefined) return promise;
  if (signal.aborted) return Promise.reject(new AbortError());

  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => {
      reject(new AbortError());
    };
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    );
  });
}
