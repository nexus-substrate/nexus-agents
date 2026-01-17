/**
 * nexus-agents/mcp/safety - STPA Type Definitions
 *
 * System-Theoretic Process Analysis (STPA) types for MCP tool safety analysis.
 * STPA is a hazard analysis technique that identifies unsafe control actions
 * and generates safety constraints to prevent hazardous scenarios.
 *
 * (Source: Leveson, Engineering a Safer World, MIT Press 2011)
 */

// =============================================================================
// Re-export Enums (from stpa-enums.ts to avoid circular dependencies)
// =============================================================================

export {
  HazardCategory,
  HazardSeverity,
  HazardLikelihood,
  UnsafeControlActionType,
  ConstraintEnforcement,
  ConstraintPriority,
  RiskLevel,
} from './stpa-enums.js';

// Import for type usage
import type {
  HazardCategory,
  HazardSeverity,
  HazardLikelihood,
  UnsafeControlActionType,
  ConstraintEnforcement,
  ConstraintPriority,
  RiskLevel,
} from './stpa-enums.js';

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
// Re-export Validation Types (from stpa-validation-types.ts)
// =============================================================================

export type {
  ToolDefinition,
  ToolInputSchema,
  PropertySchema,
  ValidationResult,
  ConstraintViolation,
  ValidationWarning,
} from './stpa-validation-types.js';

// =============================================================================
// Re-export Zod Schemas (from stpa-schemas.ts)
// =============================================================================

export {
  HazardCategorySchema,
  HazardSeveritySchema,
  ConstraintPrioritySchema,
  RiskLevelSchema,
  TriggerPatternSchema,
  HazardSchema,
  UnsafeControlActionSchema,
  SafetyConstraintSchema,
  PropertySchemaSchema,
  ToolInputSchemaSchema,
  ToolDefinitionSchema,
  AnalysisConfigurationSchema,
  ConstraintViolationSchema,
  ValidationWarningSchema,
  ValidationResultSchema,
  type AnalysisConfigurationInput,
} from './stpa-schemas.js';
