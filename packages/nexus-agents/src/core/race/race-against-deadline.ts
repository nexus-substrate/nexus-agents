/**
 * Generic wall-clock deadline race primitive.
 *
 * Races a promise against a timer. If the promise settles first, its value is
 * returned. If the timer fires first, `onTimeout(elapsedMs)` is called and its
 * return value resolves the race. The timer is always cleaned up.
 *
 * Used by MCP tools whose inner work may hang (subprocess IPC, multi-step
 * orchestration) to guarantee a structured result before the outer
 * `wrapToolWithTimeout` middleware fires a naked timeout error. Pair with
 * `getMcpSafeDeadlineMs` from `config/timeouts.ts` so the internal deadline
 * always fires before the MCP wrapper.
 *
 * Unlike `voter-agents-deadline.ts::raceWithDeadline`, this is not coupled to
 * a specific error-vote shape — the caller synthesises whatever partial
 * result makes sense in their domain.
 *
 * @module core/race/race-against-deadline
 * @see Issue #2104 (sub-issue B)
 */

/**
 * Races `promise` against `deadlineMs`. Returns the first settled value.
 *
 * On timeout, calls `onTimeout(elapsedMs)` and resolves with its return
 * value. `elapsedMs` is the time between the call site and the timeout
 * firing — useful for recording in metadata.
 *
 * - The timer is cleared in a `.finally()` branch so a late-settling promise
 *   does not leave a dangling handle.
 * - If `deadlineMs <= 0`, the timeout fires on the next microtask.
 * - The original promise continues running after a timeout (there is no
 *   cancellation primitive at this layer); callers who need to abort
 *   downstream work should pass an AbortController into the promise creator.
 */
export async function raceAgainstDeadline<T>(
  promise: Promise<T>,
  deadlineMs: number,
  onTimeout: (elapsedMs: number) => T
): Promise<T> {
  const startedAt = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeoutP = new Promise<T>((resolve, reject) => {
    timer = setTimeout(
      () => {
        // If onTimeout throws (e.g. it returns a Result.err whose constructor
        // throws, or a caller passes a non-pure callback), the sync throw
        // happens inside the timer callback and would otherwise crash the
        // process under strict mode. Reject the timeout promise so
        // Promise.race surfaces the error to the caller. Audit #2824.
        try {
          resolve(onTimeout(Date.now() - startedAt));
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      },
      Math.max(0, deadlineMs)
    );
  });

  try {
    return await Promise.race([promise, timeoutP]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
