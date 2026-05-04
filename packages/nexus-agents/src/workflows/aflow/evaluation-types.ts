/**
 * nexus-agents/workflows - AFlow Evaluation Types
 *
 * Shared types and constants for workflow evaluation.
 *
 * @module workflows/aflow/evaluation-types
 * (Source: Issue #329, arXiv:2410.10762)
 */

/**
 * Weights for evaluation components.
 */
export interface EvaluationWeights {
  readonly structure: number;
  readonly efficiency: number;
  readonly completeness: number;
  readonly redundancyPenalty: number;
}

/**
 * Default evaluation weights.
 */
export const DEFAULT_EVALUATION_WEIGHTS: EvaluationWeights = {
  structure: 0.3,
  efficiency: 0.25,
  completeness: 0.35,
  redundancyPenalty: 0.1,
};

/**
 * Valid agent roles for workflow steps.
 */
export const VALID_AGENT_ROLES = new Set<string>([
  'orchestrator',
  'code_expert',
  'security_expert',
  'architecture_expert',
  'documentation_expert',
  'testing_expert',
  'thinker',
  'worker',
  'verifier',
  'custom',
]);

/**
 * Mapping of capabilities to action keywords.
 */
export const CAPABILITY_ACTION_MAPPING: Record<string, string[]> = {
  code: ['implement', 'code', 'develop'],
  security: ['review', 'audit', 'scan'],
  testing: ['test', 'verify', 'validate'],
  architecture: ['design', 'architect', 'plan'],
  documentation: ['document', 'explain', 'describe'],
};

/**
 * Cost model constants for workflow estimation.
 */
export const COST_MODEL = {
  baseCostPerStep: 100,
  costPerRetry: 50,
  costPerTimeoutMs: 0.001,
  defaultTimeoutMs: 60000,
} as const;
