/**
 * Idempotency-key resolution for async-mode MCP tool dispatch (#3042 Stage 1c,
 * epic #2631). Lets a caller pass `idempotencyKey: "<string>"` and re-invoke
 * the same logical operation safely across sessions / process restarts.
 *
 * ## Contract
 *
 * - Key + matching inputs → returns the existing job's record (whatever
 *   state — pending / complete / failed / cancelled). Caller polls
 *   `get_job_result(jobId)` exactly as if it had dispatched fresh.
 * - Key + DIFFERENT inputs → fails closed with `idempotency_key_collision`.
 *   Reusing a key with different inputs is almost certainly a caller bug;
 *   silent merge would either hide a typo or leak the first call's result
 *   into a second logical operation.
 * - No key → caller falls back to a fresh `randomUUID()` jobId (existing
 *   behavior; this module is a no-op).
 *
 * ## Storage shape
 *
 * One file per (tool, key) tuple at:
 *   `<NEXUS_DATA_DIR>/jobs/key-<sha256(tool + ':' + key)>.json`
 *
 * Record: `{ v: 1, tool, key, inputsHash, jobId, createdAt }`.
 *
 * Sharded by `(tool, key)` so two different tools using the same human key
 * don't collide. The filename is the hash so an attacker who reads the
 * directory listing can't recover the user-supplied key.
 *
 * @module mcp/jobs/job-idempotency
 */

import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { z } from 'zod';

import { createLogger } from '../../core/index.js';
import { nexusDataPath, nexusDataPathEnsure } from '../../config/nexus-data-dir.js';

const logger = createLogger({ component: 'job-idempotency' });

/** Index-file record persisted per (tool, key). */
export const IdempotencyIndexEntrySchema = z.object({
  v: z.literal(1),
  /** MCP tool name (e.g. `orchestrate`, `run_workflow`, `consensus_vote`). */
  tool: z.string().min(1),
  /** Caller-supplied idempotency key. */
  key: z.string().min(1),
  /** sha256 of the canonical input JSON. */
  inputsHash: z.string().length(64),
  /** Existing jobId for this (tool, key, inputs) tuple. */
  jobId: z.string().min(1),
  /** ISO timestamp of first dispatch. */
  createdAt: z.iso.datetime(),
});
export type IdempotencyIndexEntry = z.infer<typeof IdempotencyIndexEntrySchema>;

/** Outcome of `resolveIdempotency` — discriminated by `kind`. */
export type IdempotencyResolution =
  | { readonly kind: 'fresh'; readonly jobId: string }
  | { readonly kind: 'replay'; readonly jobId: string; readonly entry: IdempotencyIndexEntry }
  | {
      readonly kind: 'collision';
      readonly existingInputsHash: string;
      readonly incomingInputsHash: string;
      readonly existingJobId: string;
    };

/** sha256 hex of a string. */
function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Canonical JSON serialization for input hashing. Sorts object keys
 * recursively so `{a:1,b:2}` and `{b:2,a:1}` produce identical hashes.
 *
 * `undefined` values are dropped (JSON semantics); function values throw
 * — schema validation should have caught those upstream.
 */
function canonicalJsonStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJsonStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJsonStringify(v)}`).join(',')}}`;
}

/** Compute the inputs hash used to detect (tool, key) collisions. */
export function computeInputsHash(inputs: unknown): string {
  return sha256Hex(canonicalJsonStringify(inputs));
}

/** Compute the on-disk index path for a (tool, key) tuple. */
function indexFilePath(tool: string, key: string): string {
  // Filename is hashed so a directory listing doesn't leak user keys.
  const filename = `key-${sha256Hex(`${tool}:${key}`)}.json`;
  return nexusDataPathEnsure('jobs', filename);
}

/** Read-only counterpart that doesn't create the parent directory. */
function indexFilePathReadOnly(tool: string, key: string): string {
  const filename = `key-${sha256Hex(`${tool}:${key}`)}.json`;
  return nexusDataPath('jobs', filename);
}

/**
 * Resolve a dispatch request to one of three outcomes:
 *
 * - `fresh`: no prior index entry — caller dispatches a new job using the
 *   returned `jobId`, then calls `registerIdempotentJob` to record the
 *   index entry. The `jobId` is derived deterministically from
 *   `(tool, key, inputsHash)` so concurrent dispatches with the same key
 *   converge on the same id and don't double-dispatch.
 * - `replay`: an existing entry has the SAME `inputsHash` — caller skips
 *   dispatch and returns the existing job's record (via `readJobResult`).
 * - `collision`: an existing entry has a DIFFERENT `inputsHash` — caller
 *   fails closed. Reusing a key with different inputs is a programmer
 *   error; silent merge would hide bugs.
 *
 * Callers should NOT call `registerIdempotentJob` when this returns
 * `replay` or `collision` — only on `fresh`.
 */
export function resolveIdempotency(
  tool: string,
  idempotencyKey: string | undefined,
  inputs: unknown,
  randomFallback: () => string = randomUUID
): IdempotencyResolution {
  if (idempotencyKey === undefined || idempotencyKey === '') {
    return { kind: 'fresh', jobId: randomFallback() };
  }
  const incomingInputsHash = computeInputsHash(inputs);
  const path = indexFilePathReadOnly(tool, idempotencyKey);
  if (existsSync(path)) {
    const entry = readIndexEntry(path);
    if (entry !== null) {
      if (entry.inputsHash === incomingInputsHash) {
        return { kind: 'replay', jobId: entry.jobId, entry };
      }
      return {
        kind: 'collision',
        existingInputsHash: entry.inputsHash,
        incomingInputsHash,
        existingJobId: entry.jobId,
      };
    }
    // Index file present but unreadable — treat as fresh, log the breach.
    logger.warn('Idempotency index file unreadable; treating as fresh dispatch', { tool, path });
  }
  // Derive jobId deterministically so two concurrent requests with the
  // same (tool, key, inputs) converge on a single id even if both miss
  // the index lookup race.
  const jobId = `job-${tool}-${sha256Hex(`${tool}:${idempotencyKey}:${incomingInputsHash}`).slice(0, 16)}`;
  return { kind: 'fresh', jobId };
}

/**
 * Persist the index entry after a `fresh` dispatch. Idempotent — if the
 * file already exists (e.g. a concurrent dispatch raced ahead), the
 * existing entry stays in place. Safe to call without checking
 * `existsSync` first.
 */
export function registerIdempotentJob(params: {
  tool: string;
  idempotencyKey: string;
  inputs: unknown;
  jobId: string;
}): void {
  const path = indexFilePath(params.tool, params.idempotencyKey);
  if (existsSync(path)) {
    logger.debug('Idempotency index entry already present; skipping write', {
      tool: params.tool,
      jobId: params.jobId,
    });
    return;
  }
  const entry: IdempotencyIndexEntry = {
    v: 1,
    tool: params.tool,
    key: params.idempotencyKey,
    inputsHash: computeInputsHash(params.inputs),
    jobId: params.jobId,
    createdAt: new Date().toISOString(),
  };
  writeFileSync(path, JSON.stringify(entry, null, 2));
  logger.debug('Wrote idempotency index entry', { tool: params.tool, jobId: params.jobId });
}

/**
 * Discriminated outcome of `shortCircuitOrFreshJobId` — `continue` means
 * the caller proceeds with dispatch on `jobId`; `shortCircuit` means the
 * caller returns the envelope `value` immediately and skips dispatch.
 */
export type ShortCircuitOutcome<TEnvelope> =
  | { readonly kind: 'continue'; readonly jobId: string }
  | { readonly kind: 'shortCircuit'; readonly value: TEnvelope };

/**
 * One-call wrapper around `resolveIdempotency` that lets each dispatch
 * helper stay under the 50-line cap while keeping the shape of the
 * resulting envelope (toolSuccess / toolStructuredError / errorResponse)
 * tool-specific.
 *
 * Caller supplies:
 * - `replayEnvelope(jobId)` — wraps the per-tool "replay" envelope. Most
 *   tools return a `{ status: 'replay', jobId, pollTool, note }` JSON
 *   string via `toolSuccess`.
 * - `collisionEnvelope(existingJobId)` — wraps the error envelope when
 *   the same key was reused with different inputs.
 *
 * On `continue`, the caller MUST call `registerIdempotentJob` after
 * writing the pending record so subsequent replays converge.
 */
export function shortCircuitOrFreshJobId<TEnvelope>(params: {
  tool: string;
  idempotencyKey: string | undefined;
  inputs: unknown;
  freshJobId: () => string;
  replayEnvelope: (jobId: string) => TEnvelope;
  collisionEnvelope: (existingJobId: string) => TEnvelope;
}): ShortCircuitOutcome<TEnvelope> {
  const r = resolveIdempotency(
    params.tool,
    params.idempotencyKey,
    params.inputs,
    params.freshJobId
  );
  if (r.kind === 'collision') {
    return { kind: 'shortCircuit', value: params.collisionEnvelope(r.existingJobId) };
  }
  if (r.kind === 'replay') {
    return { kind: 'shortCircuit', value: params.replayEnvelope(r.jobId) };
  }
  return { kind: 'continue', jobId: r.jobId };
}

/** Read + schema-validate an index file. Returns `null` on miss / corruption. */
function readIndexEntry(path: string): IdempotencyIndexEntry | null {
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as unknown;
    const parsed = IdempotencyIndexEntrySchema.safeParse(raw);
    if (!parsed.success) {
      logger.warn('Idempotency index file failed schema check', { path });
      return null;
    }
    return parsed.data;
  } catch (err) {
    logger.warn('Idempotency index file read failed', {
      path,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
