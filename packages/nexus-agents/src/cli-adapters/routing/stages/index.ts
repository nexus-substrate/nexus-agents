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

// Budget filter stage (priority: 20)
export { BudgetFilterStage, createBudgetStage, type BudgetStageConfig } from './budget-stage.js';

// Capability match stage (priority: 35)
export {
  CapabilityMatchStage,
  createCapabilityMatchStage,
  type CapabilityMatchConfig,
} from './capability-match-stage.js';

// Zero difficulty stage (priority: 40)
export { ZeroRouterStage, createZeroStage, type ZeroStageConfig } from './zero-stage.js';

// Preference stage (priority: 50)
export {
  PreferenceStage,
  createPreferenceStage,
  type PreferenceStageConfig,
} from './preference-stage.js';

// TOPSIS multi-criteria stage (priority: 60)
export { TopsisRouterStage, createTopsisStage, type TopsisStageConfig } from './topsis-stage.js';

// LinUCB bandit stage (priority: 70)
export { LinUCBStage, createLinUCBStage, type LinUCBStageConfig } from './linucb-stage.js';

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

// Latency performance stage (priority: 80)
export { LatencyStage, createLatencyStage, type LatencyStageConfig } from './latency-stage.js';
