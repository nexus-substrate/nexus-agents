/**
 * TaskContract + PlanContract — V2 Pipeline OS Core Types
 *
 * Unified task lifecycle and execution plan types with Zod validation.
 * These replace the 5+ task representations in V1 with a single contract.
 *
 * @see docs/v2/api-contracts.md
 * @see docs/v2/adrs/ADR-0002-unified-task-plan-artifact.md
 * @module pipeline/task-contract
 */
import { z } from 'zod';
import semver from 'semver';
import { ok, err, type Result } from '../core/result.js';

// ============================================================================
// Enforcement Mode & Obligation Schemas (Task T05, Milestone M1)
// ============================================================================

/** Enforcement mode for capabilities and evidence obligations (#5129, Task T05). */
export const EnforcementModeSchema = z.enum(['advisory', 'enforcing']);
export type EnforcementMode = z.infer<typeof EnforcementModeSchema>;

/** Explicit capability requirement specification (Task T05, Conformance Case C35). */
export const CapabilityRequirementSchema = z.object({
  id: z.string().min(1),
  operation: z.string().min(1),
  resourceRef: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
  mode: EnforcementModeSchema.default('enforcing'),
});
export type CapabilityRequirement = z.infer<typeof CapabilityRequirementSchema>;

/** Explicit evidence obligation specification (Task T05, Conformance Case C07). */
export const EvidenceObligationSchema = z.object({
  id: z.string().min(1),
  artifactRef: z.string().min(1),
  claim: z.string().min(1).optional(),
  required: z.boolean().default(true),
  mode: EnforcementModeSchema.default('enforcing'),
  receiptIssuer: z.string().min(1).optional(),
});
export type EvidenceObligation = z.infer<typeof EvidenceObligationSchema>;

/** Verified evidence receipt issued by an executor or validation stage. */
export interface EvidenceReceipt {
  readonly obligationId: string;
  readonly artifactRef: string;
  readonly digest?: string;
  readonly issuer?: string;
  readonly verified: boolean;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

// ============================================================================
// Constants
// ============================================================================

/** All valid task lifecycle statuses. */
export const TASK_STATUSES = [
  'intake',
  'clarifying',
  'planning',
  'approved',
  'executing',
  'validating',
  'done',
  'failed',
] as const;

/** All valid pipeline stage types. */
export const STAGE_TYPES = [
  'analyze',
  'route',
  'execute',
  'validate',
  'aggregate',
  'gate',
] as const;

/** All valid artifact types. */
export const ARTIFACT_TYPES = [
  'code',
  'review',
  'plan',
  'test',
  'report',
  'vote',
  'spec',
  'analysis',
] as const;

// ============================================================================
// Derived Types
// ============================================================================

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type StageType = (typeof STAGE_TYPES)[number];
export type ArtifactType = (typeof ARTIFACT_TYPES)[number];

// ============================================================================
// Zod Schemas
// ============================================================================

/**
 * Lightweight analysis summary embedded in the TaskContract.
 * Full TaskAnalysisResult lives in the V1 analyzer — this is the
 * subset that the pipeline needs for routing and policy decisions.
 */
const TaskAnalysisSummarySchema = z.object({
  complexity: z.string().min(1),
  taskType: z.string().min(1),
  ambiguityScore: z.number().min(0).max(1),
});

/**
 * Constraints the task analyzer RECOGNIZED in the task text (#5923). An empty
 * `scope` and absent `time`/`quality` mean none were recognized, not that the
 * task has no constraints.
 */
const TaskConstraintsSummarySchema = z.object({
  time: z.string().optional(),
  quality: z.string().optional(),
  scope: z.array(z.string()),
});

const RequiredCapabilitiesSummarySchema = z.object({
  tools: z.array(z.string()),
  experts: z.array(z.string()),
});

const CapabilityGapSummarySchema = z.object({
  available: z.object({
    tools: z.array(z.string()),
    experts: z.array(z.string()),
  }),
  gaps: z.array(z.unknown()),
  /**
   * Meaningful ONLY when `gapsMeasured` is true. `gaps: []` from a detector
   * that ran and `gaps: []` from a builder that never called one are
   * byte-identical on the wire; this field is what tells them apart.
   */
  allSatisfied: z.boolean(),
  /**
   * Whether a capability-gap detector actually ran (#5919).
   *
   * `buildBaseTaskContract` runs the canonical detector on inferred
   * requirements for both entry points. Its report describes registry support,
   * not observed tool execution; inferred gaps retain their origin (#5923).
   *
   * Named for the vocabulary this repo already uses for exactly this —
   * `tokensMeasured`, `policyEvaluated`, `routerTypeMeasured`. A consumer that
   * needs a real answer must branch on this, not on `allSatisfied` alone.
   */
  gapsMeasured: z.boolean(),
});

/** Reference to an artifact by ID and type. */
export const ArtifactRefSchema = z.object({
  id: z.string().min(1),
  type: z.enum(ARTIFACT_TYPES),
});

/**
 * Unified task lifecycle contract.
 *
 * Capability representations note:
 * - `requiredCapabilities` and `capabilityGaps` track inferred or observed tool/expert
 *   capabilities from LLM task analysis.
 * - `capabilityRequirements` specifies explicit, declarative requirements with execution
 *   enforcement modes ('enforcing' | 'advisory') for worker dispatch gates.
 */
export const TaskContractSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  status: z.enum(TASK_STATUSES),
  analysis: TaskAnalysisSummarySchema,
  constraints: TaskConstraintsSummarySchema,
  requiredCapabilities: RequiredCapabilitiesSummarySchema,
  capabilityGaps: CapabilityGapSummarySchema,
  parentId: z.string().min(1).optional(),
  artifacts: z.array(ArtifactRefSchema),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.number(),
  updatedAt: z.number(),
  completedAt: z.number().optional(),
  error: z.string().optional(),
  contractVersion: z.string().optional(),
  capabilityRequirements: z.array(CapabilityRequirementSchema).optional(),
  evidenceObligations: z.array(EvidenceObligationSchema).optional(),
});

/** Pipeline stage specification. */
export const StageSpecSchema = z.object({
  id: z.string().min(1),
  type: z.enum(STAGE_TYPES),
  pluginId: z.string().min(1),
  inputArtifacts: z.array(z.string()),
  outputArtifacts: z.array(z.string()),
  dependencies: z.array(z.string()),
  config: z.record(z.string(), z.unknown()),
  preferredCli: z.string().min(1).optional(),
  maxRetries: z.number().int().min(0).optional(),
  timeoutMs: z.number().int().min(0).optional(),
});

/**
 * Policy gate inserted between pipeline stages.
 *
 * NOTE on enforcement (#4019): the gate's effective enforcement mode is resolved
 * SOLELY by the runtime enforcement bundle — `GatePolicyEnforcement.mode` (or
 * `NEXUS_POLICY_GATE_MODE`, warn-by-default per #3177). There is intentionally NO
 * per-gate fail-action field here: the former `onFail` enum was inert (consumed
 * nowhere — verified) and required every gate to declare a fail action that did
 * nothing, so authoring `onFail:'block'` gave a false sense of enforcement.
 * Removed (7/0 higher_order vote) so the contract cannot promise enforcement the
 * runtime won't deliver. Set the enforcement mode to make a gate block.
 */
export const PolicyGateSpecSchema = z.object({
  id: z.string().min(1),
  afterStage: z.string().min(1),
  beforeStage: z.string().min(1),
  rules: z.array(z.string().min(1)).min(1),
});

/** Cost estimate for a pipeline execution plan. */
export const CostEstimateSchema = z.object({
  totalTokensIn: z.number().int().min(0),
  totalTokensOut: z.number().int().min(0),
  estimatedCostUsd: z.number().min(0),
  modelCalls: z.number().int().min(0),
});

/** Execution plan contract. */
export const PlanContractSchema = z.object({
  taskId: z.string().min(1),
  stages: z.array(StageSpecSchema),
  policyGates: z.array(PolicyGateSpecSchema),
  estimatedCost: CostEstimateSchema,
  approvalRequired: z.boolean(),
  maxIterations: z.number().int().min(1),
  timeoutMs: z.number().int().min(1),
});

// ============================================================================
// Inferred Types
// ============================================================================

export type TaskContract = z.infer<typeof TaskContractSchema>;
export type PlanContract = z.infer<typeof PlanContractSchema>;
export type StageSpec = z.infer<typeof StageSpecSchema>;
export type PolicyGateSpec = z.infer<typeof PolicyGateSpecSchema>;
export type CostEstimate = z.infer<typeof CostEstimateSchema>;
export type ArtifactRef = z.infer<typeof ArtifactRefSchema>;

// ============================================================================
// Contract Verification & Obligation Helpers (Task T05, Milestone M1)
// ============================================================================

export interface ContractCompatibilityOptions {
  readonly requireExplicitVersion?: boolean;
}

function validateContractInput(
  contractInput: unknown,
  requireExplicitVersion?: boolean
): Result<Record<string, unknown>, string> {
  if (typeof contractInput !== 'object' || contractInput === null) {
    return err('InvalidContractFormat: contract must be an object');
  }
  const raw = contractInput as Record<string, unknown>;
  if (
    requireExplicitVersion === true &&
    (typeof raw.contractVersion !== 'string' || raw.contractVersion.trim().length === 0)
  ) {
    return err('UnversionedContractError: explicit contractVersion required');
  }
  return ok(raw);
}

function validateVersionRange(
  version: string,
  minVersion: string,
  maxVersion: string
): Result<string, string> {
  if (semver.valid(version) === null) {
    return err(`InvalidContractVersion: malformed semver "${version}"`);
  }
  if (semver.lt(version, minVersion) || semver.gt(version, maxVersion)) {
    return err(
      `UnsupportedContractVersion: version ${version} is outside supported range [${minVersion}, ${maxVersion}]`
    );
  }
  return ok(version);
}

/**
 * Validates version compatibility for a TaskContract (Conformance Case C35: Legacy client enforcing downgrade).
 * Malformed, unversioned (when required), or unsupported contract versions fail closed.
 */
export function checkContractCompatibility(
  contractInput: unknown,
  supportedMinVersion = '1.0.0',
  supportedMaxVersion = '1.9.9',
  options: ContractCompatibilityOptions = {}
): Result<TaskContract, string> {
  const inputCheck = validateContractInput(contractInput, options.requireExplicitVersion);
  if (!inputCheck.ok) {
    return err(inputCheck.error);
  }

  const parsed = TaskContractSchema.safeParse(contractInput);
  if (!parsed.success) {
    return err(`InvalidTaskContract: ${parsed.error.message}`);
  }

  const rawVersion = parsed.data.contractVersion;
  if (options.requireExplicitVersion === true && rawVersion === undefined) {
    return err('UnversionedContractError: explicit contractVersion required');
  }

  const versionCheck = validateVersionRange(
    rawVersion ?? '1.0.0',
    supportedMinVersion,
    supportedMaxVersion
  );
  if (!versionCheck.ok) {
    return err(versionCheck.error);
  }

  return ok({
    ...parsed.data,
    contractVersion: versionCheck.value,
  });
}

export interface ObligationCompletenessOptions {
  readonly requireEnforcingObligations?: boolean;
}

export interface ObligationCompletenessResult {
  readonly fulfilled: readonly string[];
  readonly missing: readonly string[];
  readonly unmetAdvisory: readonly string[];
}

/**
 * Validates evidence obligation completeness against provided receipts (Conformance Case C06).
 * A task cannot be declared eligible or complete while enforcing obligations remain unmet.
 * Receipts must match on obligationId, artifactRef, and verified status.
 */
export function validateObligationCompleteness(
  contract: TaskContract,
  receipts: readonly EvidenceReceipt[],
  options: ObligationCompletenessOptions = {}
): Result<ObligationCompletenessResult, string> {
  const obligations = contract.evidenceObligations ?? [];
  const enforcingObligations = obligations.filter((o) => o.mode === 'enforcing');
  if (options.requireEnforcingObligations === true && enforcingObligations.length === 0) {
    return err('ZeroObligationsRejectedInEnforcingMode: contract has zero enforcing obligations');
  }

  const fulfilled: string[] = [];
  const missing: string[] = [];
  const unmetAdvisory: string[] = [];

  for (const obligation of obligations) {
    const matchingReceipt = receipts.find(
      (r) =>
        r.obligationId === obligation.id &&
        r.artifactRef === obligation.artifactRef &&
        r.verified &&
        (obligation.receiptIssuer === undefined || r.issuer === obligation.receiptIssuer)
    );

    if (matchingReceipt !== undefined) {
      fulfilled.push(obligation.id);
    } else if (obligation.mode === 'enforcing' && obligation.required) {
      missing.push(obligation.id);
    } else {
      unmetAdvisory.push(obligation.id);
    }
  }

  if (missing.length > 0) {
    const missingDetails = missing
      .map((id) => {
        const ob = obligations.find((o) => o.id === id);
        return ob !== undefined ? `${ob.id} (${ob.artifactRef})` : id;
      })
      .join(', ');
    return err(
      `MissingEnforcingObligationError: required obligations lack verified receipt: ${missingDetails}`
    );
  }

  return ok({ fulfilled, missing: [], unmetAdvisory });
}

export interface CapabilityDetectionResult {
  readonly satisfied: boolean;
  readonly missingEnforcing: readonly CapabilityRequirement[];
  readonly missingAdvisory: readonly CapabilityRequirement[];
}

/**
 * Detects missing capability requirements against available worker operations (Conformance Case C35).
 */
export function detectMissingCapabilities(
  required: readonly CapabilityRequirement[],
  available: readonly string[]
): CapabilityDetectionResult {
  const availableSet = new Set(available);
  const missingEnforcing: CapabilityRequirement[] = [];
  const missingAdvisory: CapabilityRequirement[] = [];

  for (const req of required) {
    if (!availableSet.has(req.operation)) {
      if (req.mode === 'enforcing') {
        missingEnforcing.push(req);
      } else {
        missingAdvisory.push(req);
      }
    }
  }

  return {
    satisfied: missingEnforcing.length === 0,
    missingEnforcing,
    missingAdvisory,
  };
}
