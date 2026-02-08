/**
 * Pipeline module — V2 Pipeline OS core types and execution.
 *
 * @see docs/v2/04-v2-architecture-pipeline-os.md
 * @module pipeline
 */
export {
  // Schemas
  TaskContractSchema,
  PlanContractSchema,
  StageSpecSchema,
  PolicyGateSpecSchema,
  CostEstimateSchema,
  ArtifactRefSchema,
  // Constants
  TASK_STATUSES,
  STAGE_TYPES,
  ARTIFACT_TYPES,
  // Types
  type TaskContract,
  type TaskStatus,
  type PlanContract,
  type StageSpec,
  type StageType,
  type PolicyGateSpec,
  type CostEstimate,
  type ArtifactRef,
  type ArtifactType,
} from './task-contract.js';

export {
  analysisToTaskContract,
  taskContractToToolResponse,
  type TaskToolResponse,
} from './v1-adapters.js';
