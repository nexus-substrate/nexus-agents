/**
 * Self-Development Workflow Engine Helpers
 *
 * Helper functions extracted from engine.ts to maintain file size limits.
 *
 * @module workflows/self-development/engine-helpers
 */

import { getErrorMessage, getTimeProvider } from '../../core/index.js';
import type {
  SelfDevWorkflowState,
  SelfDevWorkflowResult,
  WorkflowPhase,
  WorkflowCheckpoint,
} from './types.js';
import type { WorkflowEvent, WorkflowEventListener } from './interfaces.js';
import type { AuditTrail } from './audit-trail.js';
import { calculateMetrics } from './metrics.js';

/** Internal state container for workflow engine. */
export interface EngineStateContainer {
  states: Map<string, SelfDevWorkflowState>;
  results: Map<string, SelfDevWorkflowResult>;
  auditTrails: Map<string, AuditTrail>;
  listeners: WorkflowEventListener[];
}

/** Dependencies for notification functions. */
export interface NotificationDeps {
  workflowCompleted: (
    executionId: string,
    prNumber?: number,
    prUrl?: string
  ) => Promise<void> | void;
  workflowFailed: (
    executionId: string,
    phase: WorkflowPhase,
    error: string
  ) => Promise<void> | void;
}

/** Emit an event to all listeners. */
export function emitEvent(listeners: WorkflowEventListener[], event: WorkflowEvent): void {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      // Ignore listener errors
    }
  }
}

/** Get the current phase for an execution. */
export function getPhase(
  states: Map<string, SelfDevWorkflowState>,
  executionId: string
): WorkflowPhase | undefined {
  return states.get(executionId)?.currentPhase;
}

/** Update the workflow phase and emit events. */
export function updatePhase(
  container: EngineStateContainer,
  executionId: string,
  phase: WorkflowPhase
): void {
  const state = container.states.get(executionId);
  if (state === undefined) return;

  const audit = container.auditTrails.get(executionId);
  const prevPhase = state.currentPhase;

  emitEvent(container.listeners, {
    type: 'phase_completed',
    phase: prevPhase,
    timestamp: getTimeProvider().nowIso(),
  });
  const updated: SelfDevWorkflowState = { ...state, currentPhase: phase };
  container.states.set(executionId, updated);
  emitEvent(container.listeners, {
    type: 'phase_started',
    phase,
    timestamp: getTimeProvider().nowIso(),
  });

  // Record phase transition in audit trail
  void audit?.phaseCompleted(prevPhase, 0);
  void audit?.phaseStarted(phase);
}

/** Update the workflow status. */
export function updateStatus(
  states: Map<string, SelfDevWorkflowState>,
  executionId: string,
  status: SelfDevWorkflowState['status']
): void {
  const state = states.get(executionId);
  if (state === undefined) return;

  const updated: SelfDevWorkflowState = { ...state, status };
  states.set(executionId, updated);
}

/** Create a checkpoint for the current phase. */
export function createCheckpoint(
  container: EngineStateContainer,
  executionId: string,
  phase: WorkflowPhase,
  outputs: unknown
): void {
  const state = container.states.get(executionId);
  if (state === undefined) return;

  const checkpoint: WorkflowCheckpoint = {
    phase,
    timestamp: getTimeProvider().nowIso(),
    inputs: {},
    outputs,
    status: 'completed',
  };

  const updated: SelfDevWorkflowState = {
    ...state,
    checkpoints: [...state.checkpoints, checkpoint],
  };
  container.states.set(executionId, updated);
  emitEvent(container.listeners, {
    type: 'checkpoint_created',
    phase,
    timestamp: checkpoint.timestamp,
  });
}

/** Complete a workflow successfully. */
export function completeWorkflow(
  container: EngineStateContainer,
  executionId: string,
  outputs: SelfDevWorkflowResult['outputs'],
  startTime: number,
  notifications?: NotificationDeps
): void {
  const state = container.states.get(executionId);
  const durationMs = getTimeProvider().now() - startTime;
  const checkpointCount = state?.checkpoints.filter((c) => c.phase === 'review').length ?? 0;
  const metrics = calculateMetrics(outputs, durationMs, checkpointCount);

  const successResult: SelfDevWorkflowResult = {
    executionId,
    success: true,
    phase: 'commit',
    outputs,
    metrics,
  };

  container.results.set(executionId, successResult);
  updateStatus(container.states, executionId, 'completed');
  emitEvent(container.listeners, {
    type: 'workflow_completed',
    timestamp: getTimeProvider().nowIso(),
  });

  void container.auditTrails.get(executionId)?.workflowCompleted(true, durationMs);

  // Send completion notification
  const prOut = outputs.commit;
  void notifications?.workflowCompleted(executionId, prOut?.prNumber, prOut?.prUrl);
}

/** Fail a workflow with an error. */
export function failWorkflow(
  container: EngineStateContainer,
  executionId: string,
  error: unknown,
  startTime: number,
  notifications?: NotificationDeps
): void {
  const errorMessage = getErrorMessage(error);
  const currentPhase = getPhase(container.states, executionId) ?? 'analyze';
  const state = container.states.get(executionId);
  const durationMs = getTimeProvider().now() - startTime;
  const checkpointCount = state?.checkpoints.filter((c) => c.phase === 'review').length ?? 0;
  const metrics = calculateMetrics({}, durationMs, checkpointCount);

  const failureResult: SelfDevWorkflowResult = {
    executionId,
    success: false,
    phase: currentPhase,
    outputs: {},
    metrics,
    error: errorMessage,
  };

  container.results.set(executionId, failureResult);
  updateStatus(container.states, executionId, 'failed');
  emitEvent(container.listeners, {
    type: 'workflow_failed',
    phase: currentPhase,
    data: { error: errorMessage },
    timestamp: getTimeProvider().nowIso(),
  });

  const audit = container.auditTrails.get(executionId);
  void audit?.phaseFailed(currentPhase, errorMessage);
  void audit?.workflowCompleted(false, durationMs);
  void notifications?.workflowFailed(executionId, currentPhase, errorMessage);
}
