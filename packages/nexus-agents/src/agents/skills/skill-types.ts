/**
 * nexus-agents/agents - Voyager Skill Library Types
 *
 * Types for implementing the Voyager skill library pattern:
 * an ever-growing library of executable code skills built through
 * environmental interaction with automatic curriculum learning.
 *
 * @module agents/skills/skill-types
 * (Source: arXiv:2305.16291, Issue #150)
 */

/**
 * Skill complexity levels.
 */
export type SkillComplexity = 'primitive' | 'simple' | 'moderate' | 'complex' | 'composite';

/**
 * Skill execution status.
 */
export type SkillExecutionStatus = 'success' | 'failure' | 'timeout' | 'error';

/**
 * Skill categories for organization.
 */
export type SkillCategory =
  | 'file-operations'
  | 'code-generation'
  | 'code-analysis'
  | 'testing'
  | 'documentation'
  | 'refactoring'
  | 'debugging'
  | 'deployment'
  | 'general';

/**
 * A single skill in the library.
 */
export interface Skill {
  /** Unique identifier */
  readonly id: string;
  /** Human-readable name */
  readonly name: string;
  /** Detailed description of what the skill does */
  readonly description: string;
  /** Category for organization */
  readonly category: SkillCategory;
  /** Complexity level */
  readonly complexity: SkillComplexity;
  /** The executable code (function body) */
  readonly code: string;
  /** Input parameter definitions */
  readonly parameters: readonly SkillParameter[];
  /** Expected output type description */
  readonly outputType: string;
  /** Skills this depends on (for composition) */
  readonly dependencies: readonly string[];
  /** Keywords for search/retrieval */
  readonly tags: readonly string[];
  /** Usage example(s) */
  readonly examples: readonly SkillExample[];
  /** When the skill was created */
  readonly createdAt: Date;
  /** When the skill was last modified */
  readonly updatedAt: Date;
  /** Version number for tracking changes */
  readonly version: number;
}

/**
 * Parameter definition for a skill.
 */
export interface SkillParameter {
  /** Parameter name */
  readonly name: string;
  /** Type description */
  readonly type: string;
  /** Parameter description */
  readonly description: string;
  /** Whether the parameter is required */
  readonly required: boolean;
  /** Default value if not required */
  readonly defaultValue?: unknown;
}

/**
 * Example usage of a skill.
 */
export interface SkillExample {
  /** Description of what this example demonstrates */
  readonly description: string;
  /** Input values */
  readonly input: Record<string, unknown>;
  /** Expected output */
  readonly expectedOutput: string;
}

/**
 * Record of a skill execution.
 */
export interface SkillExecution {
  /** ID of the skill executed */
  readonly skillId: string;
  /** When the execution started */
  readonly startTime: Date;
  /** When the execution ended */
  readonly endTime: Date;
  /** Execution status */
  readonly status: SkillExecutionStatus;
  /** Input provided */
  readonly input: Record<string, unknown>;
  /** Output produced (if successful) */
  readonly output?: string;
  /** Error message (if failed) */
  readonly errorMessage?: string;
  /** Context in which the skill was used */
  readonly context?: string;
}

/**
 * Skill performance metrics.
 */
export interface SkillMetrics {
  /** Total number of executions */
  readonly executionCount: number;
  /** Number of successful executions */
  readonly successCount: number;
  /** Average execution time in milliseconds */
  readonly avgExecutionTimeMs: number;
  /** Success rate (0-1) */
  readonly successRate: number;
  /** Last execution time */
  readonly lastExecutedAt?: Date;
}

/**
 * A skill with its execution metrics.
 */
export interface SkillWithMetrics extends Skill {
  /** Execution metrics */
  readonly metrics: SkillMetrics;
}

/**
 * Query options for skill retrieval.
 */
export interface SkillQuery {
  /** Search in name and description */
  readonly search?: string;
  /** Filter by category */
  readonly category?: SkillCategory;
  /** Filter by complexity */
  readonly complexity?: SkillComplexity;
  /** Filter by tags (any match) */
  readonly tags?: readonly string[];
  /** Minimum success rate */
  readonly minSuccessRate?: number;
  /** Maximum number of results */
  readonly limit?: number;
  /** Sort by field */
  readonly sortBy?: 'name' | 'successRate' | 'executionCount' | 'createdAt';
  /** Sort direction */
  readonly sortOrder?: 'asc' | 'desc';
}

/**
 * Result of a skill search.
 */
export interface SkillSearchResult {
  /** Matching skills with metrics */
  readonly skills: readonly SkillWithMetrics[];
  /** Total number of matches (before limit) */
  readonly totalCount: number;
  /** Query that produced this result */
  readonly query: SkillQuery;
}

/**
 * Options for creating a new skill.
 */
export interface CreateSkillOptions {
  /** Human-readable name */
  readonly name: string;
  /** Detailed description */
  readonly description: string;
  /** Category */
  readonly category: SkillCategory;
  /** Complexity level */
  readonly complexity: SkillComplexity;
  /** The executable code */
  readonly code: string;
  /** Input parameters */
  readonly parameters: readonly SkillParameter[];
  /** Output type description */
  readonly outputType: string;
  /** Dependencies on other skills */
  readonly dependencies?: readonly string[];
  /** Search tags */
  readonly tags?: readonly string[];
  /** Usage examples */
  readonly examples?: readonly SkillExample[];
}

/**
 * Skill composition request.
 */
export interface SkillCompositionRequest {
  /** Task description to solve */
  readonly taskDescription: string;
  /** Available context */
  readonly context?: string;
  /** Preferred complexity limit */
  readonly maxComplexity?: SkillComplexity;
  /** Maximum number of skills to compose */
  readonly maxSkillCount?: number;
}

/**
 * A composed skill plan.
 */
export interface SkillComposition {
  /** Skills to execute in order */
  readonly steps: readonly CompositionStep[];
  /** Overall description */
  readonly description: string;
  /** Estimated complexity */
  readonly estimatedComplexity: SkillComplexity;
  /** Confidence in this composition (0-1) */
  readonly confidence: number;
}

/**
 * A single step in a skill composition.
 */
export interface CompositionStep {
  /** Step number (1-indexed) */
  readonly stepNumber: number;
  /** Skill to execute */
  readonly skillId: string;
  /** Skill name (for readability) */
  readonly skillName: string;
  /** How to bind input (from context or previous step) */
  readonly inputBinding: Record<string, InputBinding>;
  /** Description of what this step achieves */
  readonly purpose: string;
}

/**
 * Input binding for a composition step.
 */
export interface InputBinding {
  /** Source of the input value */
  readonly source: 'context' | 'previous-step' | 'literal';
  /** Key in context or step number */
  readonly key: string;
  /** Literal value (if source is 'literal') */
  readonly value?: unknown;
}

/**
 * Configuration for the skill library.
 */
export interface SkillLibraryConfig {
  /** Maximum skills to store */
  readonly maxSkills: number;
  /** Minimum success rate to keep skill (0-1) */
  readonly minSuccessRateForRetention: number;
  /** Number of executions before evaluating retention */
  readonly executionsBeforeEvaluation: number;
  /** Enable automatic skill pruning */
  readonly enablePruning: boolean;
  /** Whether to track detailed execution history */
  readonly trackExecutionHistory: boolean;
  /** Maximum execution history entries per skill */
  readonly maxHistoryPerSkill: number;
}

/**
 * Default skill library configuration.
 */
export const DEFAULT_SKILL_LIBRARY_CONFIG: SkillLibraryConfig = {
  maxSkills: 1000,
  minSuccessRateForRetention: 0.3,
  executionsBeforeEvaluation: 5,
  enablePruning: true,
  trackExecutionHistory: true,
  maxHistoryPerSkill: 100,
};

/**
 * Complexity ordering for comparisons.
 */
export const COMPLEXITY_ORDER: Record<SkillComplexity, number> = {
  primitive: 1,
  simple: 2,
  moderate: 3,
  complex: 4,
  composite: 5,
};

/**
 * Library statistics.
 */
export interface LibraryStatistics {
  readonly totalSkills: number;
  readonly totalExecutions: number;
  readonly overallSuccessRate: number;
  readonly skillsByCategory: Record<string, number>;
  readonly skillsByComplexity: Partial<Record<SkillComplexity, number>>;
}

/**
 * Common stop words to filter from searches.
 */
export const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'but',
  'in',
  'on',
  'at',
  'to',
  'for',
  'of',
  'with',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'must',
  'can',
  'this',
  'that',
  'these',
  'those',
  'it',
  'its',
]);
