/**
 * nexus-agents/agents - Constitutional AI Types
 *
 * Types for Constitutional AI self-critique protocol that enables
 * agents to evaluate and revise outputs against explicit principles.
 *
 * @module agents/collaboration/constitutional-types
 * (Source: arXiv:2212.08073, Issue #147)
 */

/**
 * Example of a principle violation and its correction.
 */
export interface PrincipleExample {
  /** Example of violating the principle */
  readonly violation: string;
  /** Corrected version that adheres to the principle */
  readonly correction: string;
  /** Explanation of why this is a violation */
  readonly explanation?: string;
}

/**
 * A single principle in a constitution.
 */
export interface Principle {
  /** Unique identifier for the principle */
  readonly id: string;
  /** Human-readable name */
  readonly name: string;
  /** Detailed description of the principle */
  readonly description: string;
  /** Category for grouping (e.g., 'security', 'quality', 'style') */
  readonly category?: string;
  /** Severity when violated: critical, high, medium, low */
  readonly defaultSeverity: ViolationSeverity;
  /** Examples of violations and corrections */
  readonly examples: readonly PrincipleExample[];
}

/**
 * Severity levels for principle violations.
 */
export type ViolationSeverity = 'critical' | 'high' | 'medium' | 'low';

/**
 * A constitution defining principles for evaluation.
 */
export interface Constitution {
  /** Constitution identifier */
  readonly id: string;
  /** Version string */
  readonly version: string;
  /** Human-readable name */
  readonly name: string;
  /** Description of what this constitution covers */
  readonly description: string;
  /** The principles in this constitution */
  readonly principles: readonly Principle[];
  /** When this constitution was last updated */
  readonly updatedAt?: Date;
}

/**
 * A single violation found during critique.
 */
export interface Violation {
  /** ID of the violated principle */
  readonly principleId: string;
  /** Name of the violated principle */
  readonly principleName: string;
  /** Severity of this violation */
  readonly severity: ViolationSeverity;
  /** Location in the output (line number, section, etc.) */
  readonly location?: string;
  /** Explanation of what was violated */
  readonly explanation: string;
  /** Suggested fix for the violation */
  readonly suggestedFix: string;
  /** Confidence in this violation detection (0-1) */
  readonly confidence: number;
}

/**
 * Result of a critique against a constitution.
 */
export interface CritiqueResult {
  /** The constitution used for critique */
  readonly constitutionId: string;
  /** List of violations found */
  readonly violations: readonly Violation[];
  /** Overall score (0-10, higher is better) */
  readonly overallScore: number;
  /** Whether the output passes the constitution (no critical/high violations) */
  readonly passesConstitution: boolean;
  /** Summary of the critique */
  readonly summary: string;
  /** Timestamp of critique */
  readonly timestamp: Date;
}

/**
 * A single revision iteration.
 */
export interface RevisionIteration {
  /** Iteration number (0-indexed) */
  readonly iteration: number;
  /** Output at this iteration */
  readonly output: string;
  /** Critique of this output */
  readonly critique: CritiqueResult;
  /** Changes made from previous iteration */
  readonly changesSummary?: string;
}

/**
 * Result of a full refinement process.
 */
export interface RefinementResult {
  /** Original input */
  readonly originalOutput: string;
  /** Final refined output */
  readonly refinedOutput: string;
  /** All iterations of refinement */
  readonly iterations: readonly RevisionIteration[];
  /** Total number of iterations */
  readonly totalIterations: number;
  /** Whether refinement converged (no more violations) */
  readonly converged: boolean;
  /** Final critique result */
  readonly finalCritique: CritiqueResult;
  /** Total time taken in ms */
  readonly durationMs: number;
}

/**
 * Configuration for Constitutional Critic.
 */
export interface ConstitutionalCriticConfig {
  /** Maximum iterations for refinement */
  readonly maxIterations: number;
  /** Minimum score to pass constitution (0-10) */
  readonly passingScore: number;
  /** Severities that must be fixed (violations at these levels fail) */
  readonly failingSeverities: readonly ViolationSeverity[];
  /** Whether to log detailed critique info */
  readonly verbose: boolean;
}

/**
 * Default configuration for Constitutional Critic.
 */
export const DEFAULT_CRITIC_CONFIG: ConstitutionalCriticConfig = {
  maxIterations: 3,
  passingScore: 7,
  failingSeverities: ['critical', 'high'],
  verbose: false,
};
