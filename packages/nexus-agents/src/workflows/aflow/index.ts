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

// Evaluation
export type { EvaluationWeights } from './evaluation.js';
export {
  WorkflowEvaluator,
  createWorkflowEvaluator,
  DEFAULT_EVALUATION_WEIGHTS,
} from './evaluation.js';

// AFlow Generator
export {
  AFlowGenerator,
  AFlowError,
  createAFlowGenerator,
  generateWorkflow,
} from './aflow-generator.js';
export type { AFlowErrorCode } from './aflow-generator.js';
