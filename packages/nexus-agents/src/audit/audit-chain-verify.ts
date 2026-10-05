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
 * Discriminated result from `verifyChain()`. Either the chain validates cleanly,
 * or one of three named tampering signals fires at a specific event index.
 */
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

export type ChainVerification =
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
    };

/** Per-event check; null when the event passes. Extracted to keep verifyChain under the complexity cap. */
export function verifyEvent(
  event: AuditEvent,
  index: number,
  priorHash: string | undefined
): ChainVerification | null {
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
 * Verify a hash-chained sequence of audit events. Walks the array in order and
 * checks (a) each event's `hash` field matches a recomputation of its content,
 * (b) each event's `previousHash` matches the prior event's `hash`, and (c) no
 * event in a hash-chained log is missing its `hash`. Returns the first
 * detected tampering signal — does NOT continue past the first failure, since
 * one tamper invalidates everything downstream.
 *
 * Backward compat: events written when `enableHashChain: false` carry no `hash`
 * field. If the FIRST event has no `hash`, the entire batch is treated as
 * un-chained and verification short-circuits to `{ok: true}`. If hash fields
 * appear partway through (mixed-mode log), `missing_hash` fires.
 *
 * @param events - Sequence of AuditEvent in append order
 * @returns ChainVerification result
 */
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

export function verifyChain(events: readonly AuditEvent[]): ChainVerification {
  // Both early exits below are honest `ok: true` verdicts — there is nothing to
  // contradict — but neither verified anything, so they say so. #4768: an empty
  // log verified clean was indistinguishable from a correct one, including when
  // the caller pointed at the wrong directory.
  if (events.length === 0) return { ok: true, eventCount: 0, notVerified: 'empty' };
  if (events[0]?.hash === undefined) {
    return { ok: true, eventCount: events.length, notVerified: 'unchained' };
  }

  let priorHash: string | undefined = undefined;
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (event === undefined) continue;
    const failure = verifyEvent(event, i, priorHash);
    if (failure !== null) return failure;
    priorHash = event.hash;
  }

  // #4703: links verified — but did the chain START where it claims to?
  // `verifyEvent` skips the previousHash comparison at index 0, so a
  // front-truncated chain used to return a clean `ok: true` while its head
  // still carried a live pointer to the deleted event.
  const headPreviousHash = events[0].previousHash;
  if (headPreviousHash !== undefined) {
    return {
      ok: true,
      eventCount: events.length,
      unanchoredHead: {
        previousHash: headPreviousHash,
        detail:
          `chain head references predecessor ${headPreviousHash} which is not in this chain — ` +
          `expected after log rotation/pruning, and also what front-truncation looks like. ` +
          `Links all verify; the chain's ORIGIN is unverified.`,
      },
    };
  }

  return { ok: true, eventCount: events.length };
}
