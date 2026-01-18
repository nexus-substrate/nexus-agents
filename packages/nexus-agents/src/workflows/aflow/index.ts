/**
 * nexus-agents/workflows - AFlow Module
 *
 * AFlow MCTS-based automatic workflow generation.
 * Uses Monte Carlo Tree Search to discover optimal workflow structures.
 *
 * @module workflows/aflow
 * (Source: Issue #329, arXiv:2410.10762)
 */

// Types and schemas
export type {
  ActionType,
  WorkflowAction,
  StepModifications,
  MCTSNode,
  UCTScore,
  EvaluationResult,
  AFlowConfig,
  TaskSpecification,
  TaskConstraints,
  AFlowResult,
  SearchHistoryEntry,
  MCTSStats,
  ActionSpaceConfig,
} from './aflow-types.js';

export {
  DEFAULT_AFLOW_CONFIG,
  AFlowConfigSchema,
  DEFAULT_ACTION_SPACE_CONFIG,
} from './aflow-types.js';

// MCTS Tree
export { MCTSTree, createMCTSTree } from './mcts-tree.js';

// Action Space
export { ActionSpace, createActionSpace } from './action-space.js';

// Action Generators (for advanced usage)
export {
  generateAddStepActions,
  generateRemoveStepActions,
  generateModifyStepActions,
  generateDependencyActions,
  generateParallelActions,
  createAddStepActionsForAgent,
  wouldCreateCycle,
} from './action-generators.js';

// Action Applicators (for advanced usage)
export {
  applyAction,
  applyAddStep,
  applyRemoveStep,
  applyModifyStep,
  applyAddDependency,
  applyRemoveDependency,
  applySetParallel,
  applyModifications,
} from './action-applicators.js';

// Action Sampling (for advanced usage)
export {
  sampleAction,
  sampleWithTemperature,
  isTerminateAction,
  describeAction,
  createSeededRandom,
} from './action-sampling.js';
export type { RandomGenerator } from './action-sampling.js';

// Evaluation (main evaluator class)
export type { EvaluationWeights } from './evaluation.js';
export {
  WorkflowEvaluator,
  createWorkflowEvaluator,
  DEFAULT_EVALUATION_WEIGHTS,
} from './evaluation.js';

// Evaluation utilities (for direct access)
export { VALID_AGENT_ROLES, CAPABILITY_ACTION_MAPPING, COST_MODEL } from './evaluation-types.js';

export {
  evaluateStructure,
  hasValidSteps,
  hasNoCycles,
  hasValidDependencies,
  hasUniqueStepIds,
  hasValidAgentRoles,
  isViableWorkflow,
} from './evaluation-structure.js';

export {
  evaluateEfficiency,
  calculateParallelismScore,
  calculateDependencyEfficiency,
  calculateTimeoutScore,
  calculateStepCountScore,
  calculateRedundancyPenalty,
  estimateCost,
} from './evaluation-efficiency.js';

export {
  evaluateCompleteness,
  calculateAgentCoverageScore,
  calculateCapabilityCoverageScore,
  calculateConstraintScore,
  generateFeedback,
} from './evaluation-completeness.js';

// AFlow Generator
export {
  AFlowGenerator,
  AFlowError,
  createAFlowGenerator,
  generateWorkflow,
} from './aflow-generator.js';
export type { AFlowErrorCode } from './aflow-generator.js';
