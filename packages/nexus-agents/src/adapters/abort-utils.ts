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
