/** Shared snapshot binding for writer, query, weather and replay diagnostics. */
import { createHash } from 'node:crypto';
import { isUtf8 } from 'node:buffer';
import { constants, openSync, closeSync, readSync, statSync, fstatSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { resolveInsideRoot } from '../security/safe-path.js';
import {
  ExecutionTraceEntrySchema,
  TraceAttributionSnapshotSchema,
  type TraceRunOrigin,
  type ExecutionTraceEntry,
  type TraceAttributionSnapshot,
  type TraceRelationCounts,
} from './trace-schema.js';

export const TRACE_ATTRIBUTION_FILE = 'trace-attribution.json';
export const MAX_TRACE_ATTRIBUTION_BYTES = 16 * 1024;
export function traceDigest(content: string | Uint8Array): string {
  return createHash('sha256').update(content).digest('hex');
}
/** Do not silently replace invalid source bytes before validating a snapshot. */
export function decodeTraceBytes(content: Uint8Array): string | null {
  if (!isUtf8(content)) return null;
  return Buffer.from(content.buffer, content.byteOffset, content.byteLength).toString('utf8');
}

export function relationCounts(entries: readonly ExecutionTraceEntry[]): TraceRelationCounts {
  const counts: TraceRelationCounts = {
    run_related: 0,
    attempt_owned: 0,
    global_context: 0,
    unattributed: 0,
  };
  for (const entry of entries) counts[entry.captureRelation ?? 'unattributed']++;
  return counts;
}
export type TraceSnapshotReading =
  | {
      readonly status: 'measured';
      readonly snapshot: TraceAttributionSnapshot;
      readonly entries: readonly ExecutionTraceEntry[];
    }
  | { readonly status: 'unmeasured'; readonly reason: string };

/** The whole byte stream must validate, before filtering or paging can hide a loss. */
export function validateTraceSnapshot(
  content: string | Uint8Array,
  runId: string,
  raw: unknown
): TraceSnapshotReading {
  const parsed = TraceAttributionSnapshotSchema.safeParse(raw);
  if (!parsed.success) return { status: 'unmeasured', reason: 'invalid_metadata' };
  const snapshot = parsed.data;
  if (
    snapshot.runId !== runId ||
    snapshot.traceBytes !== Buffer.byteLength(content) ||
    snapshot.traceSha256 !== traceDigest(content)
  )
    return { status: 'unmeasured', reason: 'snapshot_mismatch' };
  const decoded = typeof content === 'string' ? content : decodeTraceBytes(content);
  if (decoded === null) return { status: 'unmeasured', reason: 'invalid_encoding' };
  const entries = snapshotEntries(decoded, runId, snapshot.captureOrigin);
  if (entries === null) return { status: 'unmeasured', reason: 'entry_loss' };
  if (JSON.stringify(relationCounts(entries)) !== JSON.stringify(snapshot.retained))
    return { status: 'unmeasured', reason: 'retained_count_mismatch' };
  return { status: 'measured', snapshot, entries };
}

/** Bounded sidecar read under the same containment root as its trace. */
export function readTraceSnapshot(
  tracePath: string,
  root: string,
  content: Uint8Array,
  runId: string
): TraceSnapshotReading {
  const file = resolveInsideRoot(join(dirname(tracePath), TRACE_ATTRIBUTION_FILE), root);
  if (file === null) return { status: 'unmeasured', reason: 'metadata_path' };
  try {
    const checked = statSync(file);
    if (!checked.isFile()) return { status: 'unmeasured', reason: 'metadata_not_regular' };
    if (checked.size > MAX_TRACE_ATTRIBUTION_BYTES)
      return { status: 'unmeasured', reason: 'metadata_too_large' };
    return validateTraceSnapshot(content, runId, readBoundedMetadata(file, checked));
  } catch {
    return { status: 'unmeasured', reason: 'metadata_unavailable' };
  }
}

/** Read at most cap+1 bytes, even when another writer grows the file after stat. */
function readBoundedMetadata(
  file: string,
  checked: { readonly dev: number; readonly ino: number }
): unknown {
  // A path check alone cannot stop substitution with a pipe before open.
  const fd = openSync(file, constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW);
  try {
    const opened = fstatSync(fd);
    if (
      !opened.isFile() ||
      opened.size > MAX_TRACE_ATTRIBUTION_BYTES ||
      opened.dev !== checked.dev ||
      opened.ino !== checked.ino
    )
      throw new Error('Trace metadata is not the checked bounded regular file');
    const buffer = Buffer.alloc(MAX_TRACE_ATTRIBUTION_BYTES + 1);
    let total = 0;
    while (total < buffer.length) {
      const bytes = readSync(fd, buffer, total, buffer.length - total, null);
      if (bytes === 0) break;
      total += bytes;
    }
    if (total > MAX_TRACE_ATTRIBUTION_BYTES) throw new Error('Trace metadata exceeds read cap');
    const content = decodeTraceBytes(buffer.subarray(0, total));
    if (content === null) throw new Error('Trace metadata is not valid UTF-8');
    return JSON.parse(content) as unknown;
  } finally {
    closeSync(fd);
  }
}

function snapshotEntries(
  content: string,
  runId: string,
  capture: TraceRunOrigin | undefined
): ExecutionTraceEntry[] | null {
  const entries: ExecutionTraceEntry[] = [];
  for (const line of content.split('\n')) {
    if (line.trim() === '') continue;
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      return null;
    }
    const entry = ExecutionTraceEntrySchema.safeParse(raw);
    if (
      !entry.success ||
      entry.data.attributionVersion !== 1 ||
      entry.data.runId !== runId ||
      JSON.stringify(entry.data.captureOrigin) !== JSON.stringify(capture)
    )
      return null;
    entries.push(entry.data);
  }
  return entries;
}
