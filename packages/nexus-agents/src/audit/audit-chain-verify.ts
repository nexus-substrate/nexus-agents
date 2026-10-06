/**
 * nexus-agents/audit - Hash Chain Verification
 *
 * Pure event hashing and verification for the audit logger and its readers.
 *
 * @module audit/audit-chain-verify
 */

import * as crypto from 'node:crypto';
import {
  type AuditEvent,
  AUDIT_HASH_VERSION_TIER_TRANSITION,
  TIER_TRANSITION_METADATA_KEY,
} from './audit-types.js';
import { canonicalTierTransition, hasTierTransitionPayload } from './tier-transition-hash.js';

// ============================================================================
// Hash Chain Support
// ============================================================================

/**
 * Compute the tamper-evidence hash of an event under a VERSIONED projection
 * (#3921). A non-transition event hashes only the stable head fields (the v1
 * projection, byte-identical to pre-#3921 — so existing chains keep verifying);
 * a tier-transition event additionally folds in `hashVersion: 2` and the
 * canonicalized `metadata.tierTransition` payload, so its integrity-critical
 * fields are chain-covered. The version is DERIVED from the covered head fields
 * (see {@link hasTierTransitionPayload}), never read from the mutable stored
 * `hashVersion`, so a tampered/stripped version field cannot downgrade the hash.
 */
export function computeEventHash(event: AuditEvent): string {
  const projection: Record<string, unknown> = {
    id: event.id,
    timestamp: event.timestamp,
    category: event.category,
    action: event.action,
    outcome: event.outcome,
    actor: event.actor,
    previousHash: event.previousHash,
  };
  if (hasTierTransitionPayload(event)) {
    projection['hashVersion'] = AUDIT_HASH_VERSION_TIER_TRANSITION;
    const raw = event.metadata?.[TIER_TRANSITION_METADATA_KEY];
    projection['tierTransition'] = canonicalTierTransition(raw);
  }
  return crypto.createHash('sha256').update(JSON.stringify(projection)).digest('hex');
}

// ============================================================================
// Hash Chain Verification (#2281)
// ============================================================================

/**
 * How much of a log a {@link ChainVerification} actually covers (#4805).
 *
 * `skipped: 0` is a positive statement of full coverage, distinct from an
 * absent `coverage`, which means nobody said.
 */
export interface ChainCoverage {
  /** Lines the loader saw that never became events. */
  readonly skipped: number;
  /** Files the loader could not read at all. */
  readonly unreadableFiles: number;
}

/** Bounded diagnostics; counts include entries omitted from the arrays. */
interface ChainDiagnostics {
  eventCount: number;
  breaks: Array<{ index: number; kind: 'restart' | 'fork' | 'mismatch' }>;
  segments: ChainSegment[];
  breakCount: number;
  segmentCount: number;
  tamperedCount: number;
  breaksTruncated: boolean;
  segmentsTruncated: boolean;
}

/** Inclusive, zero-based bounds; ok describes internal integrity, not the incoming link. */
interface ChainSegment {
  start: number;
  end: number;
  ok: boolean;
  firstFailure?: { index: number; kind: 'tampered' | 'missing_hash' };
}

/** Keep legacy verdict construction compatible; verifyChain always supplies diagnostics. */
export type ChainVerification = Partial<ChainDiagnostics> &
  (
    | {
        ok: true;
        eventCount: number;
        /**
         * Set when the chain's first event carries a `previousHash` (#4703):
         * links verified, ORIGIN unverified. Rotation and front-truncation look
         * identical here and the verifier cannot tell them apart, so it reports
         * rather than judges — see T6 in the audit hash-chain threat model.
         */
        unanchoredHead?: { previousHash: string; detail: string };
        /**
         * Set when `ok: true` carries NO cryptographic assurance (#4768, #4660).
         *
         * - `'empty'` — zero events. Nothing was verified. Reported because
         *   pointing the verifier at the wrong directory produces exactly this,
         *   and a bare `ok: true` reads as "the chain is intact".
         * - `'unchained'` — events exist but the first carries no `hash`, so the
         *   whole batch is treated as un-hashed and no links are checked.
         *
         * Absent means links were actually verified. Callers deciding whether
         * tamper-evidence holds MUST read this: `ok: true` alone does not
         * distinguish a verified chain from an absent one, which is the
         * "default reported as a measurement" shape the mission text rules out.
         */
        notVerified?: 'empty' | 'unchained';
        /**
         * Set when the verdict covers only PART of the log it was asked about
         * (#4805, panel Option A 4-1).
         *
         * A different axis from {@link notVerified}, which says nothing was
         * verified. Here real links WERE checked — just not over every line the
         * loader saw. `skipped` counts the lines that never became events
         * (unparseable, schema-rejected, or in a file that could not be read).
         *
         * The tool reports coverage as sibling fields too, but this type is the
         * evidence artifact: it is serialized, persisted, and passed around
         * without its siblings, and the doctrine is that provenance travels WITH
         * the evidence rather than beside it.
         *
         * Absent means coverage is UNKNOWN, not complete — the verifier is given
         * only the events, so a caller that did not supply coverage cannot be
         * reported as having full coverage. {@link withCoverage} is how a caller
         * that knows says so, including saying "nothing was skipped".
         */
        coverage?: ChainCoverage;
      }
    | {
        ok: false;
        reason: 'hash_mismatch' | 'previous_hash_mismatch' | 'missing_hash';
        eventIndex: number;
        eventId: string;
        detail: string;
      }
  );

/** Per-event check; null when the event passes. Extracted to keep verifyChain under the complexity cap. */
export function verifyEvent(
  event: AuditEvent,
  index: number,
  priorHash: string | undefined
): EventFailure | null {
  if (event.hash === undefined) {
    return {
      ok: false,
      reason: 'missing_hash',
      eventIndex: index,
      eventId: event.id,
      detail: `event at index ${String(index)} has no hash field but the chain started hashed`,
    };
  }
  if (index > 0 && event.previousHash !== priorHash) {
    return {
      ok: false,
      reason: 'previous_hash_mismatch',
      eventIndex: index,
      eventId: event.id,
      detail: `event at index ${String(index)} previousHash=${event.previousHash ?? '(missing)'} does not match prior event hash=${priorHash ?? '(missing)'}`,
    };
  }
  const recomputed = computeEventHash(event);
  if (recomputed !== event.hash) {
    return {
      ok: false,
      reason: 'hash_mismatch',
      eventIndex: index,
      eventId: event.id,
      detail: `event at index ${String(index)} stored hash=${event.hash} does not match recomputed=${recomputed}`,
    };
  }
  return null;
}

/**
 * Attach coverage to a passing verdict — the caller that read the log is the
 * only one who knows what it skipped (#4805).
 *
 * A failing verdict is returned unchanged: it already names a specific event
 * index, and coverage does not qualify a detected break.
 */
export function withCoverage(
  verification: ChainVerification,
  coverage: ChainCoverage
): ChainVerification {
  if (!verification.ok) return verification;
  return { ...verification, coverage };
}

/** Each response array retains at most this many entries, independently. */
const DIAGNOSTIC_CAP = 100;

type EventFailure = Extract<ChainVerification, { ok: false }>;

function emptyDiagnostics(eventCount: number): ChainDiagnostics {
  return {
    eventCount,
    breaks: [],
    segments: [],
    breakCount: 0,
    segmentCount: 0,
    tamperedCount: 0,
    breaksTruncated: false,
    segmentsTruncated: false,
  };
}

function finishSegment(diagnostics: ChainDiagnostics, segment: ChainSegment): void {
  diagnostics.segmentCount++;
  if (diagnostics.segments.length < DIAGNOSTIC_CAP) diagnostics.segments.push(segment);
  else diagnostics.segmentsTruncated = true;
}

function classifyLinkBreak(
  event: AuditEvent,
  priorHash: string | undefined,
  index: number,
  seenHashes: ReadonlySet<string>
): ChainDiagnostics['breaks'][number]['kind'] | undefined {
  if (index === 0) return undefined;
  if (event.previousHash === undefined) return 'restart';
  if (event.previousHash === priorHash) return undefined;
  return seenHashes.has(event.previousHash) ? 'fork' : 'mismatch';
}

function recordBreak(
  diagnostics: ChainDiagnostics,
  index: number,
  kind: ChainDiagnostics['breaks'][number]['kind']
): void {
  diagnostics.breakCount++;
  if (diagnostics.breaks.length < DIAGNOSTIC_CAP) diagnostics.breaks.push({ index, kind });
  else diagnostics.breaksTruncated = true;
}

function recordContentFailure(
  diagnostics: ChainDiagnostics,
  segment: ChainSegment,
  failure: EventFailure
): void {
  segment.ok = false;
  segment.firstFailure = {
    index: failure.eventIndex,
    kind: failure.reason === 'hash_mismatch' ? 'tampered' : 'missing_hash',
  };
  if (failure.reason === 'hash_mismatch') diagnostics.tamperedCount++;
}

/** Scan every event, even after failure and after the diagnostic arrays are full. */
function scanSegments(
  events: readonly AuditEvent[],
  diagnostics: ChainDiagnostics
): EventFailure | null {
  const seenHashes = new Set<string>();
  let priorHash: string | undefined;
  let firstFailure: EventFailure | null = null;
  let segment: ChainSegment = { start: 0, end: 0, ok: true };
  for (const [index, event] of events.entries()) {
    // Preserve legacy failure precedence: missing hash, link mismatch, then content.
    firstFailure ??= verifyEvent(event, index, priorHash);
    // Check content independently: a broken incoming link cannot mask tampering.
    const contentFailure = verifyEvent(event, index, event.previousHash);
    const linkKind = classifyLinkBreak(event, priorHash, index, seenHashes);
    const breakKind = linkKind ?? (contentFailure === null ? undefined : 'mismatch');
    if (breakKind !== undefined) {
      if (index > 0) {
        finishSegment(diagnostics, segment);
        segment = { start: index, end: index, ok: true };
      }
      recordBreak(diagnostics, index, breakKind);
    }
    segment.end = index;
    if (contentFailure !== null) recordContentFailure(diagnostics, segment, contentFailure);
    if (event.hash !== undefined) seenHashes.add(event.hash);
    priorHash = event.hash;
  }
  finishSegment(diagnostics, segment);
  return firstFailure;
}

/**
 * Verify all hashed events and links, retaining the first failure for compatibility.
 * Every link or content break starts a segment; its incoming link is excluded
 * from its internal verdict, but its first event's content is always checked.
 * Any break keeps overall ok false. Diagnostics are capped, verification is not.
 * Empty and legacy unchained batches explicitly report that nothing was verified.
 */
export function verifyChain(events: readonly AuditEvent[]): ChainVerification & ChainDiagnostics {
  const diagnostics = emptyDiagnostics(events.length);
  if (events.length === 0) return { ok: true, notVerified: 'empty', ...diagnostics };
  if (events[0]?.hash === undefined) {
    return { ok: true, notVerified: 'unchained', ...diagnostics };
  }
  const firstFailure = scanSegments(events, diagnostics);
  if (firstFailure !== null) return { ...firstFailure, ...diagnostics };

  // Rotation and front-truncation remain indistinguishable: origin is unverified.
  const headPreviousHash = events[0].previousHash;
  if (headPreviousHash !== undefined) {
    return {
      ok: true,
      ...diagnostics,
      unanchoredHead: {
        previousHash: headPreviousHash,
        detail:
          `chain head references predecessor ${headPreviousHash} which is not in this chain — ` +
          `expected after log rotation/pruning, and also what front-truncation looks like. ` +
          `Links all verify; the chain's ORIGIN is unverified.`,
      },
    };
  }
  return { ok: true, ...diagnostics };
}
