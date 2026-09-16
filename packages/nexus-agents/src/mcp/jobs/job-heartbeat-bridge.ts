/**
 * Pipeline-bus → job heartbeat bridge (#6162).
 *
 * Pipeline bodies (`run_pipeline`, `run_dev_pipeline`, `run`, `orchestrate`)
 * already emit `stage.*` / `model.called` / `pipeline.*` events on the global
 * pipeline event bus as they progress. Rather than threading `progress()` into
 * every stage registry, `runAsJob` subscribes ONCE per job and treats any bus
 * event emitted from inside that job's async context as its heartbeat.
 *
 * Attribution is the load-bearing part. The bus is process-wide, so a naive
 * subscription would let a concurrent pipeline keep a wedged job alive — the
 * exact misreport the heartbeat exists to prevent. `runJobInBackground` runs
 * the body under `withAsyncTaskStateDispatch(jobId)`, an `AsyncLocalStorage`
 * scope that every await, timer and subprocess callback inside the body
 * inherits, and the bus invokes handlers synchronously inside `emit`; so the
 * store read in the handler names the job whose body emitted the event.
 *
 * Empty case: a body that emits nothing on the bus and never calls
 * `progress()` gets no heartbeat from this bridge — under a long guard it is
 * wedged by definition, which is the point.
 *
 * @module mcp/jobs/job-heartbeat-bridge
 */

import { currentAsyncDispatchJobId } from '../../context/structured-task-state.js';
import { getPipelineEventBus } from '../../pipeline/event-bus.js';
import type { Unsubscribe } from '../../pipeline/event-types.js';

/**
 * Subscribe `progress` to every pipeline-bus event emitted from inside
 * `jobId`'s async context. Returns the unsubscribe; `runJobInBackground` calls
 * it in its `finally` so a settled job stops listening.
 */
export function bridgePipelineEventsToHeartbeat(jobId: string, progress: () => void): Unsubscribe {
  return getPipelineEventBus().subscribe({}, () => {
    if (currentAsyncDispatchJobId() === jobId) progress();
  });
}
