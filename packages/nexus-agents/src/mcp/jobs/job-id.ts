/**
 * Job-id format (input validation hardening).
 *
 * Job ids are minted by the server, never chosen freely by a caller. Every
 * mint site produces ids from `[A-Za-z0-9_-]`:
 *
 * - `<prefix>-<uuid>` — `rp-`, `dp-`, `sc-`, `rn-`, `gw-`, `pr-`, `es-`,
 *   `job-vote-`, `job-rw-` (`freshJobId` in the async tools);
 * - `job-<tool_name>-<16 hex>` — idempotency-key dispatch (`job-idempotency.ts`);
 * - a bare `randomUUID()` — keyless fallback in `resolveIdempotency`;
 * - `tsk_<base36>_<base36>` — orchestrate (`generateTaskId`);
 * - a `run_dev_pipeline` `sessionId`, whose input schema already restricts it to
 *   `^[a-zA-Z0-9_-]+$`, max 128.
 *
 * The id is interpolated into a sidecar file name, so it is validated both at
 * the tool schemas and at the path builders.
 *
 * @module mcp/jobs/job-id
 */

import { z } from 'zod';

/** Longest accepted job id; matches the existing tool-schema bound. */
export const JOB_ID_MAX_LENGTH = 128;

/** The character set every minted job id is drawn from, 1–128 characters. */
export const JOB_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

/** True when `jobId` has the minted format. The empty string is not a job id. */
export function isValidJobId(jobId: string): boolean {
  return JOB_ID_PATTERN.test(jobId);
}

/** Throws for an id outside the minted format; used where a path is about to be built. */
export function assertValidJobId(jobId: string): void {
  if (!isValidJobId(jobId)) {
    throw new Error('Invalid jobId: must contain only letters, digits, "_" and "-" (1-128)');
  }
}

/** Tool-schema field for a job id. */
export function jobIdSchema(description: string): z.ZodString {
  return z
    .string()
    .min(1)
    .max(JOB_ID_MAX_LENGTH)
    .regex(JOB_ID_PATTERN, 'jobId must contain only letters, digits, "_" and "-"')
    .describe(description);
}
