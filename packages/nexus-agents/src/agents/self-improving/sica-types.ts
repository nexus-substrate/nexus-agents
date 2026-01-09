/**
 * nexus-agents/agents - SICA Self-Improving Agent Types
 *
 * Types for implementing SICA (Self-Improving Coding Agent) pattern.
 * A unified agent that performs tasks AND improves its own implementation
 * through tool orchestration, without weight updates.
 *
 * @module agents/self-improving/sica-types
 * (Source: arXiv:2504.15228, Issue #151)
 */

/**
 * Unique identifier for an agent version.
 */
export type VersionId = string;

/**
 * Status of an agent version.
 */
export type VersionStatus = 'active' | 'superseded' | 'deprecated' | 'experimental';

/**
 * Configuration that can be modified to improve the agent.
 */
export interface AgentConfiguration {
  /** System prompt template */
  readonly systemPrompt: string;
  /** Temperature for generation (0-1) */
  readonly temperature: number;
  /** Maximum tokens per response */
  readonly maxTokens: number;
  /** Additional configuration parameters */
  readonly parameters: Record<string, unknown>;
  /** Tool preferences or restrictions */
  readonly toolPreferences?: readonly string[];
}

/**
 * A versioned snapshot of an agent's configuration.
 */
export interface AgentVersion {
  /** Unique version identifier */
  readonly id: VersionId;
  /** Semantic version string (e.g., "1.0.0") */
  readonly version: string;
  /** Parent version this was derived from (null for initial) */
  readonly parentVersion: VersionId | null;
  /** The configuration for this version */
  readonly configuration: AgentConfiguration;
  /** When this version was created */
  readonly createdAt: Date;
  /** Status of this version */
  readonly status: VersionStatus;
  /** Improvement hypothesis that led to this version */
  readonly improvementRationale?: string;
}

/**
 * Metrics for a single task execution.
 */
export interface ExecutionMetrics {
  /** Time taken in milliseconds */
  readonly durationMs: number;
  /** Tokens consumed */
  readonly tokensUsed: number;
  /** Whether the task succeeded */
  readonly success: boolean;
  /** Quality score if available (0-1) */
  readonly qualityScore?: number;
  /** Error type if failed */
  readonly errorType?: string;
}

/**
 * Aggregated performance metrics for a version.
 */
export interface VersionMetrics {
  /** Version this metrics object belongs to */
  readonly versionId: VersionId;
  /** Total number of executions */
  readonly executionCount: number;
  /** Number of successful executions */
  readonly successCount: number;
  /** Success rate (0-1) */
  readonly successRate: number;
  /** Average execution time in ms */
  readonly avgDurationMs: number;
  /** Average tokens used per execution */
  readonly avgTokensUsed: number;
  /** Average quality score if available (0-1) */
  readonly avgQualityScore?: number;
  /** When metrics were last updated */
  readonly lastUpdatedAt: Date;
}

/**
 * Record of an improvement attempt.
 */
export interface ImprovementAttempt {
  /** Unique identifier */
  readonly id: string;
  /** Version being improved */
  readonly sourceVersionId: VersionId;
  /** New version created (if successful) */
  readonly resultVersionId?: VersionId;
  /** Improvement hypothesis */
  readonly hypothesis: string;
  /** What was changed */
  readonly changes: readonly ConfigurationChange[];
  /** Whether the attempt was successful */
  readonly successful: boolean;
  /** When the attempt was made */
  readonly attemptedAt: Date;
  /** Validation results */
  readonly validation?: ImprovementValidation;
}

/**
 * A single configuration change.
 */
export interface ConfigurationChange {
  /** What field was changed */
  readonly field: keyof AgentConfiguration;
  /** Previous value */
  readonly oldValue: unknown;
  /** New value */
  readonly newValue: unknown;
  /** Reason for the change */
  readonly reason: string;
}

/**
 * Validation of an improvement.
 */
export interface ImprovementValidation {
  /** Whether validation passed */
  readonly passed: boolean;
  /** Performance comparison */
  readonly performanceChange: number;
  /** Specific validation checks */
  readonly checks: readonly ValidationCheck[];
}

/**
 * A single validation check.
 */
export interface ValidationCheck {
  /** Check name */
  readonly name: string;
  /** Whether it passed */
  readonly passed: boolean;
  /** Details */
  readonly details?: string;
}

/**
 * Configuration for the self-improving agent.
 */
export interface SicaConfig {
  /** Minimum executions before considering improvement */
  readonly minExecutionsForImprovement: number;
  /** Success rate threshold to trigger improvement (0-1) */
  readonly improvementThreshold: number;
  /** Maximum concurrent versions to evaluate */
  readonly maxActiveVersions: number;
  /** Whether to auto-select best version */
  readonly autoSelectBest: boolean;
  /** Improvement cooldown in milliseconds */
  readonly improvementCooldownMs: number;
  /** Enable observability logging */
  readonly enableObservability: boolean;
}

/**
 * Default SICA configuration.
 */
export const DEFAULT_SICA_CONFIG: SicaConfig = {
  minExecutionsForImprovement: 10,
  improvementThreshold: 0.7,
  maxActiveVersions: 3,
  autoSelectBest: true,
  improvementCooldownMs: 60000,
  enableObservability: true,
};

/**
 * Observability event types for SICA.
 */
export type SicaEventType =
  | 'version_created'
  | 'version_activated'
  | 'version_deprecated'
  | 'execution_started'
  | 'execution_completed'
  | 'improvement_triggered'
  | 'improvement_validated'
  | 'improvement_rejected'
  | 'best_version_selected';

/**
 * Observability event for SICA operations.
 */
export interface SicaEvent {
  /** Event type */
  readonly type: SicaEventType;
  /** When the event occurred */
  readonly timestamp: Date;
  /** Associated version ID */
  readonly versionId?: VersionId;
  /** Event details */
  readonly details: Record<string, unknown>;
}

/**
 * Result of a SICA execution.
 */
export interface SicaExecutionResult {
  /** The output */
  readonly output: string;
  /** Version used for execution */
  readonly versionId: VersionId;
  /** Execution metrics */
  readonly metrics: ExecutionMetrics;
  /** Whether this triggered an improvement attempt */
  readonly triggeredImprovement: boolean;
}

/**
 * Options for creating an improvement.
 */
export interface ImprovementOptions {
  /** Focus area for improvement */
  readonly focusArea?: 'speed' | 'quality' | 'reliability' | 'cost';
  /** Constraints on what can be changed */
  readonly constraints?: readonly string[];
  /** Force improvement even if not triggered */
  readonly force?: boolean;
}
