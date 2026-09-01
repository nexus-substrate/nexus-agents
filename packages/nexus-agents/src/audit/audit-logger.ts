/**
 * nexus-agents/audit - Audit Logger Implementation
 *
 * Structured audit logger with file rotation and hash chain support.
 * SIEM-compatible JSON-L output format.
 *
 * (Source: Issue #193 - Phase 3 structured audit logging)
 *
 * @module audit/audit-logger
 */

/* eslint-disable max-lines --
 * This file sat EXACTLY at the 400-line cap before #4703, so the 16 lines the
 * unanchored-head check adds push it over. Taking the exemption rather than
 * bundling a refactor into a security fix: the right split is to move
 * `verifyChain`/`verifyEvent` beside their existing test
 * (`audit-chain-verify.test.ts`), tracked as #4702. Do not add to
 * this file without doing that extraction first.
 */

import * as crypto from 'node:crypto';
import type { ILogger } from '../core/logger.js';
import { createLogger } from '../core/logger.js';
import { getTimeProvider } from '../core/index.js';
import type {
  IAuditLogger,
  IAuditStorage,
  AuditEvent,
  AuditEventInput,
  AuditLogConfig,
  AuditActor,
  ToolInvocationAuditOpts,
  PolicyDecisionAuditOpts,
  PolicyAuditDecision,
  AuditSeverity,
  AuditOutcome,
  SecurityEventAuditOpts,
  RateLimitAuditOpts,
  TierTransitionAuditOpts,
  TierTransitionPayload,
} from './audit-types.js';
import {
  AuditLogConfigSchema,
  AuditError,
  TierTransitionPayloadSchema,
  TIER_TRANSITION_METADATA_KEY,
  AUDIT_HASH_VERSION_TIER_TRANSITION,
} from './audit-types.js';
import { FileAuditStorage } from './audit-storage.js';
import { canonicalTierTransition, hasTierTransitionPayload } from './tier-transition-hash.js';

// ============================================================================
// ID Generation
// ============================================================================

function generateEventId(): string {
  const timestamp = getTimeProvider().now().toString(36);
  const random = crypto.randomBytes(6).toString('hex');
  return `aud_${timestamp}_${random}`;
}

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
function computeEventHash(event: AuditEvent): string {
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
function verifyEvent(
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

// ============================================================================
// Tier-Transition Extraction (Epic D / ADR-0017, #3842)
// ============================================================================

/**
 * Recover the structured {@link TierTransitionPayload} from an audit event, or
 * `null` if the event is not a (valid) tier-transition event. A tier-transition
 * event is a `governance`-category event whose `metadata.tierTransition` parses
 * against {@link TierTransitionPayloadSchema}. Used by the ratification gate to
 * read transition events back out of the chained log. Gated on the SAME
 * predicate the hash projection uses ({@link hasTierTransitionPayload}), so
 * gate-consumption and hash-coverage cannot diverge (#3961).
 */
export function extractTierTransition(event: AuditEvent): TierTransitionPayload | null {
  if (!hasTierTransitionPayload(event)) return null;
  const raw = event.metadata?.[TIER_TRANSITION_METADATA_KEY];
  const parsed = TierTransitionPayloadSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

// ============================================================================
// System Actor (for internal events)
// ============================================================================

const SYSTEM_ACTOR: AuditActor = {
  type: 'system',
  id: 'nexus-agents',
  name: 'Nexus Agents System',
};

/**
 * Maps a policy verdict to the severity and outcome recorded on the chain
 * (#4991).
 *
 * Written as an exhaustive switch rather than the two ternaries it replaces.
 * Those were `decision === 'deny' ? 'warning' : 'info'` and
 * `decision === 'allow' ? 'success' : 'denied'`, so adding a third verdict
 * silently produced `info` + `denied` — understating the severity AND asserting
 * the call was blocked when it ran. The `never` check makes the NEXT verdict a
 * compile error instead of a quiet mis-mapping.
 *
 * `outcome` describes what happened to the OPERATION, so `would_deny` is a
 * `success`: the call ran to completion. The policy verdict travels separately
 * in `policyDecision`, which is what a soak query filters on.
 */
function policyDecisionFields(decision: PolicyAuditDecision): {
  severity: AuditSeverity;
  outcome: AuditOutcome;
} {
  switch (decision) {
    case 'allow':
      return { severity: 'info', outcome: 'success' };
    case 'deny':
      return { severity: 'warning', outcome: 'denied' };
    case 'would_deny':
      return { severity: 'warning', outcome: 'success' };
    default: {
      const unreachable: never = decision;
      throw new Error(`Unhandled policy decision: ${String(unreachable)}`);
    }
  }
}

// ============================================================================
// Audit Logger Implementation
// ============================================================================

/**
 * One warn() per N dropped events to avoid log spam when the queue cap is
 * saturated under sustained load. Picked so a 10k/s drop rate emits ~1 warn/s.
 */
const DROP_WARN_INTERVAL = 1000;

export class AuditLogger implements IAuditLogger {
  private readonly storage: IAuditStorage;
  private readonly logger: ILogger;
  private readonly enableHashChain: boolean;
  private readonly minSeverity: 'info' | 'warning' | 'critical';
  private readonly categories?: readonly string[] | undefined;
  private readonly maxQueueDepth: number;
  private lastHash: string | null = null;
  private eventQueue: AuditEvent[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly flushIntervalMs: number;
  private closed = false;
  private inFlightFlush: Promise<void> | null = null;
  private droppedEventCount = 0;
  private persistFailureCount = 0;
  private readonly onPersistFailure: ((error: Error) => void) | undefined;

  constructor(
    config: AuditLogConfig,
    storage?: IAuditStorage,
    logger?: ILogger,
    onPersistFailure?: (error: Error) => void
  ) {
    const validated = AuditLogConfigSchema.safeParse(config);
    if (!validated.success) {
      const issues = validated.error.issues
        .map((i) => i.path.join('.') + ': ' + i.message)
        .join('; ');
      throw new AuditError('Invalid AuditLogConfig: ' + issues);
    }

    this.logger = logger ?? createLogger({ component: 'AuditLogger' });
    this.enableHashChain = validated.data.enableHashChain;
    this.minSeverity = validated.data.minSeverity;
    this.categories = validated.data.categories;
    this.flushIntervalMs = validated.data.flushIntervalMs;
    this.maxQueueDepth = validated.data.maxQueueDepth;
    this.storage = storage ?? new FileAuditStorage(validated.data, this.logger);
    this.onPersistFailure = onPersistFailure;

    this.startFlushTimer();
    this.logger.info('AuditLogger initialized', { logDir: config.logDir });
  }

  private startFlushTimer(): void {
    // NOTE: `flush()` (not `flushQueue()`) — the in-memory queue must drain to
    // storage AND storage's own buffer must drain to disk on each tick.
    // See #2979.
    this.flushTimer = setInterval(() => {
      // The timer fires into nobody, so it cannot rethrow to a caller. flush()
      // itself runs the fail-loud handler (error-log + counter + callback) on
      // failure — #3916 / ADR-0017 — so the timer just absorbs the rethrow here
      // to avoid an unhandled rejection. The failure is already observable.
      this.flush().catch(() => {
        /* fail-loud handling already ran inside flush(); swallow the rethrow */
      });
    }, this.flushIntervalMs);
  }

  /**
   * Fail-loud handler for an audit-persist failure (#3916). A dropped/failed
   * audit write undermines the tamper-evident hash chain (ADR-0017 /
   * docs/security/audit-hash-chain-threat-model.md), so unlike the best-effort
   * cost path this is NOT swallowed: it logs prominently at error level,
   * increments a process-lifetime counter (exposed via
   * {@link getPersistFailureCount}), and invokes the optional `onPersistFailure`
   * hook so a governance consumer can escalate (e.g. raise/alert). Callers on the
   * awaited flush()/close() path additionally receive the thrown error directly.
   */
  private recordPersistFailure(err: unknown): void {
    this.persistFailureCount += 1;
    const error = err instanceof Error ? err : new AuditError(String(err));
    this.logger.error('AUDIT PERSIST FAILURE — audit event NOT durably written', error, {
      totalPersistFailures: this.persistFailureCount,
      hashChainEnabled: this.enableHashChain,
    });
    if (this.onPersistFailure !== undefined) {
      // An escalation hook must never break the failure-recording path or mask
      // the original audit error (it would otherwise throw past the counter +
      // the flush() record-then-rethrow, replacing the real I/O error and — on
      // a timer tick — risking an unhandled rejection). Isolate it.
      try {
        this.onPersistFailure(error);
      } catch (hookErr) {
        this.logger.error(
          'AUDIT PERSIST FAILURE — onPersistFailure hook threw (original audit error preserved)',
          hookErr instanceof Error ? hookErr : new AuditError(String(hookErr))
        );
      }
    }
  }

  /**
   * Process-lifetime count of audit flushes that FAILED to persist (#3916). A
   * non-zero value means at least one audit event was not durably written — the
   * hash chain may have a gap. Surfaced so the failure is observable rather than
   * silent.
   */
  getPersistFailureCount(): number {
    return this.persistFailureCount;
  }

  private shouldLog(input: AuditEventInput): boolean {
    // Severity filter
    const severityLevels = { info: 0, warning: 1, critical: 2 };
    const inputLevel = severityLevels[input.severity];
    const minLevel = severityLevels[this.minSeverity];
    if (inputLevel < minLevel) return false;

    // Category filter
    if (this.categories !== undefined && !this.categories.includes(input.category)) return false;

    return true;
  }

  private createEvent(input: AuditEventInput): AuditEvent {
    const now = new Date(getTimeProvider().now());
    const event: AuditEvent = {
      id: generateEventId(),
      version: '1.0',
      timestamp: now.toISOString(),
      timestampMs: now.getTime(),
      category: input.category,
      severity: input.severity,
      outcome: input.outcome,
      action: input.action,
      description: input.description,
      actor: input.actor,
      resource: input.resource,
      requestId: input.requestId,
      traceId: input.traceId,
      sessionId: input.sessionId,
      toolName: input.toolName,
      durationMs: input.durationMs,
      metadata: input.metadata,
      policyName: input.policyName,
      policyDecision: input.policyDecision,
      violationType: input.violationType,
      previousHash: this.enableHashChain ? (this.lastHash ?? undefined) : undefined,
    };

    // #3921: stamp the v2 hash version on a tier-transition event for
    // observability/schema. NOTE: computeEventHash DERIVES the version from the
    // covered head fields (see hasTierTransitionPayload), so this stamp is not
    // load-bearing for integrity — it cannot be trusted to downgrade the hash.
    if (hasTierTransitionPayload(event)) event.hashVersion = AUDIT_HASH_VERSION_TIER_TRANSITION;

    if (this.enableHashChain) {
      event.hash = computeEventHash(event);
      this.lastHash = event.hash;
    }

    return event;
  }

  log(input: AuditEventInput): void {
    if (this.closed) {
      this.logger.warn('Attempted to log after close');
      return;
    }

    if (!this.shouldLog(input)) return;

    const event = this.createEvent(input);
    this.eventQueue.push(event);

    if (this.eventQueue.length > this.maxQueueDepth) {
      // Drop-oldest: under sustained pressure, recent events are more useful
      // for correlation than the oldest unflushed ones. See #2979.
      const dropCount = this.eventQueue.length - this.maxQueueDepth;
      this.eventQueue.splice(0, dropCount);
      const priorDropped = this.droppedEventCount;
      this.droppedEventCount += dropCount;
      const crossedThreshold =
        Math.floor(this.droppedEventCount / DROP_WARN_INTERVAL) >
        Math.floor(priorDropped / DROP_WARN_INTERVAL);
      if (priorDropped === 0 || crossedThreshold) {
        this.logger.warn('Audit event queue full; dropping oldest events', {
          maxQueueDepth: this.maxQueueDepth,
          totalDropped: this.droppedEventCount,
        });
      }
    }

    this.logger.debug('Audit event queued', {
      id: event.id,
      category: event.category,
      action: event.action,
    });
  }

  logToolInvocation(opts: ToolInvocationAuditOpts): void {
    this.log({
      category: 'tool_invocation',
      severity: opts.outcome === 'failure' || opts.outcome === 'error' ? 'warning' : 'info',
      outcome: opts.outcome,
      action: 'tool.invoke',
      description: opts.errorMessage,
      actor: opts.actor,
      resource: { type: 'tool', id: opts.toolName, name: opts.toolName },
      requestId: opts.requestId,
      toolName: opts.toolName,
      durationMs: opts.durationMs,
      metadata: opts.metadata,
    });
  }

  logPolicyDecision(opts: PolicyDecisionAuditOpts): void {
    this.log({
      category: 'authorization',
      ...policyDecisionFields(opts.decision),
      action: 'policy.evaluate',
      description: opts.reason,
      actor: opts.actor,
      resource: { type: 'tool', id: opts.toolName, name: opts.toolName },
      requestId: opts.requestId,
      policyName: opts.policyName,
      policyDecision: opts.decision,
      ...(opts.occurrence === undefined ? {} : { policyOccurrence: opts.occurrence }),
      metadata: opts.metadata,
    });
  }

  logSecurityEvent(opts: SecurityEventAuditOpts): void {
    this.log({
      category: 'security',
      severity: opts.severity,
      outcome: 'failure',
      action: `security.${opts.eventType}`,
      description: opts.description,
      actor: opts.actor,
      requestId: opts.requestId,
      violationType: opts.eventType,
      metadata: opts.metadata,
    });
  }

  logRateLimitViolation(opts: RateLimitAuditOpts): void {
    this.log({
      category: 'security',
      severity: 'warning',
      outcome: 'denied',
      action: 'rate_limit.exceeded',
      description: `Rate limit exceeded: ${String(opts.currentRate)}/${String(opts.limitRate)} requests`,
      actor: opts.actor,
      resource: { type: 'tool', id: opts.toolName, name: opts.toolName },
      requestId: opts.requestId,
      toolName: opts.toolName,
      metadata: { currentRate: opts.currentRate, limitRate: opts.limitRate },
    });
  }

  /**
   * Log an authority-tier transition (Epic D / ADR-0017, #3842). A promotion or
   * demotion of a loop's authority tier is recorded as a hash-chained
   * `governance`-category event whose `metadata.tierTransition` carries the
   * structured {@link TierTransitionPayload} ({subject, fromTier, toTier,
   * evidenceRef, ratificationVoteRef?}).
   *
   * The emitter does NOT itself enforce the ratification invariant (a promotion
   * with no `ratificationVoteRef` is still chained — tampering with the log to
   * remove the field must not erase the event). The invariant is enforced by the
   * ratification gate (`scripts/check-authority-tier-drift.ts`), which reads the
   * chained events back and FAILS a `promotion` lacking a vote ref. A promotion
   * is emitted at `warning` severity (it grants authority) so it surfaces above
   * the default info floor; a demotion is `info` (it is the safe direction).
   */
  logTierTransition(opts: TierTransitionAuditOpts): void {
    const payload: TierTransitionPayload = TierTransitionPayloadSchema.parse({
      kind: opts.kind,
      subject: opts.subject,
      fromTier: opts.fromTier,
      toTier: opts.toTier,
      evidenceRef: opts.evidenceRef,
      ...(opts.ratificationVoteRef !== undefined
        ? { ratificationVoteRef: opts.ratificationVoteRef }
        : {}),
    });
    this.log({
      category: 'governance',
      severity: opts.kind === 'promotion' ? 'warning' : 'info',
      outcome: 'success',
      action: `tier.${opts.kind}`,
      description: `Authority-tier ${opts.kind}: '${opts.subject}' ${opts.fromTier} → ${opts.toTier}`,
      actor: opts.actor ?? SYSTEM_ACTOR,
      resource: { type: 'loop', id: opts.subject, name: opts.subject },
      requestId: opts.requestId,
      metadata: { ...opts.metadata, [TIER_TRANSITION_METADATA_KEY]: payload },
    });
  }

  /** Log system startup event */
  logSystemStartup(metadata?: Record<string, unknown>): void {
    this.log({
      category: 'system',
      severity: 'info',
      outcome: 'success',
      action: 'system.startup',
      description: 'Nexus Agents system started',
      actor: SYSTEM_ACTOR,
      metadata,
    });
  }

  /** Log system shutdown event */
  logSystemShutdown(metadata?: Record<string, unknown>): void {
    this.log({
      category: 'system',
      severity: 'info',
      outcome: 'success',
      action: 'system.shutdown',
      description: 'Nexus Agents system shutdown',
      actor: SYSTEM_ACTOR,
      metadata,
    });
  }

  private async drainAndFlushOnce(): Promise<void> {
    if (this.eventQueue.length > 0) {
      const events = this.eventQueue.splice(0, this.eventQueue.length);
      for (const event of events) {
        await this.storage.write(event);
      }
    }
    await this.storage.flush();
  }

  /**
   * Drain the in-memory queue to storage AND flush the storage's own buffer
   * to disk. Concurrent calls are coalesced into a single in-flight promise
   * so an overlapping flush-timer tick cannot spawn parallel drains (see
   * #2979). A caller arriving while a flush is already running awaits the
   * existing promise; their newly-queued events, if any, are picked up by
   * the next flush.
   */
  async flush(): Promise<void> {
    if (this.inFlightFlush !== null) return this.inFlightFlush;
    // Record-then-rethrow: a failed flush is fail-loud both ways — the counter +
    // error-log + callback fire (observable even when the caller ignores the
    // promise), AND the error still propagates to an awaiting governance caller
    // (#3916). The single in-flight drain is shared, so the timer's catch and a
    // concurrent awaited flush() both observe the same failure exactly once.
    const drain = this.drainAndFlushOnce()
      .catch((err: unknown) => {
        this.recordPersistFailure(err);
        throw err;
      })
      .finally(() => {
        this.inFlightFlush = null;
      });
    this.inFlightFlush = drain;
    return drain;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;

    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    await this.flush();
    await this.storage.close();
    this.logger.info('AuditLogger closed');
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createAuditLogger(
  config: AuditLogConfig,
  storage?: IAuditStorage,
  logger?: ILogger,
  onPersistFailure?: (error: Error) => void
): AuditLogger {
  return new AuditLogger(config, storage, logger, onPersistFailure);
}
