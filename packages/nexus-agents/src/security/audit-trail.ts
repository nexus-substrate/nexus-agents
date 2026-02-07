/**
 * nexus-agents/security - Audit Trail
 *
 * Machine-readable JSON audit events for security pipeline decisions.
 * Every trust classification, policy gate decision, corroboration check,
 * and reputation assessment is recorded as a structured event.
 *
 * Satisfies CLAUDE.md requirement: "Every action on untrusted input must
 * log: trust tier, sources cited, policy gate decision, stripped content."
 *
 * @module security/audit-trail
 * (Source: Issue #832 — Security audit trail)
 */

import { getTimeProvider } from '../core/index.js';
import type { TrustTier } from './trust-types.js';
import type { AgentActionType } from './action-schema.js';

// ============================================================================
// Types
// ============================================================================

/** Maximum stored events before oldest are evicted. */
const MAX_EVENTS = 10_000;

/**
 * Discriminated union of audit event types.
 * Each event captures a single security pipeline decision.
 */
export type AuditEvent =
  | TrustClassificationEvent
  | PolicyGateEvent
  | CorroborationEvent
  | ReputationEvent
  | SanitizationEvent;

/** Base fields shared by all audit events. */
interface AuditEventBase {
  readonly id: string;
  readonly timestamp: string;
  readonly component: string;
}

/** Trust classification decision. */
export interface TrustClassificationEvent extends AuditEventBase {
  readonly type: 'trust_classification';
  readonly username: string;
  readonly assignedTier: TrustTier;
  readonly userRole: string;
  readonly isAllowlisted: boolean;
  readonly wasDowngraded: boolean;
  readonly reason: string;
}

/** Policy gate evaluation result. */
export interface PolicyGateEvent extends AuditEventBase {
  readonly type: 'policy_gate';
  readonly actionType: AgentActionType;
  readonly allowed: boolean;
  readonly requiresApproval: boolean;
  readonly inputTrustTier: TrustTier;
  readonly violationRules: readonly string[];
}

/** Corroboration validation result. */
export interface CorroborationEvent extends AuditEventBase {
  readonly type: 'corroboration';
  readonly actionType: AgentActionType;
  readonly satisfied: boolean;
  readonly sourceCount: number;
  readonly missingRequirements: readonly string[];
}

/** Reputation assessment result. */
export interface ReputationEvent extends AuditEventBase {
  readonly type: 'reputation';
  readonly username: string;
  readonly reputationScore: number;
  readonly isSuspicious: boolean;
  readonly effectiveTier: TrustTier;
  readonly signalCount: number;
}

/** Input sanitization result. */
export interface SanitizationEvent extends AuditEventBase {
  readonly type: 'sanitization';
  readonly source: string;
  readonly wasModified: boolean;
  readonly strippedCount: number;
  readonly injectionFlagCount: number;
}

/** Query filter for retrieving audit events. */
export interface AuditQuery {
  readonly type?: AuditEvent['type'];
  readonly since?: string;
  readonly until?: string;
  readonly trustTier?: TrustTier;
  readonly limit?: number;
}

// ============================================================================
// AuditTrail
// ============================================================================

/**
 * Append-only audit trail for security pipeline decisions.
 * Events are bounded by MAX_EVENTS to prevent unbounded growth.
 */
export class AuditTrail {
  private events: AuditEvent[] = [];
  private nextId = 1;

  /** Appends an event to the trail. Returns the assigned event ID. */
  append(event: Omit<AuditEvent, 'id' | 'timestamp'>): string {
    const id = `audit-${String(this.nextId++)}`;
    const fullEvent = {
      ...event,
      id,
      timestamp: getTimeProvider().nowIso(),
    } as AuditEvent;

    this.events.push(fullEvent);
    this.enforceLimit();
    return id;
  }

  /** Queries events matching the given filter. */
  query(filter: AuditQuery = {}): readonly AuditEvent[] {
    let results = this.events as readonly AuditEvent[];

    if (filter.type !== undefined) {
      results = results.filter((e) => e.type === filter.type);
    }

    if (filter.since !== undefined) {
      results = filterSince(results, filter.since);
    }

    if (filter.until !== undefined) {
      results = filterUntil(results, filter.until);
    }

    if (filter.trustTier !== undefined) {
      results = filterByTrustTier(results, filter.trustTier);
    }

    const limit = filter.limit ?? results.length;
    return results.slice(-limit);
  }

  /** Returns the total number of events. */
  get size(): number {
    return this.events.length;
  }

  /** Clears all events. */
  clear(): void {
    this.events = [];
  }

  /** Enforces MAX_EVENTS bound. */
  private enforceLimit(): void {
    if (this.events.length > MAX_EVENTS) {
      this.events = this.events.slice(-MAX_EVENTS);
    }
  }
}

// ============================================================================
// Filter Helpers
// ============================================================================

function filterSince(events: readonly AuditEvent[], since: string): readonly AuditEvent[] {
  const sinceTime = new Date(since).getTime();
  return events.filter((e) => new Date(e.timestamp).getTime() >= sinceTime);
}

function filterUntil(events: readonly AuditEvent[], until: string): readonly AuditEvent[] {
  const untilTime = new Date(until).getTime();
  return events.filter((e) => new Date(e.timestamp).getTime() <= untilTime);
}

function filterByTrustTier(events: readonly AuditEvent[], tier: TrustTier): readonly AuditEvent[] {
  return events.filter((e) => {
    if (e.type === 'trust_classification') return e.assignedTier === tier;
    if (e.type === 'policy_gate') return e.inputTrustTier === tier;
    if (e.type === 'reputation') return e.effectiveTier === tier;
    return true;
  });
}

// ============================================================================
// Convenience Emitters
// ============================================================================

/**
 * Records a trust classification decision.
 */
export function emitTrustEvent(
  trail: AuditTrail,
  data: Omit<TrustClassificationEvent, 'id' | 'timestamp' | 'type' | 'component'>
): string {
  return trail.append({
    type: 'trust_classification',
    component: 'trust-classifier',
    ...data,
  });
}

/**
 * Records a policy gate evaluation.
 */
export function emitPolicyEvent(
  trail: AuditTrail,
  data: Omit<PolicyGateEvent, 'id' | 'timestamp' | 'type' | 'component'>
): string {
  return trail.append({
    type: 'policy_gate',
    component: 'policy-gate',
    ...data,
  });
}

/**
 * Records a corroboration validation.
 */
export function emitCorroborationEvent(
  trail: AuditTrail,
  data: Omit<CorroborationEvent, 'id' | 'timestamp' | 'type' | 'component'>
): string {
  return trail.append({
    type: 'corroboration',
    component: 'corroboration-validator',
    ...data,
  });
}

/**
 * Records a reputation assessment.
 */
export function emitReputationEvent(
  trail: AuditTrail,
  data: Omit<ReputationEvent, 'id' | 'timestamp' | 'type' | 'component'>
): string {
  return trail.append({
    type: 'reputation',
    component: 'reputation-model',
    ...data,
  });
}

/**
 * Records an input sanitization result.
 */
export function emitSanitizationEvent(
  trail: AuditTrail,
  data: Omit<SanitizationEvent, 'id' | 'timestamp' | 'type' | 'component'>
): string {
  return trail.append({
    type: 'sanitization',
    component: 'input-sanitizer',
    ...data,
  });
}

/** Creates a new AuditTrail instance. */
export function createAuditTrail(): AuditTrail {
  return new AuditTrail();
}
