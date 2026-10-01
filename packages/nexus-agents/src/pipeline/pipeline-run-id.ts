/**
 * The one construction of a dev-pipeline run id (#6858). The TraceWriter names
 * the run's trace directory with it, and stage outcome rows carry it as
 * `traceId`, so the two join on this exact string.
 *
 * @module pipeline/pipeline-run-id
 */

import { TRACE_ID_MAX_LENGTH } from '../orchestration/outcomes/outcome-types.js';

const PIPELINE_RUN_PREFIX = 'pipeline-';

/** The run id for a dev-pipeline session: `pipeline-<sessionId>`. */
export function pipelineRunId(sessionId: string): string {
  return `${PIPELINE_RUN_PREFIX}${sessionId}`;
}

/**
 * Longest session id whose run id still fits an outcome row's traceId. A longer
 * one gets a trace but an untraced outcome row, so it could never join and would
 * publish a permanent 0 coverage; it is not counted as a run at all.
 */
const MAX_JOINABLE_SESSION_LENGTH = TRACE_ID_MAX_LENGTH - PIPELINE_RUN_PREFIX.length;
const PIPELINE_RUN_ID = new RegExp(
  `^${PIPELINE_RUN_PREFIX}[a-zA-Z0-9_-]{1,${String(MAX_JOINABLE_SESSION_LENGTH)}}$`
);

/** Recognize the run ID syntax for the MCP session contract; not proof of producer identity. */
export function isPipelineRunId(runId: string): boolean {
  return PIPELINE_RUN_ID.test(runId);
}
