/**
 * nexus-agents/mcp - Validation Middleware
 *
 * Input validation helper using Zod schemas.
 * All tool inputs must be validated at the boundary.
 *
 * (Source: MCP Protocol 2025-11-25, Zod Documentation)
 */

import type { ZodSchema, ZodError, ZodIssue } from 'zod';

import { type Result, ok, err, ValidationError } from '../../core/index.js';

/**
 * Formats a Zod validation error into a human-readable message.
 *
 * @param error - The Zod error to format
 * @returns A formatted error message
 */
function formatZodError(error: ZodError): string {
  const issues = error.issues.map(formatZodIssue);
  return issues.join('; ');
}

/**
 * Formats a single Zod issue into a readable string.
 *
 * @param issue - The Zod issue to format
 * @returns A formatted issue message
 */
function formatZodIssue(issue: ZodIssue): string {
  const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
  return `${path}${issue.message}`;
}

/**
 * Validates tool input against a Zod schema.
 *
 * This function should be called at the start of every tool handler
 * to validate incoming arguments before processing.
 *
 * @template T - The expected type after validation
 * @param schema - The Zod schema to validate against
 * @param args - The unknown input to validate
 * @returns Result containing validated data or a ValidationError
 *
 * @example
 * ```typescript
 * const InputSchema = z.object({
 *   task: z.string().min(1),
 *   context: z.record(z.unknown()).optional(),
 * });
 *
 * server.tool('my_tool', InputSchema.shape, async (args) => {
 *   const result = validateToolInput(InputSchema, args);
 *   if (!result.ok) {
 *     return { isError: true, content: [{ type: 'text', text: result.error.message }] };
 *   }
 *   const { task, context } = result.value;
 *   // Process validated input...
 * });
 * ```
 */
export function validateToolInput<T>(
  schema: ZodSchema<T>,
  args: unknown
): Result<T, ValidationError> {
  const parsed = schema.safeParse(args);

  if (parsed.success) {
    return ok(parsed.data);
  }

  const message = formatZodError(parsed.error);
  const validationError = new ValidationError(`Invalid tool input: ${message}`, {
    context: {
      issues: parsed.error.issues,
      receivedType: typeof args,
    },
  });

  return err(validationError);
}

/**
 * Creates a validation function bound to a specific schema.
 *
 * Useful for reusing the same schema across multiple tools.
 *
 * @template T - The expected type after validation
 * @param schema - The Zod schema to bind
 * @returns A validation function for the schema
 *
 * @example
 * ```typescript
 * const validateTask = createValidator(TaskSchema);
 *
 * // Later in tool handlers:
 * const result = validateTask(args);
 * ```
 */
export function createValidator<T>(
  schema: ZodSchema<T>
): (args: unknown) => Result<T, ValidationError> {
  return (args: unknown) => validateToolInput(schema, args);
}

/**
 * Type guard to check if a value is a Zod error.
 *
 * @param error - The value to check
 * @returns True if the value is a ZodError
 */
export function isZodError(error: unknown): error is ZodError {
  return (
    error !== null &&
    typeof error === 'object' &&
    'issues' in error &&
    Array.isArray((error as ZodError).issues)
  );
}
