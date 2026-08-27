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

// Pipeline stages
export {
  ResourceStrategyStage,
  createResourceStrategyStage,
  computeResourceTier,
  computeScoreAdjustments,
  type ResourceStrategyConfig,
  type ResourceTier,
  DistilledRuleStage,
  createDistilledRuleStage,
  type DistilledRuleStageConfig,
} from './stages/index.js';
