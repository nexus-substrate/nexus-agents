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

/** Valid policy gate failure actions. */
const ON_FAIL_ACTIONS = ['block', 'warn', 'escalate'] as const;

// ============================================================================
// Derived Types
// ============================================================================

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type StageType = (typeof STAGE_TYPES)[number];
export type ArtifactType = (typeof ARTIFACT_TYPES)[number];
// OnFailAction is used implicitly by z.enum(ON_FAIL_ACTIONS)

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
  allSatisfied: z.boolean(),
});

/** Reference to an artifact by ID and type. */
export const ArtifactRefSchema = z.object({
  id: z.string().min(1),
  type: z.enum(ARTIFACT_TYPES),
});

/** Unified task lifecycle contract. */
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

/** Policy gate inserted between pipeline stages. */
export const PolicyGateSpecSchema = z.object({
  id: z.string().min(1),
  afterStage: z.string().min(1),
  beforeStage: z.string().min(1),
  rules: z.array(z.string().min(1)).min(1),
  onFail: z.enum(ON_FAIL_ACTIONS),
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
