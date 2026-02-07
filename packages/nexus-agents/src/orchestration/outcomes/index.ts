/**
 * Task outcome tracking module.
 *
 * Records and aggregates results of model delegation and consensus
 * decisions to enable performance measurement.
 *
 * @module orchestration/outcomes
 * (Source: Issue #861 — Task outcome tracking)
 */

export type {
  TaskOutcome,
  OutcomeQuery,
  OutcomeSource,
  PerformanceSummary,
  GroupStats,
} from './outcome-types.js';
export { TaskOutcomeSchema, OutcomeQuerySchema } from './outcome-types.js';
export {
  OutcomeStore,
  getOutcomeStore,
  resetOutcomeStore,
  type OutcomeStoreConfig,
} from './outcome-store.js';
