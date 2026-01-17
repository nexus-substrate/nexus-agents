/**
 * nexus-agents/mcp/safety - STPA Type Definitions
 *
 * System-Theoretic Process Analysis (STPA) types for MCP tool safety analysis.
 * STPA is a hazard analysis technique that identifies unsafe control actions
 * and generates safety constraints to prevent hazardous scenarios.
 *
 * (Source: Leveson, Engineering a Safer World, MIT Press 2011)
 */

import { z } from 'zod';

// =============================================================================
// Hazard Categories
// =============================================================================

/**
 * Categories of hazards that MCP tools can introduce.
 * Each category represents a class of potential system-level harm.
 */
export enum HazardCategory {
  /** Loss or corruption of user data */
  DATA_LOSS = 'data_loss',
  /** Unauthorized elevation of access rights */
  PRIVILEGE_ESCALATION = 'privilege_escalation',
  /** Exhaustion of system resources (CPU, memory, disk, network) */
  RESOURCE_EXHAUSTION = 'resource_exhaustion',
  /** Unauthorized exposure of sensitive information */
  INFORMATION_DISCLOSURE = 'information_disclosure',
  /** Execution of unauthorized or malicious commands */
  UNAUTHORIZED_EXECUTION = 'unauthorized_execution',
  /** Violation of system integrity boundaries */
  INTEGRITY_VIOLATION = 'integrity_violation',
  /** Denial of service through malformed input or overload */
  DENIAL_OF_SERVICE = 'denial_of_service',
  /** Injection of malicious content or commands */
  INJECTION = 'injection',
}

/**
 * Zod schema for HazardCategory validation.
 */
export const HazardCategorySchema = z.nativeEnum(HazardCategory);

// =============================================================================
// Severity and Likelihood
// =============================================================================

/**
 * Severity levels for potential hazards.
 */
export enum HazardSeverity {
  /** Catastrophic - system-wide impact, data loss, security breach */
  CRITICAL = 'critical',
  /** Serious - significant impact, partial data loss, degraded security */
  HIGH = 'high',
  /** Moderate - limited impact, recoverable */
  MEDIUM = 'medium',
  /** Minor - minimal impact, easily recoverable */
  LOW = 'low',
}

/**
 * Likelihood levels for hazard occurrence.
 */
export enum HazardLikelihood {
  /** Almost certain to occur under normal conditions */
  ALMOST_CERTAIN = 'almost_certain',
  /** Likely to occur during typical usage */
  LIKELY = 'likely',
  /** Possible under certain conditions */
  POSSIBLE = 'possible',
  /** Unlikely but not impossible */
  UNLIKELY = 'unlikely',
  /** Very rare, requires exceptional circumstances */
  RARE = 'rare',
}

// =============================================================================
// Unsafe Control Action Types
// =============================================================================

/**
 * Types of unsafe control actions in STPA terminology.
 * These represent the four ways a control action can be unsafe.
 */
export enum UnsafeControlActionType {
  /** Control action not provided when needed */
  NOT_PROVIDED = 'not_provided',
  /** Control action provided when not needed (causes hazard) */
  PROVIDED_CAUSES_HAZARD = 'provided_causes_hazard',
  /** Control action provided too early, too late, or out of order */
  WRONG_TIMING = 'wrong_timing',
  /** Control action stopped too soon or applied too long */
  WRONG_DURATION = 'wrong_duration',
}

// =============================================================================
// Core STPA Interfaces
// =============================================================================

/**
 * Represents a potential hazard identified during STPA analysis.
 */
export interface Hazard {
  /** Unique identifier for this hazard */
  readonly id: string;
  /** Human-readable description of the hazard */
  readonly description: string;
  /** Category of hazard */
  readonly category: HazardCategory;
  /** Severity if hazard occurs */
  readonly severity: HazardSeverity;
  /** Likelihood of occurrence */
  readonly likelihood: HazardLikelihood;
  /** Specific conditions that could trigger this hazard */
  readonly triggerConditions: readonly string[];
  /** Potential consequences if hazard occurs */
  readonly consequences: readonly string[];
}

/**
 * Represents an unsafe control action that could lead to a hazard.
 * In MCP context, a control action is a tool invocation.
 */
export interface UnsafeControlAction {
  /** Unique identifier for this UCA */
  readonly id: string;
  /** The tool name that could perform this unsafe action */
  readonly toolName: string;
  /** Type of unsafe control action */
  readonly type: UnsafeControlActionType;
  /** Human-readable description of the unsafe action */
  readonly description: string;
  /** System state or context that makes this action unsafe */
  readonly unsafeContext: string;
  /** Hazards that could result from this UCA */
  readonly relatedHazards: readonly string[];
  /** Specific input patterns that could trigger this UCA */
  readonly triggerPatterns?: readonly TriggerPattern[];
}

/**
 * A pattern that could trigger an unsafe control action.
 */
export interface TriggerPattern {
  /** Parameter name that triggers the pattern */
  readonly parameter: string;
  /** Type of pattern match */
  readonly matchType: 'contains' | 'regex' | 'equals' | 'startsWith' | 'endsWith';
  /** Pattern value to match */
  readonly pattern: string;
  /** Description of why this pattern is dangerous */
  readonly reason: string;
}

/**
 * Represents a safety constraint that prevents an unsafe control action.
 */
export interface SafetyConstraint {
  /** Unique identifier for this constraint */
  readonly id: string;
  /** Human-readable description of the constraint */
  readonly description: string;
  /** The UCA(s) this constraint mitigates */
  readonly mitigates: readonly string[];
  /** Type of enforcement */
  readonly enforcement: ConstraintEnforcement;
  /** Validation function name (for runtime enforcement) */
  readonly validationFunction?: string;
  /** Priority for constraint evaluation order */
  readonly priority: ConstraintPriority;
}

/**
 * How a safety constraint is enforced.
 */
export enum ConstraintEnforcement {
  /** Prevent the action entirely */
  PREVENT = 'prevent',
  /** Require additional confirmation */
  REQUIRE_CONFIRMATION = 'require_confirmation',
  /** Log and alert but allow */
  ALERT = 'alert',
  /** Sanitize inputs before proceeding */
  SANITIZE = 'sanitize',
  /** Rate limit the action */
  RATE_LIMIT = 'rate_limit',
  /** Require specific privileges */
  REQUIRE_PRIVILEGE = 'require_privilege',
}

/**
 * Priority levels for constraint evaluation.
 */
export enum ConstraintPriority {
  /** Must be evaluated first, blocks all else */
  CRITICAL = 1,
  /** High priority, evaluated early */
  HIGH = 2,
  /** Normal priority */
  NORMAL = 3,
  /** Low priority, evaluated last */
  LOW = 4,
}

// =============================================================================
// Analysis Results
// =============================================================================

/**
 * Result of STPA analysis for a single tool.
 */
export interface ToolAnalysisResult {
  /** Tool name that was analyzed */
  readonly toolName: string;
  /** Tool description (if available) */
  readonly toolDescription?: string;
  /** Identified hazards */
  readonly hazards: readonly Hazard[];
  /** Identified unsafe control actions */
  readonly unsafeControlActions: readonly UnsafeControlAction[];
  /** Generated safety constraints */
  readonly safetyConstraints: readonly SafetyConstraint[];
  /** Overall risk score (0-100) */
  readonly riskScore: number;
  /** Risk level classification */
  readonly riskLevel: RiskLevel;
  /** Timestamp of analysis */
  readonly analyzedAt: Date;
}

/**
 * Risk level classification based on risk score.
 */
export enum RiskLevel {
  /** Score 0-20: Minimal risk */
  MINIMAL = 'minimal',
  /** Score 21-40: Low risk */
  LOW = 'low',
  /** Score 41-60: Moderate risk */
  MODERATE = 'moderate',
  /** Score 61-80: High risk */
  HIGH = 'high',
  /** Score 81-100: Critical risk */
  CRITICAL = 'critical',
}

/**
 * Complete STPA analysis result for one or more tools.
 */
export interface StpaAnalysisResult {
  /** Individual tool analysis results */
  readonly toolResults: readonly ToolAnalysisResult[];
  /** Summary statistics */
  readonly summary: AnalysisSummary;
  /** Cross-tool hazard interactions */
  readonly interactions: readonly HazardInteraction[];
  /** Analysis metadata */
  readonly metadata: AnalysisMetadata;
}

/**
 * Summary statistics for the analysis.
 */
export interface AnalysisSummary {
  /** Total tools analyzed */
  readonly totalTools: number;
  /** Total hazards identified */
  readonly totalHazards: number;
  /** Total unsafe control actions identified */
  readonly totalUnsafeControlActions: number;
  /** Total safety constraints generated */
  readonly totalSafetyConstraints: number;
  /** Hazards by category */
  readonly hazardsByCategory: Readonly<Record<HazardCategory, number>>;
  /** Average risk score across tools */
  readonly averageRiskScore: number;
  /** Tools by risk level */
  readonly toolsByRiskLevel: Readonly<Record<RiskLevel, number>>;
}

/**
 * Potential hazard interaction between multiple tools.
 */
export interface HazardInteraction {
  /** Tools involved in the interaction */
  readonly involvedTools: readonly string[];
  /** Combined hazard that emerges from interaction */
  readonly combinedHazard: string;
  /** Severity of the combined hazard */
  readonly severity: HazardSeverity;
  /** Description of how the interaction creates the hazard */
  readonly interactionDescription: string;
}

/**
 * Metadata about the analysis run.
 */
export interface AnalysisMetadata {
  /** Version of the STPA analyzer */
  readonly analyzerVersion: string;
  /** Timestamp when analysis started */
  readonly startedAt: Date;
  /** Timestamp when analysis completed */
  readonly completedAt: Date;
  /** Duration in milliseconds */
  readonly durationMs: number;
  /** Configuration used for analysis */
  readonly configuration: AnalysisConfiguration;
}

// =============================================================================
// Configuration
// =============================================================================

/**
 * Configuration options for STPA analysis.
 */
export interface AnalysisConfiguration {
  /** Include low-severity hazards in results */
  readonly includeLowSeverity: boolean;
  /** Generate constraints for all UCAs (vs only high-severity) */
  readonly generateAllConstraints: boolean;
  /** Check for tool interactions */
  readonly checkInteractions: boolean;
  /** Maximum hazards to report per tool */
  readonly maxHazardsPerTool: number;
  /** Categories to analyze (empty = all) */
  readonly categories: readonly HazardCategory[];
}

/**
 * Default analysis configuration.
 */
export const DEFAULT_ANALYSIS_CONFIG: AnalysisConfiguration = {
  includeLowSeverity: true,
  generateAllConstraints: true,
  checkInteractions: true,
  maxHazardsPerTool: 50,
  categories: [],
};

// =============================================================================
// Tool Definition Input
// =============================================================================

/**
 * Simplified tool definition for analysis input.
 * This matches the structure of MCP tool definitions.
 */
export interface ToolDefinition {
  /** Tool name */
  readonly name: string;
  /** Tool description */
  readonly description: string;
  /** Input schema (JSON Schema format) */
  readonly inputSchema: ToolInputSchema;
}

/**
 * JSON Schema representation of tool input.
 */
export interface ToolInputSchema {
  /** Schema type (typically 'object') */
  readonly type: string;
  /** Property definitions */
  readonly properties?: Readonly<Record<string, PropertySchema>>;
  /** Required property names */
  readonly required?: readonly string[];
  /** Additional properties allowed */
  readonly additionalProperties?: boolean;
}

/**
 * Individual property schema.
 */
export interface PropertySchema {
  /** Property type */
  readonly type: string;
  /** Property description */
  readonly description?: string;
  /** Enum values if applicable */
  readonly enum?: readonly unknown[];
  /** Pattern for string validation */
  readonly pattern?: string;
  /** Minimum value for numbers */
  readonly minimum?: number;
  /** Maximum value for numbers */
  readonly maximum?: number;
}

// =============================================================================
// Validation Result
// =============================================================================

/**
 * Result of validating a tool against safety constraints.
 */
export interface ValidationResult {
  /** Whether the tool passes all constraints */
  readonly valid: boolean;
  /** Tool that was validated */
  readonly toolName: string;
  /** Constraints that were violated */
  readonly violations: readonly ConstraintViolation[];
  /** Constraints that passed */
  readonly passed: readonly string[];
  /** Warnings (non-blocking issues) */
  readonly warnings: readonly ValidationWarning[];
  /** Timestamp of validation */
  readonly validatedAt: Date;
}

/**
 * A constraint violation found during validation.
 */
export interface ConstraintViolation {
  /** Constraint that was violated */
  readonly constraintId: string;
  /** Constraint description */
  readonly constraintDescription: string;
  /** Severity of the violation */
  readonly severity: HazardSeverity;
  /** Specific details about the violation */
  readonly details: string;
  /** Suggested remediation */
  readonly remediation: string;
}

/**
 * A non-blocking warning from validation.
 */
export interface ValidationWarning {
  /** Warning code */
  readonly code: string;
  /** Warning message */
  readonly message: string;
  /** Affected parameter or aspect */
  readonly affected: string;
}

// =============================================================================
// Zod Schemas for Runtime Validation
// =============================================================================

/**
 * Zod schema for ToolDefinition validation.
 */
export const ToolDefinitionSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  inputSchema: z.object({
    type: z.string(),
    properties: z.record(z.unknown()).optional(),
    required: z.array(z.string()).optional(),
    additionalProperties: z.boolean().optional(),
  }),
});

/**
 * Zod schema for AnalysisConfiguration validation.
 */
export const AnalysisConfigurationSchema = z.object({
  includeLowSeverity: z.boolean().default(true),
  generateAllConstraints: z.boolean().default(true),
  checkInteractions: z.boolean().default(true),
  maxHazardsPerTool: z.number().int().min(1).max(100).default(50),
  categories: z.array(HazardCategorySchema).default([]),
});

export type AnalysisConfigurationInput = z.input<typeof AnalysisConfigurationSchema>;
