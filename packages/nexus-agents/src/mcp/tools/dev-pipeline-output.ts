/**
 * The `run_dev_pipeline` tool's structured output (#1700), moved out of
 * `dev-pipeline-tool.ts` to keep that module under the line ceiling.
 *
 * @module mcp/tools/dev-pipeline-output
 */

import type { DevPipelineResult } from '../../pipeline/dev-pipeline.js';

/** Build structured JSON output for harness consumption (#1700). */
export function buildStructuredOutput(
  result: DevPipelineResult,
  simulated: boolean
): Record<string, unknown> {
  return {
    // #4170: stamped only on an explicit NEXUS_ALLOW_SIMULATE=1 opt-in run so
    // a random demo panel can never pass as a real decision.
    ...(simulated ? { simulated: true } : {}),
    completed: result.completed,
    ...changesField(result),
    // Kept for compatibility: `false` here is NOT a verdict unless `securityRan`
    // is true. `security` below is the field that cannot misread (#7181).
    securityPassed: result.securityPassed,
    security: securityStatus(result),
    // #4772: these two are what make `completed: false` legible. Without them a
    // caller cannot tell a failed planner from a successful dry run, or a
    // security rejection from a gate that never ran — which is the whole point
    // of the fields. They were added to DevPipelineResult and then not listed
    // here, so they never reached the MCP surface.
    ...(result.harnessMode !== undefined ? { harnessMode: result.harnessMode } : {}),
    ...(result.securityRan !== undefined ? { securityRan: result.securityRan } : {}),
    ...(result.planStatus !== undefined ? { planStatus: result.planStatus } : {}),
    // #7181: the dry run's verdict, which otherwise reached only the ledger.
    ...planVoteVerdictFields(result),
    // #4993 added `dryRun` to DevPipelineResult for exactly the reason above —
    // it says `completed: false` was the request, not a fault — and then did
    // not list it here either. Same omission, same function, under the comment
    // describing it. A live `run_dev_pipeline({ dryRun: true })` came back with
    // no way to tell a successful dry run from a failed pipeline.
    ...(result.dryRun !== undefined ? { dryRun: result.dryRun } : {}),
    ...(result.taskStatus !== undefined ? { taskStatus: result.taskStatus } : {}),
    // #6792: listed here, or the warning never reaches the MCP surface.
    ...warningsField(result),
    voteIterations: result.voteIterations,
    qaIterations: result.qaIterations,
    plan: result.plan,
    tasks: result.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      implementation: t.implementation ?? null,
      feedback: t.feedback ?? null,
    })),
  };
}

/** Preserve the patch artifact, including the explicitly empty case. */
function changesField(
  result: Pick<DevPipelineResult, 'changes'>
): Pick<DevPipelineResult, 'changes'> {
  return result.changes !== undefined ? { changes: result.changes } : {};
}

/** A result's `warnings`, as a field to spread into the output, or `{}` when absent. */
function warningsField(
  result: Pick<DevPipelineResult, 'warnings'>
): Pick<DevPipelineResult, 'warnings'> {
  return result.warnings !== undefined ? { warnings: result.warnings } : {};
}

/**
 * The security gate's status as a value that cannot be misread (#7181).
 *
 * `securityPassed: false` beside `securityRan: false` read as a failed check.
 * Only a scan that ran yields `passed`/`failed`; a scan that did not run, and a
 * producer that predates `securityRan` (#4782), are both `unmeasured`.
 */
function securityStatus(result: Pick<DevPipelineResult, 'securityPassed' | 'securityRan'>): {
  readonly status: 'passed' | 'failed' | 'unmeasured';
} {
  if (result.securityRan !== true) return { status: 'unmeasured' };
  return { status: result.securityPassed ? 'passed' : 'failed' };
}

/** Shared plan vote evidence, each field present only when produced (#7181, #7240). */
type PlanVoteEvidence = Pick<
  DevPipelineResult,
  | 'planVoteDecision'
  | 'planVoteApprovalPercentage'
  | 'planVoteRecordId'
  | 'planVoteReason'
  | 'planVoteFeedback'
>;

/** Format the evidence identically for both pipeline tools. */
export function planVoteVerdictFields(result: PlanVoteEvidence): PlanVoteEvidence {
  return {
    ...(result.planVoteDecision !== undefined ? { planVoteDecision: result.planVoteDecision } : {}),
    ...(result.planVoteApprovalPercentage !== undefined
      ? { planVoteApprovalPercentage: result.planVoteApprovalPercentage }
      : {}),
    ...(result.planVoteRecordId !== undefined ? { planVoteRecordId: result.planVoteRecordId } : {}),
    ...(result.planVoteReason !== undefined ? { planVoteReason: result.planVoteReason } : {}),
    ...(result.planVoteFeedback !== undefined ? { planVoteFeedback: result.planVoteFeedback } : {}),
  };
}
