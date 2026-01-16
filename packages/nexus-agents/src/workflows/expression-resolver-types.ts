/**
 * nexus-agents/workflows - Expression Resolver Types
 *
 * Type definitions for expression resolution.
 * Extracted to avoid circular dependencies.
 */

/**
 * Types of expression references.
 */
export type ExpressionType = 'inputs' | 'steps' | 'variables';

/**
 * Parsed expression structure.
 */
export interface ParsedExpression {
  /** Original expression string */
  original: string;
  /** Expression type (inputs, steps, variables) */
  type: ExpressionType;
  /** Path segments after the type */
  path: string[];
}

/**
 * Result of expression resolution.
 */
export interface ResolveResult {
  /** Whether resolution succeeded */
  success: boolean;
  /** Resolved value if successful */
  value?: unknown;
  /** Error message if failed */
  error?: string;
}
