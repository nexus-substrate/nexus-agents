/** Shared snapshot binding for writer, query, weather and replay diagnostics. */
import { createHash } from 'node:crypto';
import { openSync, closeSync, readSync, statSync } from 'node:fs';
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
export function traceDigest(content: string): string {
  return createHash('sha256').update(content).digest('hex');
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
  content: string,
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
  const entries = snapshotEntries(content, runId, snapshot.captureOrigin);
  if (entries === null) return { status: 'unmeasured', reason: 'entry_loss' };
  if (JSON.stringify(relationCounts(entries)) !== JSON.stringify(snapshot.retained))
    return { status: 'unmeasured', reason: 'retained_count_mismatch' };
  return { status: 'measured', snapshot, entries };
}

/** Bounded sidecar read under the same containment root as its trace. */
export function readTraceSnapshot(
  tracePath: string,
  root: string,
  content: string,
  runId: string
): TraceSnapshotReading {
  const file = resolveInsideRoot(join(dirname(tracePath), TRACE_ATTRIBUTION_FILE), root);
  if (file === null) return { status: 'unmeasured', reason: 'metadata_path' };
  try {
    if (statSync(file).size > MAX_TRACE_ATTRIBUTION_BYTES)
      return { status: 'unmeasured', reason: 'metadata_too_large' };
    return validateTraceSnapshot(content, runId, readBoundedMetadata(file));
  } catch {
    return { status: 'unmeasured', reason: 'metadata_unavailable' };
  }
}

/** Read at most cap+1 bytes, even when another writer grows the file after stat. */
function readBoundedMetadata(file: string): unknown {
  const fd = openSync(file, 'r');
  try {
    const buffer = Buffer.alloc(MAX_TRACE_ATTRIBUTION_BYTES + 1);
    let total = 0;
    while (total < buffer.length) {
      const bytes = readSync(fd, buffer, total, buffer.length - total, null);
      if (bytes === 0) break;
      total += bytes;
    }
    if (total > MAX_TRACE_ATTRIBUTION_BYTES) throw new Error('Trace metadata exceeds read cap');
    return JSON.parse(buffer.subarray(0, total).toString('utf8')) as unknown;
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
