/** Bounded diagnostics for rejected development plans; never execution authority (#7424). */
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { createLogger } from '../../core/logger.js';
import { appendResult, readTaskState } from '../../context/structured-task-state.js';
import {
  sanitizeErrorDetails,
  TOOL_OUTPUT_REDACTION_PLACEHOLDER,
} from '../../security/output-sanitizer.js';
import { validateAndSanitizeFailureDetail, type JobFailureDetail } from './job-failure-detail.js';
import { parseToolErrorEnvelope } from '../error-envelope.js';

export const PLAN_EVIDENCE_TEXT_MAX_BYTES = 32 * 1024;
const SOURCE_MAX_BYTES = 512 * 1024;
const EVIDENCE_MAX_BYTES = 512 * 1024;
/** Back off at most 128 times over a 32 KiB prefix if a sanitizer token is split. */
const SANITIZER_BOUNDARY_BACKOFF_BYTES = 256;
/** Convergence is measured, never assumed; unavailable evidence remains explicit. */
const MAX_SANITIZATION_PASSES = 4;
const DeliveredTextSchema = z.object({ text: z.string() });
const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const byteCount = z.number().int().nonnegative();
const planStatus = z.enum(['empty', 'unapproved', 'no_quorum']);

const RetainedTextSchema = z
  .object({
    text: z.string().max(PLAN_EVIDENCE_TEXT_MAX_BYTES),
    coverage: z.enum(['complete', 'redacted', 'truncated']),
    redacted: z.boolean(),
    truncated: z.boolean(),
    rawBytes: byteCount,
    rawSha256: digest,
    sanitizedBytes: byteCount,
    sanitizedSha256: digest,
    retainedBytes: byteCount.max(PLAN_EVIDENCE_TEXT_MAX_BYTES),
    retainedSha256: digest,
  })
  .refine(
    (value) =>
      value.text.isWellFormed() &&
      !value.text.includes('\0') &&
      Buffer.byteLength(value.text, 'utf8') === value.retainedBytes &&
      sha256(value.text) === value.retainedSha256 &&
      sanitizeDeliveredText(value.text) === value.text
  )
  .refine(
    (value) =>
      value.coverage === (value.truncated ? 'truncated' : value.redacted ? 'redacted' : 'complete')
  )
  .refine(
    (value) =>
      value.redacted === (value.rawSha256 !== value.sanitizedSha256) &&
      (value.redacted || value.rawBytes === value.sanitizedBytes)
  )
  .refine((value) =>
    value.truncated
      ? value.sanitizedBytes > value.retainedBytes
      : value.sanitizedBytes === value.retainedBytes &&
        value.sanitizedSha256 === value.retainedSha256
  );
const TextEvidenceSchema = z.union([
  RetainedTextSchema,
  z.object({
    coverage: z.literal('invalid'),
    reason: z.enum(['invalid_utf8', 'nul', 'source_too_large', 'unstable_sanitization']),
  }),
]);

/** The origin nonce correlates one dispatch; it is not an authentication credential. */
export const PlanFailureEvidenceSchema = z
  .object({
    v: z.literal(1),
    kind: z.literal('dev_pipeline_plan'),
    jobId: z.string().min(1).max(200),
    toolName: z.literal('run_dev_pipeline'),
    dispatchId: z.uuid(),
    producerVersion: z.string().min(1).max(128),
    planStatus,
    plan: TextEvidenceSchema,
    proposal: TextEvidenceSchema.optional(),
    voteRecordId: z.string().min(1).max(256).optional(),
  })
  .refine((value) => Buffer.byteLength(JSON.stringify(value), 'utf8') <= EVIDENCE_MAX_BYTES);
export type PlanFailureEvidence = z.infer<typeof PlanFailureEvidenceSchema>;

type TextEvidence = z.infer<typeof TextEvidenceSchema>;

/** Redact before bounding; never split a valid UTF-8 code point. */
function textEvidence(raw: string): TextEvidence {
  if (!raw.isWellFormed()) return { coverage: 'invalid', reason: 'invalid_utf8' };
  if (raw.includes('\0')) return { coverage: 'invalid', reason: 'nul' };
  const rawBytes = Buffer.byteLength(raw, 'utf8');
  if (rawBytes > SOURCE_MAX_BYTES) return { coverage: 'invalid', reason: 'source_too_large' };
  const sanitized = sanitizeDeliveredText(raw);
  if (sanitized === undefined) return { coverage: 'invalid', reason: 'unstable_sanitization' };
  const { text, retainedBytes, sanitizedBytes } = boundedSanitizedPrefix(sanitized);
  const redacted = sanitized !== raw;
  const truncated = retainedBytes < sanitizedBytes;
  return {
    text,
    coverage: truncated ? 'truncated' : redacted ? 'redacted' : 'complete',
    redacted,
    truncated,
    rawBytes,
    rawSha256: sha256(raw),
    sanitizedBytes,
    sanitizedSha256: sha256(sanitized),
    retainedBytes,
    retainedSha256: sha256(text),
  };
}

/**
 * MCP sanitizes complete JSON display text as well as string leaves. Escaped
 * newlines/quotes can therefore broaden contextual redaction. Measure both
 * representations to a bounded fixed point before computing artifact hashes.
 * The wrapper's neutral key has the same JSON string escaping as tool delivery.
 */
function sanitizeDeliveredText(raw: string): string | undefined {
  let current = raw;
  for (let pass = 0; pass < MAX_SANITIZATION_PASSES; pass++) {
    const leaf = sanitizeErrorDetails(current, undefined, TOOL_OUTPUT_REDACTION_PLACEHOLDER);
    let decoded: unknown;
    try {
      decoded = JSON.parse(
        sanitizeErrorDetails(
          JSON.stringify({ text: leaf }),
          undefined,
          TOOL_OUTPUT_REDACTION_PLACEHOLDER
        )
      );
    } catch {
      return undefined;
    }
    const parsed = DeliveredTextSchema.safeParse(decoded);
    if (!parsed.success) return undefined;
    const next = parsed.data.text;
    if (leaf === current && next === current) return current;
    current = next;
  }
  return undefined;
}

/** Retain a sanitizer-stable UTF-8 prefix with a strictly decreasing byte bound. */
function boundedSanitizedPrefix(sanitized: string): {
  text: string;
  retainedBytes: number;
  sanitizedBytes: number;
} {
  const bytes = Buffer.from(sanitized, 'utf8');
  let end = Math.min(bytes.length, PLAN_EVIDENCE_TEXT_MAX_BYTES);
  let text: string;
  // A cut through a redaction marker can make a once-sanitized prefix unsafe.
  // Empty text is explicitly safe; each backoff strictly decreases the byte bound.
  for (;;) {
    while (end < bytes.length && end > 0 && ((bytes[end] ?? 0) & 0xc0) === 0x80) end--;
    text = bytes.subarray(0, end).toString('utf8');
    if (sanitizeDeliveredText(text) === text) break;
    end = Math.max(0, end - SANITIZER_BOUNDARY_BACKOFF_BYTES);
  }
  return { text, retainedBytes: end, sanitizedBytes: bytes.length };
}

const PlanningDetailSchema = z.object({
  completed: z.literal(false),
  planStatus,
  plan: z.string(),
  planVoteProposal: z.string().optional(),
  planVoteRecordId: z.string().min(1).max(256).optional(),
});

/** Allowlist only canonical business planning failures; never copy arbitrary detail. */
export function extractPlanFailureEvidence(
  toolName: string,
  result: unknown,
  origin: Pick<PlanFailureEvidence, 'jobId' | 'dispatchId' | 'producerVersion'>
): PlanFailureEvidence | undefined {
  if (toolName !== 'run_dev_pipeline' || typeof result !== 'object' || result === null)
    return undefined;
  const envelope = parseToolErrorEnvelope('_meta' in result ? result._meta : undefined);
  if (envelope?.errorCategory !== 'business') return undefined;
  const parsed = PlanningDetailSchema.safeParse(envelope.detail);
  if (!parsed.success) return undefined;
  const detail = parsed.data;
  return PlanFailureEvidenceSchema.parse({
    v: 1,
    kind: 'dev_pipeline_plan',
    toolName,
    ...origin,
    planStatus: detail.planStatus,
    plan: textEvidence(detail.plan),
    ...(detail.planVoteProposal !== undefined
      ? { proposal: textEvidence(detail.planVoteProposal) }
      : {}),
    ...(detail.planVoteRecordId !== undefined
      ? {
          voteRecordId: sanitizeErrorDetails(
            detail.planVoteRecordId,
            undefined,
            TOOL_OUTPUT_REDACTION_PLACEHOLDER
          ),
        }
      : {}),
  });
}

/** Write only into the failed state initialized by this exact dispatch. Never create a log. */
export function persistPlanFailureTaskEvidence(
  evidence: PlanFailureEvidence | undefined,
  settledStatus: string | undefined
): void {
  if (evidence === undefined || settledStatus !== 'failed') return;
  const state = readTaskState(evidence.jobId);
  if (!state.ok) return; // No task-state record: the private sidecar is the source.
  const logger = createLogger({ component: 'job-plan-failure-evidence' });
  if (
    state.value.stage !== 'failed' ||
    state.value.dispatch !== 'async' ||
    state.value.taskId !== evidence.jobId ||
    state.value.asyncDispatchId !== evidence.dispatchId ||
    state.value.cancellation !== undefined
  ) {
    logger.warn('Failed plan evidence not attached to unbound or non-failed task state', {
      jobId: evidence.jobId,
    });
    return;
  }
  const written = appendResult(
    evidence.jobId,
    {
      kind: 'job_failure_evidence',
      v: 1,
      failureEvidence: evidence,
    },
    new Date().toISOString()
  );
  if (!written.ok)
    logger.warn('Failed plan evidence unavailable in task state', {
      jobId: evidence.jobId,
      reason: sanitizeErrorDetails(
        written.error.message,
        undefined,
        TOOL_OUTPUT_REDACTION_PLACEHOLDER
      ),
    });
}

/** Project only same-dispatch diagnostics from a failed task-state result. */
export function planFailureEvidenceFromTaskState(
  result: unknown,
  jobId: string,
  dispatchId: string | undefined
): PlanFailureEvidence | undefined {
  if (dispatchId === undefined) return undefined;
  const wrapper = z
    .object({
      kind: z.literal('job_failure_evidence'),
      v: z.literal(1),
      failureEvidence: PlanFailureEvidenceSchema,
    })
    .safeParse(result);
  if (!wrapper.success) return undefined;
  const evidence = wrapper.data.failureEvidence;
  return evidence.jobId === jobId && evidence.dispatchId === dispatchId ? evidence : undefined;
}

/** Optional failure diagnostics; the legacy adapter-only argument remains supported. */
export interface FailedJobDiagnostics {
  readonly failureDetail?: JobFailureDetail | undefined;
  readonly failureEvidence?: PlanFailureEvidence | undefined;
}

/** Keep validation and sanitization at the write boundary without widening adapter detail. */
export function failedJobDiagnostics(
  input: JobFailureDetail | FailedJobDiagnostics | undefined
): FailedJobDiagnostics {
  if (input === undefined) return {};
  const detail = 'adapter' in input ? input : input.failureDetail;
  const evidence = 'adapter' in input ? undefined : input.failureEvidence;
  const validated = validateAndSanitizeFailureDetail(detail);
  return {
    ...(validated !== undefined ? { failureDetail: validated } : {}),
    ...(evidence !== undefined
      ? { failureEvidence: PlanFailureEvidenceSchema.parse(evidence) }
      : {}),
  };
}
