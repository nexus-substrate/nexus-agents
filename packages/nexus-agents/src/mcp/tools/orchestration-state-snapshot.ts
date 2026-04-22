/**
 * Mid-flight state snapshot for orchestration (Issue #2111, follow-up to #2104).
 *
 * `executeOrchestration` updates a shared snapshot as each sub-step completes.
 * When the outer wall-clock deadline fires (the safeguard from sub-issue B of
 * #2104), `buildTimeoutOrchestrationResult` reads the snapshot to populate the
 * partial OrchestrateOutput with whatever was captured before the hang,
 * instead of returning all-sentinel values.
 *
 * Kept deliberately minimal: a mutable record with a handful of writer
 * helpers. No events, no observer pattern, no locking — orchestration is
 * single-threaded async, so a plain object handle is all we need.
 *
 * @module mcp/tools/orchestration-state-snapshot
 */

import type { OrchestrateOutput, RoutingInfo } from './orchestrate-types.js';

/** What phase the orchestration was in when a snapshot was last updated. */
export type OrchestrationStage =
  | 'init'
  | 'routing_decided'
  | 'analysis_done'
  | 'executing'
  | 'completed';

/**
 * Snapshot of orchestration progress. All fields start undefined and are
 * filled in as the pipeline advances. Consumers should treat reads as
 * "whatever was true at the last write" — there is no synchronisation.
 */
export interface OrchestrationStateSnapshot {
  stage: OrchestrationStage;
  /** Populated once `routeAndPrepare` returns a routing decision. */
  routing?: RoutingInfo;
  /** Populated once the analysis sub-step finishes (fast-path or orchestrator). */
  analysis?: OrchestrateOutput['analysis'];
  /** Count of completed executor steps — grows as runOrchestrator progresses. */
  stepsCompleted: number;
  /** Timestamp when the snapshot was created (for elapsed-ms calculations). */
  readonly createdAt: number;
}

/** Factory for a fresh snapshot in the `init` stage. */
export function createOrchestrationStateSnapshot(nowMs: number): OrchestrationStateSnapshot {
  return {
    stage: 'init',
    stepsCompleted: 0,
    createdAt: nowMs,
  };
}

/** Record the current stage. Safe to call multiple times. */
export function setStage(snapshot: OrchestrationStateSnapshot, stage: OrchestrationStage): void {
  snapshot.stage = stage;
}

/** Record the routing decision once it's been made. */
export function setRouting(snapshot: OrchestrationStateSnapshot, routing: RoutingInfo): void {
  snapshot.routing = routing;
  snapshot.stage = 'routing_decided';
}

/** Record the analysis sub-step result. */
export function setAnalysis(
  snapshot: OrchestrationStateSnapshot,
  analysis: OrchestrateOutput['analysis']
): void {
  snapshot.analysis = analysis;
  snapshot.stage = 'analysis_done';
}

/** Increment the completed-steps counter. */
export function incrementStepsCompleted(snapshot: OrchestrationStateSnapshot): void {
  snapshot.stepsCompleted += 1;
  snapshot.stage = 'executing';
}
