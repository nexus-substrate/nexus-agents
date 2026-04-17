/**
 * nexus-agents/cli-adapters - Typed Structured Output Generation
 *
 * Wraps CLI adapter execution with Zod schema validation and
 * retry-with-feedback. Inspired by vercel/ai's `generateObject` and
 * pydantic-ai's parse-retry pattern.
 *
 * @module cli-adapters/generate-object
 * (Source: Issue #1897 — typed generateObject<T> abstraction)
 */

import type { ZodType, ZodError } from 'zod';
import type { Result } from '../core/index.js';
import { ok, err, extractJsonObject, extractJsonArray } from '../core/index.js';
import type { ICliAdapter, CliTask } from './types.js';
import type { CliResponse } from './types-core.js';

/** Options for generateObject. */
export interface GenerateObjectOptions<T> {
  /** The CLI adapter to execute the task on. */
  readonly adapter: ICliAdapter;
  /** The user prompt describing what to generate. */
  readonly prompt: string;
  /** Zod schema defining the expected output shape. */
  readonly schema: ZodType<T>;
  /** Whether the expected shape is an array (uses extractJsonArray). */
  readonly isArray?: boolean;
  /** Optional system-level instructions prepended to the prompt. */
  readonly systemPrompt?: string;
  /** Optional timeout in milliseconds. */
  readonly timeoutMs?: number;
}

/** Structured error from generateObject. */
export interface GenerateObjectError {
  /** What went wrong. */
  readonly code: 'adapter_error' | 'no_json' | 'parse_error' | 'validation_error';
  /** Human-readable message. */
  readonly message: string;
  /** Raw CLI response text (if available). */
  readonly rawText?: string;
  /** Zod validation issues (if validation_error). */
  readonly zodErrors?: ZodError;
}

/** Result of a successful generateObject call. */
export interface GenerateObjectResult<T> {
  /** The validated, typed object. */
  readonly data: T;
  /** Token usage from the adapter. */
  readonly usage?: CliResponse['usage'];
  /** Number of attempts (1 = first try, 2 = retried with feedback). */
  readonly attempts: number;
}

/**
 * Build the schema instruction suffix that tells the LLM to respond with JSON.
 */
function buildSchemaInstruction<T>(schema: ZodType<T>): string {
  // Zod v4 uses .toJsonSchema() but we keep a safe fallback
  const jsonSchema = getJsonSchema(schema);
  const schemaStr = JSON.stringify(jsonSchema, null, 2);
  return [
    '',
    'IMPORTANT: Respond ONLY with valid JSON matching this schema (no markdown fences, no explanation):',
    schemaStr,
  ].join('\n');
}

/** Extract JSON schema from Zod, with safe fallback. */
function getJsonSchema<T>(schema: ZodType<T>): Record<string, unknown> {
  // Zod v4 has .toJsonSchema(); Zod v3 needs zod-to-json-schema
  const s = schema as unknown as Record<string, unknown>;
  if ('toJsonSchema' in s && typeof s['toJsonSchema'] === 'function') {
    return (s['toJsonSchema'] as () => Record<string, unknown>)();
  }
  // Fallback: describe shape textually
  return { description: 'See prompt for expected shape' };
}

/**
 * Build the retry prompt with validation feedback.
 */
function buildRetryPrompt(
  originalPrompt: string,
  rawText: string,
  validationError: string
): string {
  return [
    originalPrompt,
    '',
    'Your previous response failed JSON validation:',
    validationError,
    '',
    `Your previous response (first 500 chars): ${rawText.slice(0, 500)}`,
    '',
    'Please respond again with valid JSON only. No markdown fences, no explanation.',
  ].join('\n');
}

/**
 * Try to extract and validate JSON from CLI response text.
 */
function tryExtractAndValidate<T>(
  text: string,
  schema: ZodType<T>,
  isArray: boolean
): Result<T, GenerateObjectError> {
  const jsonStr = isArray ? extractJsonArray(text) : extractJsonObject(text);
  if (jsonStr === undefined) {
    return err({
      code: 'no_json',
      message: `No JSON ${isArray ? 'array' : 'object'} found in response`,
      rawText: text,
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e: unknown) {
    return err({
      code: 'parse_error',
      message: `JSON parse failed: ${e instanceof Error ? e.message : String(e)}`,
      rawText: text,
    });
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    return err({
      code: 'validation_error',
      message: formatZodErrors(result.error),
      rawText: text,
      zodErrors: result.error,
    });
  }

  return ok(result.data);
}

/** Format Zod errors into a concise feedback string for the LLM. */
function formatZodErrors(error: ZodError): string {
  return error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
}

/**
 * Generate a typed object from a CLI adapter with schema validation
 * and retry-with-feedback on validation failure.
 *
 * @example
 * ```ts
 * const result = await generateObject({
 *   adapter,
 *   prompt: 'Analyze this code for security issues',
 *   schema: z.object({
 *     findings: z.array(z.object({
 *       severity: z.enum(['high', 'medium', 'low']),
 *       description: z.string(),
 *     })),
 *   }),
 * });
 * if (result.ok) {
 *   console.log(result.value.data.findings);
 * }
 * ```
 */
/** Build a CliTask from prompt and optional timeout. */
function buildTask(content: string, timeoutMs: number | undefined): CliTask {
  if (timeoutMs !== undefined) {
    return { content, timeoutMs };
  }
  return { content };
}

/** Retry context passed to retryWithFeedback. */
interface RetryContext<T> {
  readonly adapter: ICliAdapter;
  readonly fullPrompt: string;
  readonly rawText: string;
  readonly errorMsg: string;
  readonly schema: ZodType<T>;
  readonly isArray: boolean;
  readonly timeoutMs: number | undefined;
}

/** Attempt retry with validation feedback. */
async function retryWithFeedback<T>(
  ctx: RetryContext<T>
): Promise<Result<GenerateObjectResult<T>, GenerateObjectError> | undefined> {
  const retryPrompt = buildRetryPrompt(ctx.fullPrompt, ctx.rawText, ctx.errorMsg);
  const retryResponse = await ctx.adapter.execute(buildTask(retryPrompt, ctx.timeoutMs));

  if (!retryResponse.ok) {
    return err({ code: 'adapter_error', message: retryResponse.error.message });
  }

  const retryAttempt = tryExtractAndValidate(retryResponse.value.text, ctx.schema, ctx.isArray);
  if (retryAttempt.ok) {
    return ok({ data: retryAttempt.value, usage: retryResponse.value.usage, attempts: 2 });
  }
  return undefined; // retry failed, caller decides
}

/**
 * Generate a typed object from a CLI adapter with schema validation
 * and retry-with-feedback on validation failure.
 */
export async function generateObject<T>(
  opts: GenerateObjectOptions<T>
): Promise<Result<GenerateObjectResult<T>, GenerateObjectError>> {
  const { adapter, schema, isArray = false, timeoutMs } = opts;
  const schemaInstruction = buildSchemaInstruction(schema);
  const fullPrompt = (opts.systemPrompt ?? '') + opts.prompt + schemaInstruction;

  // First attempt
  const response = await adapter.execute(buildTask(fullPrompt, timeoutMs));
  if (!response.ok) {
    return err({ code: 'adapter_error', message: response.error.message });
  }

  const firstAttempt = tryExtractAndValidate(response.value.text, schema, isArray);
  if (firstAttempt.ok) {
    return ok({ data: firstAttempt.value, usage: response.value.usage, attempts: 1 });
  }

  // No JSON at all — don't retry (model didn't even try)
  if (firstAttempt.error.code === 'no_json') {
    return err(firstAttempt.error);
  }

  // Retry with validation feedback
  const retryResult = await retryWithFeedback({
    adapter,
    fullPrompt,
    rawText: response.value.text,
    errorMsg: firstAttempt.error.message,
    schema,
    isArray,
    timeoutMs,
  });

  return retryResult ?? err(firstAttempt.error);
}
