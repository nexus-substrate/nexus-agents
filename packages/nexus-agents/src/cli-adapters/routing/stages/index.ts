/**
 * Router Pipeline Stages
 *
 * Composable routing stages implementing IRouterStage.
 * Each stage can filter, score, or transform the routing context.
 *
 * @module cli-adapters/routing/stages
 * (Source: ADR-0005)
 */

// Confidence cascade stage (priority: 10)
export {
  ConfidenceCascadeStage,
  createConfidenceCascadeStage,
  type ConfidenceCascadeConfig,
} from './confidence-cascade-stage.js';

// Capability match stage (priority: 35)
export {
  CapabilityMatchStage,
  createCapabilityMatchStage,
  type CapabilityMatchConfig,
} from './capability-match-stage.js';

// Quality constraint stage (priority: 75)
export {
  QualityConstraintStage,
  createQualityConstraintStage,
  type QualityConstraintConfig,
} from './quality-constraint-stage.js';

// Resource strategy stage (priority: 55)
export {
  ResourceStrategyStage,
  createResourceStrategyStage,
  computeResourceTier,
  computeScoreAdjustments,
  type ResourceStrategyConfig,
  type ResourceTier,
} from './resource-strategy-stage.js';

// Distilled rule stage (priority: 45)
export {
  DistilledRuleStage,
  createDistilledRuleStage,
  type DistilledRuleStageConfig,
} from './distilled-rule-stage.js';

// KNN routing stage (priority: 38)
export {
  KnnRoutingStage,
  createKnnRoutingStage,
  type KnnRoutingConfig,
} from './knn-routing-stage.js';

// Capacity filter stage (priority: 25 — see the note on the class; CompositeRouter
// takes stage order from call position, not this number) (#4373, #4351 criterion 3)
export {
  CapacityFilterStage,
  createCapacityStage,
  assessCapacity,
  CAPACITY_EXHAUSTED,
  type CapacityStageConfig,
} from './capacity-stage.js';
