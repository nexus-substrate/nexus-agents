/**
 * Structured adapter/transport failure detail in job records (#4375).
 *
 * Persisted on `failed` job records so readers of `get_job_result` can
 * programmatically distinguish adapter outages or capacity exhaustion
 * from application errors without parsing prose.
 *
 * @module mcp/jobs/job-failure-detail
 */

import { z } from 'zod';
import { sanitizeErrorDetails } from '../../security/output-sanitizer.js';
import { ERROR_ENVELOPE_META_KEY } from '../error-envelope.js';

/**
 * Structured failure detail for adapter / transport failures (#4375).
 */
export const JobFailureDetailSchema = z.object({
  /** Identifier of the failing adapter (e.g. 'claude', 'codex', 'api:anthropic'). */
  adapter: z.string().min(1),
  /** Transport mechanism where the failure occurred (e.g. 'subprocess', 'mcp', 'stdio'). */
  transport: z.string().min(1),
  /** Normalized failure category (e.g. 'rate_limited', 'timeout', 'capacity_exhausted'). */
  category: z.string().min(1),
});
export type JobFailureDetail = z.infer<typeof JobFailureDetailSchema>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

/**
 * Normalizes a raw category or code string into a snake_case failure category.
 */
function normalizeFailureCategory(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Extracts category from a candidate object, falling back to message text for capacity_exhausted (#4373).
 */
function extractCategory(candidate: Record<string, unknown>): string | undefined {
  const direct = getNonEmptyString(candidate.category) ?? getNonEmptyString(candidate.code);
  if (direct !== undefined) {
    return normalizeFailureCategory(direct);
  }
  const msg = getNonEmptyString(candidate.message);
  if (msg?.toLowerCase().includes('capacity_exhausted') === true) {
    return 'capacity_exhausted';
  }
  return undefined;
}

/**
 * Inspects an explicit failureDetail property if present.
 */
function inspectExplicitFailureDetail(
  candidate: Record<string, unknown>
): JobFailureDetail | undefined {
  if (!isRecord(candidate.failureDetail)) return undefined;
  const fd = candidate.failureDetail;
  const adapter = getNonEmptyString(fd.adapter);
  const transport = getNonEmptyString(fd.transport);
  const category = getNonEmptyString(fd.category);
  if (adapter !== undefined && transport !== undefined && category !== undefined) {
    return {
      adapter,
      transport,
      category: normalizeFailureCategory(category),
    };
  }
  return undefined;
}

/**
 * Inspects a single candidate record for adapter failure fields.
 */
function inspectCandidateForDetail(
  candidate: Record<string, unknown>
): JobFailureDetail | undefined {
  const explicit = inspectExplicitFailureDetail(candidate);
  if (explicit !== undefined) return explicit;

  const adapter = getNonEmptyString(candidate.adapter) ?? getNonEmptyString(candidate.cli);
  if (adapter === undefined) return undefined;

  const transport = getNonEmptyString(candidate.transport) ?? 'subprocess';
  const category = extractCategory(candidate);
  if (category === undefined) return undefined;

  return { adapter, transport, category };
}

/**
 * Inspects MCP error envelope or _meta metadata for failure details.
 */
function inspectMetaForDetail(meta: unknown): JobFailureDetail | undefined {
  if (!isRecord(meta)) return undefined;
  const direct = inspectCandidateForDetail(meta);
  if (direct !== undefined) return direct;

  const env = meta[ERROR_ENVELOPE_META_KEY];
  if (isRecord(env) && isRecord(env.detail)) {
    return inspectCandidateForDetail(env.detail);
  }
  return undefined;
}

/**
 * Extracts structured adapter/transport failure detail from a caught error
 * or failure-shaped result (#4375).
 *
 * Inspects:
 * 1. An explicit `failureDetail` property
 * 2. CLI error structures (`cli`, `code`, `transport`)
 * 3. Generic adapter error shapes (`adapter`, `transport`, `category`)
 * 4. Nested `_meta` or MCP error envelope structures
 * 5. Nested `.error` or `.cause` properties
 *
 * Strips all excess properties (e.g. response bodies, prompt text, stack traces)
 * returning strictly `{ adapter, transport, category }`.
 *
 * @param source - Caught exception or failure-shaped job result
 * @returns Structured failure detail, or `undefined` if not an adapter/transport failure
 */
export function extractFailureDetail(source: unknown): JobFailureDetail | undefined {
  if (!isRecord(source)) return undefined;

  return (
    inspectCandidateForDetail(source) ??
    inspectMetaForDetail(source._meta) ??
    (isRecord(source.error) ? inspectCandidateForDetail(source.error) : undefined) ??
    (isRecord(source.cause) ? inspectCandidateForDetail(source.cause) : undefined)
  );
}

/**
 * Sanitizes all string fields in a failure detail and validates against the schema (#4375).
 * Returns undefined if detail is undefined.
 */
export function validateAndSanitizeFailureDetail(
  detail?: JobFailureDetail
): JobFailureDetail | undefined {
  if (detail === undefined) return undefined;
  return JobFailureDetailSchema.parse({
    adapter: sanitizeErrorDetails(detail.adapter),
    transport: sanitizeErrorDetails(detail.transport),
    category: sanitizeErrorDetails(detail.category),
  });
}
