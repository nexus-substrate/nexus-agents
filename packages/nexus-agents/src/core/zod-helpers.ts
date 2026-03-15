/**
 * nexus-agents/core - Zod Validation Helpers
 *
 * Centralized utilities for Zod error formatting.
 * Consolidates 20+ duplicate implementations across the codebase.
 *
 * @module core/zod-helpers
 * (Source: LOOP H-K consolidation)
 */

import type { ZodError, z } from 'zod';

/**
 * Formats a single Zod issue into a readable string.
 *
 * @param issue - The Zod issue to format
 * @returns A formatted string like "field.path: error message" or "error message" if no path
 *
 * @example
 * ```typescript
 * const issue = { path: ['user', 'email'], message: 'Invalid email' };
 * formatZodIssue(issue); // "user.email: Invalid email"
 * ```
 */
export function formatZodIssue(issue: z.core.$ZodIssue): string {
  const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
  return `${path}${issue.message}`;
}

/**
 * Formats all Zod issues into a single semicolon-separated string.
 *
 * @param error - The Zod error to format
 * @returns A formatted string with all issues joined by "; "
 *
 * @example
 * ```typescript
 * try {
 *   schema.parse(data);
 * } catch (e) {
 *   if (e instanceof ZodError) {
 *     console.error(formatZodError(e)); // "name: Required; age: Expected number, received string"
 *   }
 * }
 * ```
 */
export function formatZodError(error: ZodError): string {
  return error.issues.map(formatZodIssue).join('; ');
}

/**
 * Formats all Zod issues into an array of strings.
 *
 * @param error - The Zod error to format
 * @returns An array of formatted issue strings
 *
 * @example
 * ```typescript
 * const issues = formatZodIssuesAsArray(zodError);
 * // ["name: Required", "age: Expected number, received string"]
 * ```
 */
export function formatZodIssuesAsArray(error: ZodError): string[] {
  return error.issues.map(formatZodIssue);
}

/**
 * Formats Zod issues with "root" as fallback for empty paths.
 *
 * @param error - The Zod error to format
 * @returns A formatted string with each issue on its own
 *
 * @example
 * ```typescript
 * const issues = formatZodIssuesWithRoot(zodError);
 * // "root: Invalid type" or "field.path: Required"
 * ```
 */
export function formatZodIssueWithRoot(issue: z.core.$ZodIssue): string {
  const pathStr = issue.path.length > 0 ? issue.path.join('.') : 'root';
  return `${pathStr}: ${issue.message}`;
}

/**
 * Type guard to check if a value is a Zod error.
 *
 * @param error - The value to check
 * @returns True if the value is a ZodError
 *
 * @example
 * ```typescript
 * if (isZodError(error)) {
 *   console.error(formatZodError(error));
 * }
 * ```
 */
export function isZodError(error: unknown): error is ZodError {
  return (
    error !== null &&
    typeof error === 'object' &&
    'issues' in error &&
    Array.isArray((error as ZodError).issues)
  );
}
