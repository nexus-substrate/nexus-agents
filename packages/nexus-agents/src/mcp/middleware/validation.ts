/**
 * nexus-agents/mcp - Validation Middleware
 *
 * Input validation helper using Zod schemas.
 * All tool inputs must be validated at the boundary.
 *
 * (Source: MCP Protocol 2025-11-25, Zod Documentation)
 */

import type { ZodType } from 'zod';

import { type Result, ok, err, ValidationError, formatZodError } from '../../core/index.js';

// Re-export isZodError for backward compatibility
export { isZodError } from '../../core/index.js';

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
 *   context: z.record(z.string(), z.unknown()).optional(),
 * });
 *
 * server.tool('my_tool', InputSchema.shape, async (args) => {
 *   const result = validateToolInput(InputSchema, args);
 *   if (!result.ok) {
 *     return toolStructuredError({ errorCategory: 'validation', message: result.error.message });
 *   }
 *   const { task, context } = result.value;
 *   // Process validated input...
 * });
 * ```
 */
export function validateToolInput<T>(
  schema: ZodType<T>,
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
  schema: ZodType<T>
): (args: unknown) => Result<T, ValidationError> {
  return (args: unknown) => validateToolInput(schema, args);
}

// `validateToolOutput` and `createOutputValidator` (Issue #547 sibling of
// `validateToolInput` / `createValidator`) removed in #3022 — no MCP tool
// ever called the output-validation path; every tool returns its result
// without schema-validating first. If output validation comes back as a
// real requirement, reintroduce alongside the per-tool wiring in the same
// PR (activate-or-delete YAGNI — #2937, #2938, #2939, #2940, #3018, #3022).
