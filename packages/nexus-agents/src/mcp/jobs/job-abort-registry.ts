/**
 * nexus-agents/mcp/jobs — per-job AbortController registry (#4086).
 *
 * `runAsJob` dispatches detached background work; `cancel_job` previously only
 * wrote a durable `cancelled` record but could not actually STOP the in-flight
 * work (run-as-job had no abort wiring, #4017). This registry closes that gap: a
 * dispatched job registers an `AbortController` keyed by `jobId`, the job body
 * receives `controller.signal`, and `cancel_job` calls {@link abortJob} to abort
 * it — so a tool that threads the signal into its awaited work is interrupted in
 * the same process. (Tools that ignore the signal still run to completion, but the
 * record is preserved as `cancelled` by the terminal-writer guards, #4022.)
 *
 * Process-local and same-process only (no IPC): a worker in another process must
 * still poll the durable record.
 *
 * @module mcp/jobs/job-abort-registry
 */

const controllers = new Map<string, AbortController>();

/**
 * Register a fresh `AbortController` for `jobId` and return it. The dispatcher
 * passes its `signal` to the job body and must call {@link unregisterJobAbort}
 * when the job settles (whether it completed, failed, or was aborted).
 */
export function registerJobAbort(jobId: string): AbortController {
  const controller = new AbortController();
  controllers.set(jobId, controller);
  return controller;
}

/**
 * Abort the in-flight job's signal, if it is still registered. Returns true when a
 * live controller was found and aborted, false when the job is unknown / already
 * settled (in which case there is nothing in-flight to stop — the durable record
 * is the source of truth). The entry is removed so a late settle doesn't double-fire.
 */
export function abortJob(jobId: string, reason?: string): boolean {
  const controller = controllers.get(jobId);
  if (controller === undefined) return false;
  controllers.delete(jobId);
  controller.abort(reason ?? 'cancelled via cancel_job');
  return true;
}

/** Remove the controller for a settled job. Idempotent. */
export function unregisterJobAbort(jobId: string): void {
  controllers.delete(jobId);
}

/** Number of in-flight controllers (test/observability). @internal */
export function jobAbortRegistrySize(): number {
  return controllers.size;
}
