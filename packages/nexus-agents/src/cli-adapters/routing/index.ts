/**
 * nexus-agents/cli-adapters/routing
 *
 * Unified routing pipeline for CLI adapter selection.
 * Per ADR-0005, this consolidates 7 router implementations into
 * a composable stage-based architecture.
 *
 * @module cli-adapters/routing
 */

// Router stage interface and types
export type {
  CliName,
  RoutingContext,
  StageTrace,
  StageResult,
  StageError,
  RoutingDecision,
  RoutingOutcome,
  StageConfig,
  IRouterStage,
  IRoutingPipeline,
  PipelineStats,
} from './router-stage.js';

export {
  CliNameSchema,
  StageConfigSchema,
  RoutingOutcomeSchema,
  createRoutingContext,
  createStageError,
  addTrace,
  filterCandidate,
  updateScore,
  getRemainingCandidates,
  selectBestCandidate,
} from './router-stage.js';

// Pipeline implementation
export type { RoutingPipelineConfig } from './routing-pipeline.js';

export { RoutingPipeline, createRoutingPipeline } from './routing-pipeline.js';

// Pipeline stages
export {
  BudgetFilterStage,
  createBudgetStage,
  type BudgetStageConfig,
  ZeroRouterStage,
  createZeroStage,
  type ZeroStageConfig,
  PreferenceStage,
  createPreferenceStage,
  type PreferenceStageConfig,
  TopsisRouterStage,
  createTopsisStage,
  type TopsisStageConfig,
  LinUCBStage,
  createLinUCBStage,
  type LinUCBStageConfig,
  LatencyStage,
  createLatencyStage,
  type LatencyStageConfig,
  ResourceStrategyStage,
  createResourceStrategyStage,
  computeResourceTier,
  computeScoreAdjustments,
  type ResourceStrategyConfig,
  type ResourceTier,
} from './stages/index.js';
