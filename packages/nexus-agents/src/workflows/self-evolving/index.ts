/**
 * nexus-agents/workflows - Self-Evolving Workflows (SEW)
 *
 * Self-evolving workflows automatically improve through execution feedback.
 * Workflows learn optimal parameters (timeouts, retries, ordering) through experience.
 *
 * @module workflows/self-evolving
 * (Source: Issue #330)
 */

// Types and schemas
export type {
  SemanticVersion,
  FitnessMetrics,
  FitnessWeights,
  WorkflowVersion,
  MutationType,
  WorkflowMutation,
  TimeoutAdjustment,
  RetryAdjustment,
  StepReorder,
  ParallelizationChange,
  EvolutionConfig,
  ExecutionOutcome,
  EvolutionHistoryEntry,
  EvolutionResult,
} from './sew-types.js';

export {
  parseVersion,
  formatVersion,
  incrementVersion,
  computeFitnessScore,
  stepsAreDependent,
  findReorderableSteps,
  findParallelizableSteps,
  DEFAULT_FITNESS_METRICS,
  DEFAULT_FITNESS_WEIGHTS,
  DEFAULT_EVOLUTION_CONFIG,
  EvolutionConfigSchema,
} from './sew-types.js';

// Mutation operators
export {
  adjustTimeout,
  adjustRetries,
  reorderSteps,
  addParallelization,
  removeParallelization,
  randomTimeoutFactor,
  randomRetryDelta,
  applyRandomMutation,
  createMutant,
  describeMutation,
} from './mutation-operators.js';

// Workflow evolver
export { WorkflowEvolver, createWorkflowEvolver } from './workflow-evolver.js';
