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
 *
 * Three fields describe coverage and they answer different questions (#4592):
 *
 *  - `evaluated` — the constraint was applicable AND a check ran that could
 *    have failed. This is the honest coverage number.
 *  - `notApplicable` — the constraint was judged not to apply to this tool.
 *    Nothing was checked, but the skip itself was a decision.
 *  - neither list — the constraint applied but no check exists for its
 *    enforcement type, so it was **unmeasured**. These carry an
 *    `UNMEASURED_ENFORCEMENT` warning rather than being silently credited.
 *
 * `evaluated` and `notApplicable` never overlap, and together with the
 * unmeasured remainder they account for every constraint supplied.
 */
export interface ValidationResult {
  /** Whether the tool passes all constraints */
  readonly valid: boolean;
  /** Tool that was validated */
  readonly toolName: string;
  /** Constraints that were violated */
  readonly violations: readonly ConstraintViolation[];
  /**
   * Constraints that did not produce a violation.
   *
   * @deprecated Not a coverage signal — use {@link ValidationResult.evaluated}.
   * `passed` still contains constraints that were never evaluated: those
   * {@link ValidationResult.notApplicable} to this tool contribute to `passed`
   * despite no check having run, so `passed.length` overstates how much of the
   * constraint set was actually measured.
   *
   * Its contents did change in one direction (#4592): applicable constraints
   * whose enforcement type has no schema-time check used to land here too, and
   * now land in no bucket and raise `UNMEASURED_ENFORCEMENT`. So `passed` got
   * *less* wrong, not unchanged — it no longer credits a constraint that a
   * permanently-null check waved through. It is still not a coverage signal.
   */
  readonly passed: readonly string[];
  /**
   * Constraints that applied to this tool and were checked by a check that
   * could have failed. `evaluated.length` is the coverage number; every id
   * here is either in `passed` or produced an entry in `violations`.
   */
  readonly evaluated: readonly string[];
  /** Constraints judged not to apply to this tool; nothing was checked. */
  readonly notApplicable: readonly string[];
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
