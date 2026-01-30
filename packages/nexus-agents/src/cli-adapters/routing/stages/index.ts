/**
 * Router Pipeline Stages
 *
 * Composable routing stages implementing IRouterStage.
 * Each stage can filter, score, or transform the routing context.
 *
 * @module cli-adapters/routing/stages
 * (Source: ADR-0005)
 */

// Budget filter stage (priority: 20)
export { BudgetFilterStage, createBudgetStage, type BudgetStageConfig } from './budget-stage.js';

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

// Latency performance stage (priority: 80)
export { LatencyStage, createLatencyStage, type LatencyStageConfig } from './latency-stage.js';
