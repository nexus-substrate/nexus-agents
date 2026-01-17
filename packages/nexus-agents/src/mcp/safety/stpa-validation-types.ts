/**
 * nexus-agents/mcp/safety - STPA Validation Types
 *
 * Types for tool definitions and validation results.
 * Extracted from stpa-types.ts to maintain file size limits.
 *
 * @module mcp/safety/stpa-validation-types
 * (Source: Issue #339)
 */

/**
 * Severity level for constraint violations.
 * Duplicated here to avoid circular dependency with stpa-types.ts.
 * Must match HazardSeverity enum values.
 */
type ValidationSeverity = 'critical' | 'high' | 'medium' | 'low';

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
  readonly severity: ValidationSeverity;
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
