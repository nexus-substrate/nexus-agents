/**
 * Engine failure descriptions for the unified run tool.
 * Split from run-tool.ts when #5506 pushed that module over the 400-line limit.
 */

import { classifyEngineResult } from '../../orchestration/meta-dispatcher.js';
import type { ConsensusEnforcementMode } from '../../orchestration/consensus-enforcement-mode.js';

const FAILURE_PREFIX = 'Engine reported failure:';

function describePlanFailure(record: Record<string, unknown>): string | undefined {
  if (record['planStatus'] === 'empty') {
    return `${FAILURE_PREFIX} the planner returned no plan, so nothing was built`;
  }
  if (record['planStatus'] === 'unapproved') {
    const iterations =
      typeof record['voteIterations'] === 'number'
        ? String(record['voteIterations'])
        : 'an unknown number of';
    return `${FAILURE_PREFIX} the panel did not approve the plan after ${iterations} iterations`;
  }
  if (record['planStatus'] === 'no_quorum') {
    const reason =
      typeof record['planVoteReason'] === 'string'
        ? record['planVoteReason']
        : 'no reason was recorded';
    return `${FAILURE_PREFIX} the plan vote could not reach quorum: ${reason}`;
  }
  return undefined;
}

function describeTaskFailure(record: Record<string, unknown>): string | undefined {
  if (record['taskStatus'] === 'none') {
    return `${FAILURE_PREFIX} no planned tasks completed successfully`;
  }
  if (record['taskStatus'] === 'partial') {
    return `${FAILURE_PREFIX} one or more planned tasks did not complete successfully`;
  }
  return undefined;
}

/** Says why a dev-pipeline result did not complete (#4789/#5506/#5575/#5645). */
export function describeIncompletePipeline(record: Record<string, unknown>): string {
  const planFailure = describePlanFailure(record);
  if (planFailure !== undefined) return planFailure;
  const taskFailure = describeTaskFailure(record);
  if (taskFailure !== undefined && record['securityPassed'] !== false) return taskFailure;
  if (record['securityRan'] === true && record['securityPassed'] !== true) {
    return `${FAILURE_PREFIX} the security gate rejected the change`;
  }
  if (taskFailure !== undefined) return taskFailure;
  if (record['securityRan'] === false) {
    if (typeof record['securityNote'] === 'string') {
      return `${FAILURE_PREFIX} the security scan did not run (${record['securityNote']}); the change is blocked until it does`;
    }
    return `${FAILURE_PREFIX} the run stopped before the security gate, which never ran`;
  }
  return `${FAILURE_PREFIX} the dev pipeline did not complete`;
}

/**
 * Detect a business failure an engine reported in its own result, or null when
 * the run is honest-success (#4362, #5641).
 *
 * Delegates the success/failure decision to {@link classifyEngineResult} while
 * retaining tool-layer message and detail shaping:
 *
 * - `AdaptiveOrchestratorResult` (pipeline / research) — `success: false`
 * - `DevPipelineResult` (dev-pipeline) — `completed: false`
 *
 * Consensus rejection and unresolved quorum fail only in enforce mode (#4464).
 */
export function detectEngineFailure(
  result: unknown,
  mode: ConsensusEnforcementMode
): { message: string; detail?: Record<string, unknown> } | null {
  const classification = classifyEngineResult(result, mode);
  if (classification.success) return null;

  const record =
    typeof result === 'object' && result !== null ? (result as Record<string, unknown>) : undefined;

  if (record?.['completed'] === false) {
    return { message: describeIncompletePipeline(record), detail: record };
  }
  const detail = classification.failureReason ?? 'no error message';
  return { message: `Engine reported failure: ${detail}` };
}
