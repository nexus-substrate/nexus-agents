/** Run-owned checkpoint qualification and checked persistence, never an approval authority. */
import {
  acceptanceIdentity,
  type AcceptanceContext,
  type AcceptanceIdentity,
} from './acceptance-context.js';
import {
  getAcceptanceMetadata,
  getBuiltinAcceptance,
  getBuiltinVoteEvidence,
  serializeAcceptanceIdentity,
  type BuiltinVoteEvidence,
} from './acceptance-binding.js';
import {
  loadCheckpointDiagnostic,
  saveBoundStageCheckpoint,
  saveStageCheckpoint,
  type PipelineCheckpointState,
  type PipelineStageData,
  type CheckpointDiagnostic,
} from './pipeline-checkpoint.js';
import {
  checkpointTaskIdentities,
  type PipelineCheckpointBinding,
} from './pipeline-checkpoint-binding.js';
import { qualifyCheckpointApproval } from './pipeline-checkpoint-qualification.js';
import { reconstructPlanVoteProposal } from './plan-vote-proposal.js';
import type { DevPipelineStages, VoteResult } from './dev-pipeline.js';

export interface CheckpointStop {
  readonly status: 'blocked' | 'unavailable';
  readonly reason:
    | 'checkpoint-invalid'
    | 'checkpoint-unavailable'
    | 'binding-unavailable'
    | 'binding-mismatch'
    | 'legacy-unbound'
    | 'approval-missing'
    | 'approval-invalid'
    | 'approval-unavailable'
    | 'checkpoint-write-failed'
    | 'checkpoint-terminal'
    | 'task-lineage-mismatch';
  readonly recovery: 'new-session';
  readonly sessionId?: string;
}
export type CheckpointOutcome =
  | CheckpointStop
  | {
      readonly status: 'fresh' | 'verified' | 'unmeasured';
      readonly sessionId?: string;
      readonly voteRecordId?: string;
      readonly execution: 'fresh' | 'not-run';
    };
export class CheckpointStopError extends Error {
  readonly outcome: CheckpointStop;
  constructor(reason: CheckpointStop['reason'], status: CheckpointStop['status'] = 'blocked') {
    super('Pipeline checkpoint qualification stopped');
    this.outcome = { status, reason, recovery: 'new-session' };
  }
}

/** One instance per run; private suffix never enters a public result or log. */
export class DevPipelineCheckpoint {
  readonly prior: PipelineCheckpointState | null;
  private readonly acceptance: AcceptanceContext | undefined;
  private approval: BuiltinVoteEvidence | undefined;
  private taskDefinitions: AcceptanceIdentity | undefined;
  private execution: 'fresh' | 'not-run' = 'not-run';

  constructor(
    private readonly stages: DevPipelineStages,
    private readonly sessionId?: string
  ) {
    this.acceptance = getBuiltinAcceptance(stages);
    const loaded = diagnoseRun(sessionId, this.acceptance);
    this.prior = loaded.kind === 'legacy' || loaded.kind === 'bound' ? loaded.state : null;
    if (loaded.kind === 'bound') this.restore(loaded);
  }

  private restore(loaded: Extract<CheckpointDiagnostic, { kind: 'bound' }>): void {
    if (loaded.state.securityPassed !== undefined)
      throw new CheckpointStopError('checkpoint-terminal');
    if (this.acceptance === undefined) throw new CheckpointStopError('binding-unavailable');
    if (
      serializeAcceptanceIdentity(getAcceptanceMetadata(this.acceptance)) !==
      serializeAcceptanceIdentity(loaded.binding.acceptance)
    ) {
      throw new CheckpointStopError('binding-mismatch');
    }
    if (loaded.state.plan === undefined) return;
    const proof = loaded.binding.approval;
    const planIdentity = loaded.binding.planIdentity;
    if (proof === undefined || planIdentity === undefined)
      throw new CheckpointStopError('approval-missing');
    this.approval = { ...proof, acceptance: loaded.binding.acceptance, planIdentity };
    this.qualify(loaded.state.plan, this.approval);
    this.taskDefinitions = loaded.binding.taskDefinitionsIdentity;
  }

  get outcome(): CheckpointOutcome {
    return {
      execution: this.execution,
      status:
        this.acceptance === undefined
          ? 'unmeasured'
          : this.prior?.plan !== undefined
            ? 'verified'
            : 'fresh',
      ...(this.sessionId !== undefined ? { sessionId: this.sessionId } : {}),
      ...(this.approval !== undefined ? { voteRecordId: this.approval.voteRecordId } : {}),
    };
  }

  /** Fresh implementation callbacks are attempted; this is not proof of applied filesystem changes. */
  markFreshExecution(): void {
    this.execution = 'fresh';
  }

  /** Called on the actual returned vote, before the orchestrator reconstructs its result. */
  accept(plan: string, vote: VoteResult): void {
    if (this.acceptance === undefined) return;
    const proof = getBuiltinVoteEvidence(this.stages, vote);
    if (proof === undefined) throw new CheckpointStopError('approval-unavailable', 'unavailable');
    this.qualify(plan, proof);
    this.approval = proof;
  }

  private qualify(plan: string, proof: BuiltinVoteEvidence): void {
    const current = this.acceptance;
    if (current === undefined || getBuiltinAcceptance(this.stages) !== current)
      throw new CheckpointStopError('binding-unavailable');
    assertProofBinding(current, plan, proof);
    const proposal = reconstructPlanVoteProposal(plan, current, proof.suffix);
    if (!proposal.ok) throw new CheckpointStopError('approval-invalid');
    const qualified = qualifyCheckpointApproval({
      voteRecordId: proof.voteRecordId,
      reconstructedProposal: proposal.value,
    });
    if (qualified.status === 'unavailable')
      throw new CheckpointStopError('approval-unavailable', 'unavailable');
    if (
      qualified.status !== 'qualified' ||
      qualified.recordHash !== proof.recordHash ||
      qualified.proposalHash !== proof.proposalHash
    ) {
      throw new CheckpointStopError('approval-invalid');
    }
  }

  /** Previously completed bound entries are not appended again on resume. */
  save(data: PipelineStageData): void {
    if (this.sessionId === undefined) return;
    if (this.alreadySaved(data.type)) return;
    if (this.acceptance === undefined) {
      saveStageCheckpoint(this.sessionId, data.type, data);
      return;
    }
    if (getBuiltinAcceptance(this.stages) !== this.acceptance)
      throw new CheckpointStopError('binding-unavailable');
    const binding = this.bindingFor(data);
    const result = saveBoundStageCheckpoint({
      sessionId: this.sessionId,
      stage: data.type,
      data,
      binding,
    });
    if (result.status !== 'saved')
      throw new CheckpointStopError('checkpoint-write-failed', 'unavailable');
    if (data.type === 'decompose') this.taskDefinitions = binding.taskDefinitionsIdentity;
  }

  private alreadySaved(stage: PipelineStageData['type']): boolean {
    const prior = this.prior;
    if (prior === null) return false;
    // A legacy plan is not proof that a vote ran; never append a manufactured approval.
    if (this.acceptance === undefined)
      return (stage === 'plan' || stage === 'vote') && prior.plan !== undefined;
    if (stage === 'implement') return false;
    const fields = {
      research: 'research',
      plan: 'plan',
      vote: 'plan',
      decompose: 'tasks',
      security: 'securityPassed',
    } as const;
    return prior[fields[stage]] !== undefined;
  }

  private bindingFor(data: PipelineStageData): PipelineCheckpointBinding {
    const current = this.acceptance;
    if (current === undefined) throw new CheckpointStopError('binding-unavailable');
    const common = {
      format: 'pipeline-checkpoint-v1' as const,
      acceptance: getAcceptanceMetadata(current),
    };
    if (data.type === 'research') return common;
    const proof = this.approval;
    if (proof === undefined) throw new CheckpointStopError('approval-missing');
    const plan = { ...common, planIdentity: proof.planIdentity };
    if (data.type === 'plan') return plan;
    if (data.type === 'vote') {
      const { acceptance: _acceptance, planIdentity: _planIdentity, ...approval } = proof;
      return { ...plan, approval };
    }
    const decision = { voteRecordId: proof.voteRecordId, recordHash: proof.recordHash };
    return {
      ...plan,
      decision,
      ...(data.type === 'security' ? {} : this.taskBinding(data)),
    };
  }

  private taskBinding(
    data: Extract<PipelineStageData, { type: 'implement' | 'decompose' }>
  ): ReturnType<typeof checkpointTaskIdentities> {
    const identities = checkpointTaskIdentities(data.tasks);
    if (
      data.type === 'implement' &&
      (identities.taskDefinitionsIdentity.sha256 !== this.taskDefinitions?.sha256 ||
        identities.taskDefinitionsIdentity.bytes !== this.taskDefinitions.bytes)
    ) {
      throw new CheckpointStopError('task-lineage-mismatch');
    }
    return identities;
  }
}

function diagnoseRun(
  sessionId: string | undefined,
  acceptance: AcceptanceContext | undefined
): CheckpointDiagnostic {
  const loaded =
    sessionId === undefined ? { kind: 'absent' as const } : loadCheckpointDiagnostic(sessionId);
  if (loaded.kind === 'invalid') throw new CheckpointStopError('checkpoint-invalid');
  if (loaded.kind === 'unavailable')
    throw new CheckpointStopError('checkpoint-unavailable', 'unavailable');
  if (loaded.kind === 'legacy' && acceptance !== undefined)
    throw new CheckpointStopError('legacy-unbound');
  return loaded;
}

function assertProofBinding(
  current: AcceptanceContext,
  plan: string,
  proof: BuiltinVoteEvidence
): void {
  const identity = acceptanceIdentity(plan);
  if (
    serializeAcceptanceIdentity(getAcceptanceMetadata(current)) !==
      serializeAcceptanceIdentity(proof.acceptance) ||
    identity.sha256 !== proof.planIdentity.sha256 ||
    identity.bytes !== proof.planIdentity.bytes
  ) {
    throw new CheckpointStopError('binding-mismatch');
  }
}
