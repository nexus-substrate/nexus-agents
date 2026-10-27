/** Versioned checkpoint metadata and local lineage checks; approval authority stays in the ledger. */
import { z } from 'zod';
import { err, ok, type Result } from '../core/result.js';
import { TrustTierSchema } from '../security/trust-types.js';
import {
  serializeAcceptanceIdentity,
  type AcceptanceMetadata,
  type BuiltinVoteEvidence,
} from './acceptance-binding.js';
import { acceptanceIdentity, type AcceptanceIdentity } from './acceptance-context.js';
import { parseVoteResearchSuffix } from './plan-vote-proposal.js';
import type { PipelineTask } from './dev-pipeline.js';
import type { PipelineCheckpointEntry } from './pipeline-checkpoint.js';

export type CheckpointVoteEvidence = Omit<BuiltinVoteEvidence, 'acceptance' | 'planIdentity'>;
export interface PipelineCheckpointBinding {
  readonly format: 'pipeline-checkpoint-v1';
  readonly acceptance: AcceptanceMetadata;
  readonly planIdentity?: AcceptanceIdentity | undefined;
  readonly approval?: CheckpointVoteEvidence | undefined;
  readonly decision?: { readonly voteRecordId: string; readonly recordHash: string } | undefined;
  readonly tasksIdentity?: AcceptanceIdentity | undefined;
  readonly taskDefinitionsIdentity?: AcceptanceIdentity | undefined;
}
export interface BoundCheckpointState {
  readonly acceptance: AcceptanceMetadata;
  readonly planIdentity?: AcceptanceIdentity | undefined;
  readonly approval?: CheckpointVoteEvidence | undefined;
  readonly tasksIdentity?: AcceptanceIdentity | undefined;
  readonly taskDefinitionsIdentity?: AcceptanceIdentity | undefined;
  readonly implementedTasksIdentity?: AcceptanceIdentity | undefined;
}

const IdentitySchema = z
  .object({ sha256: z.string().regex(/^[a-f0-9]{64}$/), bytes: z.number().int().nonnegative() })
  .strict();
const ObservationSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('unmeasured') }).strict(),
  z.object({ status: z.literal('unmodified') }).strict(),
  z
    .object({
      status: z.literal('modified'),
      counts: z
        .object({
          tagsRemoved: z.number().int().nonnegative(),
          commentsRemoved: z.number().int().nonnegative(),
          fieldsModified: z.number().int().nonnegative(),
        })
        .strict(),
    })
    .strict(),
]);
const ProvenanceSchema = z
  .object({
    callerTrustTier: TrustTierSchema.or(z.literal('unmeasured')),
    sourceTrustTier: TrustTierSchema.or(z.literal('unmeasured')),
    argumentSanitization: ObservationSchema,
    projectionSanitization: ObservationSchema,
  })
  .strict();
const ComponentSchema = z
  .object({
    sourceIdentity: IdentitySchema,
    projectionIdentity: IdentitySchema,
    provenance: ProvenanceSchema,
  })
  .strict();
const sourceFields = { identity: IdentitySchema, rawPreMiddleware: z.literal('unavailable') };
const SourceSchema = z.union([
  z.object({ ...sourceFields, kind: z.enum(['task', 'planFile', 'goal', 'specFile']) }).strict(),
  z
    .object({
      ...sourceFields,
      kind: z.literal('specFile+task'),
      components: z.object({ specFile: ComponentSchema, task: ComponentSchema }).strict(),
    })
    .strict(),
]);
const AcceptanceSchema = z
  .object({ source: SourceSchema, projection: IdentitySchema, provenance: ProvenanceSchema })
  .strict();
const DecisionSchema = z
  .object({ voteRecordId: z.string().min(1), recordHash: z.string().regex(/^[a-f0-9]{64}$/) })
  .strict();
const ApprovalSchema = DecisionSchema.extend({
  format: z.literal('bound-plan-vote-v1'),
  proposalHash: z.string().regex(/^[a-f0-9]{64}$/),
  suffix: z.unknown(),
}).strict();
const BindingSchema = z
  .object({
    format: z.literal('pipeline-checkpoint-v1'),
    acceptance: AcceptanceSchema,
    planIdentity: IdentitySchema.optional(),
    approval: ApprovalSchema.optional(),
    decision: DecisionSchema.optional(),
    tasksIdentity: IdentitySchema.optional(),
    taskDefinitionsIdentity: IdentitySchema.optional(),
  })
  .strict();
const TaskSchema = z
  .object({
    id: z.string().min(1),
    title: z.string(),
    description: z.string(),
    assignedTo: z.enum(['researcher', 'architect', 'pm', 'coder', 'qa', 'security']),
    status: z.enum(['pending', 'in_progress', 'review', 'done', 'rejected']),
    feedback: z.string().optional(),
    implementation: z.string().optional(),
    researchMaturity: z.number().min(0).max(1).optional(),
  })
  .strict();

/** Stable field ordering; task definitions remain fixed while status/output may change. */
export function checkpointTaskIdentities(tasks: readonly PipelineTask[]): {
  tasksIdentity: AcceptanceIdentity;
  taskDefinitionsIdentity: AcceptanceIdentity;
} {
  const definitions = tasks.map((task) => ({
    id: task.id,
    title: task.title,
    description: task.description,
    assignedTo: task.assignedTo,
    researchMaturity: task.researchMaturity,
  }));
  const complete = tasks.map((task, i) => ({
    ...definitions[i],
    status: task.status,
    feedback: task.feedback,
    implementation: task.implementation,
  }));
  return {
    tasksIdentity: acceptanceIdentity(JSON.stringify(complete)),
    taskDefinitionsIdentity: acceptanceIdentity(JSON.stringify(definitions)),
  };
}

/** Schema and exact suffix validation occur before unknown keys could be stripped. */
export function parseCheckpointBinding(value: unknown): Result<PipelineCheckpointBinding, Error> {
  const parsed = BindingSchema.safeParse(value);
  if (!parsed.success) return err(new Error('Invalid or unsupported checkpoint binding'));
  const { approval, ...common } = parsed.data;
  if (approval === undefined) return ok(common);
  const suffix = parseVoteResearchSuffix(approval.suffix);
  if (!suffix.ok) return err(new Error('Invalid checkpoint vote suffix'));
  return ok({ ...common, approval: { ...approval, suffix: suffix.value } });
}

function sameIdentity(
  a: AcceptanceIdentity | undefined,
  b: AcceptanceIdentity | undefined
): boolean {
  return a !== undefined && a.sha256 === b?.sha256 && a.bytes === b.bytes;
}

/** Per-entry validation also protects sensitive writes, before any file creation. */
export function validateBoundEntry(entry: PipelineCheckpointEntry): boolean {
  const binding = entry.binding;
  if (binding === undefined || entry.stage !== entry.data.type) return false;
  const data = entry.data;
  if (data.type === 'research')
    return binding.planIdentity === undefined && noLaterMetadata(binding);
  if (binding.planIdentity === undefined) return false;
  if (data.type === 'plan') return validPlan(data.text, binding);
  if (data.type === 'vote') return validVote(data.approved, binding);
  return validExecutionEntry(data, binding);
}
function validExecutionEntry(
  data: Extract<PipelineCheckpointEntry['data'], { type: 'decompose' | 'implement' | 'security' }>,
  binding: PipelineCheckpointBinding
): boolean {
  if (binding.approval !== undefined || binding.decision === undefined) return false;
  if (data.type === 'security')
    return binding.tasksIdentity === undefined && binding.taskDefinitionsIdentity === undefined;
  return validTasks(data.tasks, binding);
}
function validPlan(text: string, binding: PipelineCheckpointBinding): boolean {
  return (
    text.isWellFormed() &&
    !text.includes('\0') &&
    sameIdentity(acceptanceIdentity(text), binding.planIdentity) &&
    noLaterMetadata(binding)
  );
}
function validVote(approved: boolean, binding: PipelineCheckpointBinding): boolean {
  return (
    approved &&
    binding.approval !== undefined &&
    binding.decision === undefined &&
    binding.tasksIdentity === undefined &&
    binding.taskDefinitionsIdentity === undefined
  );
}
function validTasks(value: readonly PipelineTask[], binding: PipelineCheckpointBinding): boolean {
  const tasks = z.array(TaskSchema).safeParse(value);
  if (!tasks.success || new Set(tasks.data.map((task) => task.id)).size !== tasks.data.length)
    return false;
  // An empty task checkpoint records no tasks; it does not certify completed work.
  // The strict schema validates without coercion; retain the caller's optional-field shape.
  const identities = checkpointTaskIdentities(value);
  return (
    sameIdentity(identities.tasksIdentity, binding.tasksIdentity) &&
    sameIdentity(identities.taskDefinitionsIdentity, binding.taskDefinitionsIdentity)
  );
}
function noLaterMetadata(b: PipelineCheckpointBinding): boolean {
  return (
    b.approval === undefined &&
    b.decision === undefined &&
    b.tasksIdentity === undefined &&
    b.taskDefinitionsIdentity === undefined
  );
}

/** Partial research/plan checkpoints remain partial; this never grants approval. */
export function rebuildBoundCheckpoint(
  entries: readonly PipelineCheckpointEntry[]
): Result<BoundCheckpointState, Error> {
  const first = entries[0]?.binding;
  if (first === undefined) return err(new Error('Missing checkpoint binding'));
  let state: BoundCheckpointState = { acceptance: first.acceptance };
  let securityTerminal = false;
  for (const entry of entries) {
    if (securityTerminal) return invalidLineage();
    const next = advanceBoundState(state, entry);
    if (!next.ok) return next;
    state = next.value;
    securityTerminal = entry.stage === 'security';
  }
  return ok(state);
}

function invalidLineage(): Result<BoundCheckpointState, Error> {
  return err(new Error('Checkpoint lineage mismatch'));
}
function advanceBoundState(
  state: BoundCheckpointState,
  entry: PipelineCheckpointEntry
): Result<BoundCheckpointState, Error> {
  const b = entry.binding;
  if (
    b === undefined ||
    !validateBoundEntry(entry) ||
    serializeAcceptanceIdentity(state.acceptance) !== serializeAcceptanceIdentity(b.acceptance)
  )
    return invalidLineage();
  if (entry.stage === 'research')
    return state.planIdentity === undefined ? ok(state) : invalidLineage();
  if (entry.stage === 'plan')
    return state.planIdentity === undefined
      ? ok({ ...state, planIdentity: b.planIdentity })
      : invalidLineage();
  return advanceApprovedState(state, entry.stage, b);
}
function advanceApprovedState(
  state: BoundCheckpointState,
  stage: PipelineCheckpointEntry['stage'],
  b: PipelineCheckpointBinding
): Result<BoundCheckpointState, Error> {
  if (!sameIdentity(state.planIdentity, b.planIdentity)) return invalidLineage();
  if (stage === 'vote')
    return state.approval === undefined ? ok({ ...state, approval: b.approval }) : invalidLineage();
  if (
    state.approval === undefined ||
    b.decision?.voteRecordId !== state.approval.voteRecordId ||
    b.decision.recordHash !== state.approval.recordHash
  )
    return invalidLineage();
  return advanceTaskState(state, stage, b);
}
function advanceTaskState(
  state: BoundCheckpointState,
  stage: PipelineCheckpointEntry['stage'],
  b: PipelineCheckpointBinding
): Result<BoundCheckpointState, Error> {
  if (stage === 'decompose')
    return state.tasksIdentity === undefined
      ? ok({
          ...state,
          tasksIdentity: b.tasksIdentity,
          taskDefinitionsIdentity: b.taskDefinitionsIdentity,
        })
      : invalidLineage();
  if (state.tasksIdentity === undefined) return invalidLineage();
  if (stage === 'implement')
    return sameIdentity(state.taskDefinitionsIdentity, b.taskDefinitionsIdentity)
      ? ok({ ...state, implementedTasksIdentity: b.tasksIdentity })
      : invalidLineage();
  return state.implementedTasksIdentity === undefined ? invalidLineage() : ok(state);
}
