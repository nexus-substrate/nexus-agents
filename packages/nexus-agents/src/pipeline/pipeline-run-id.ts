/**
 * The one construction of a dev-pipeline run id (#6858). The TraceWriter names
 * the run's trace directory with it, and stage outcome rows carry it as
 * `traceId`, so the two join on this exact string.
 *
 * @module pipeline/pipeline-run-id
 */

/** The run id for a dev-pipeline session: `pipeline-<sessionId>`. */
export function pipelineRunId(sessionId: string): string {
  return `pipeline-${sessionId}`;
}
