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
  | SanitizationEvent
  | GraphExecutionAuditEvent
  | ClawGuardViolationEvent;

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
  /**
   * The agent action evaluated, for the security policy-gate path
   * (security/policy-gate.ts). Optional because the PIPELINE policy path
   * (pipeline/policy-evaluator.ts → #3710) records stage-boundary policy
   * decisions that have no `AgentAction` — they carry {@link stageType} +
   * {@link mode} + {@link ruleIds} instead. Security emitters always set it.
   */
  readonly actionType?: AgentActionType;
  readonly allowed: boolean;
  readonly requiresApproval: boolean;
  readonly inputTrustTier: TrustTier;
  readonly violationRules: readonly string[];
  /**
   * Pipeline-policy fields (#3710). Carried for the dev-pipeline
   * consensus→execute seam so the DURABLE record can distinguish soak (`warn`)
   * from enforce (`block`) and which rules/stage fired — without these the
   * persisted event is useless to the tune/readiness loop. Absent for the
   * security policy-gate path.
   */
  /** Enforcement mode the decision was made under: `warn` (soak) or `block` (enforce). */
  readonly mode?: 'off' | 'warn' | 'block';
  /** IDs of the policy rules that fired (mirrors `violationRules` for the pipeline path). */
  readonly ruleIds?: readonly string[];
  /** Type of the stage the gate guarded (e.g. `execute`). */
  readonly stageType?: string;
  /**
   * #3727: discriminates a per-EVALUATION SUMMARY record (`'summary'` — emitted
   * once per pipeline policy evaluation INCLUDING clean ones, the DENOMINATOR for
   * the would-block rate) from a per-VIOLATION record (`'violation'` — the
   * existing #3710 per-violation records). Absent for the security policy-gate
   * path. Denominator = count(recordKind==='summary'); numerator = summaries with
   * `violationCount > 0`. Scope the #3710 count-parity assertion to `'violation'`.
   */
  readonly recordKind?: 'summary' | 'violation';
  /** #3727: number of violations in THIS evaluation (set on the summary record). */
  readonly violationCount?: number;
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

/** Summary of a single element stripped during sanitization. */
export interface StrippedElementSummary {
  /** Truncated tag text (≤30 chars + '...' from the sanitizer). */
  readonly tag: string;
  /** Reason the element was removed (e.g. 'Trail of Bits injection vector'). */
  readonly reason: string;
}

/** Max stripped-element details retained per sanitization event. */
export const MAX_STRIPPED_ELEMENTS_PER_EVENT = 20;

/** Input sanitization result. */
export interface SanitizationEvent extends AuditEventBase {
  readonly type: 'sanitization';
  readonly source: string;
  readonly wasModified: boolean;
  readonly strippedCount: number;
  readonly injectionFlagCount: number;
  /**
   * Per-element tag/reason details, truncated to at most
   * MAX_STRIPPED_ELEMENTS_PER_EVENT entries. Required by CLAUDE.md's
   * Untrusted Input Policy: "Log stripped elements for audit trail."
   */
  readonly strippedElements: readonly StrippedElementSummary[];
}

/**
 * ClawGuard AUDIT-mode violation (#4097). Records a tool call that VIOLATED the
 * derived access policy but was ALLOWED to proceed because the policy is in
 * `audit` mode (log-and-allow). Persisting these is what lets the audit→enforce
 * graduation loop size the real violation rate from durable telemetry rather
 * than ephemeral logs.
 */
export interface ClawGuardViolationEvent extends AuditEventBase {
  readonly type: 'clawguard_violation';
  /** The tool whose call violated the policy. */
  readonly toolName: string;
  /** Human-readable warning from the access decision (may be truncated). */
  readonly warning: string;
  /** Source of the derived policy (`llm` / `fallback-keyword` / `bypass`). */
  readonly policySource: string;
  /** Policy mode under which the violation was allowed (e.g. `audit`). */
  readonly mode: string;
  /** Request ID of the offending tool call, for correlation. */
  readonly requestId: string;
  /**
   * Which rule produced the verdict (#5106) — `unbypassable:tool`,
   * `unbypassable:path`, `allowedTools`, `allowedTools:confirm_risky`.
   *
   * A first-class field rather than prose inside `warning`, because `warning`
   * is truncated at 500 chars and a long attacker-selectable `path` argument
   * pushes the rule off the end. A chain reader must be able to tell an
   * unbypassable denylist hit from an allowlist miss without parsing a string
   * that may have been cut mid-word.
   *
   * Absent for verdicts that carry no rule (an audit-mode allowlist
   * observation), which is why it is optional rather than defaulted — there is
   * no rule to name, and inventing one would misreport.
   */
  readonly matchedRule?: string;
}

/** Graph execution lifecycle event (Issue #839). */
export interface GraphExecutionAuditEvent extends AuditEventBase {
  readonly type: 'graph_execution';
  readonly graphEvent: string;
  readonly nodeId?: string;
  readonly stepNumber: number;
  readonly detail: string;
}

/**
 * Query filter for retrieving audit events.
 *
 * The post-mortem dimensions (#3197) — `actionType`, `actor`, `violationRule`
 * — NARROW to events that actually carry the field (events lacking it are
 * excluded), unlike `trustTier`'s legacy keep-non-applicable behavior. Only
 * dimensions backed by a real event field are offered: `resource` and
 * `policyName` from the original ask were dropped because no AuditEvent
 * records them (a filter with no backing field would be dead config); the
 * policy-rule intent is served by `violationRule` (PolicyGateEvent's
 * `violationRules`).
 */
export interface AuditQuery {
  readonly type?: AuditEvent['type'];
  readonly since?: string;
  readonly until?: string;
  readonly trustTier?: TrustTier;
  /** Match PolicyGate/Corroboration events by their `actionType`. */
  readonly actionType?: AgentActionType;
  /** Match Trust/Reputation events by `username` (the acting/assessed user). */
  readonly actor?: string;
  /** Match PolicyGate events whose `violationRules` include this rule name. */
  readonly violationRule?: string;
  readonly limit?: number;
}

// ============================================================================
// AuditTrail
// ============================================================================

/**
 * Append-only audit trail for security pipeline decisions.
 * Events are bounded by MAX_EVENTS to prevent unbounded growth.
 */
/**
 * Optional durable sink: receives every fully-formed event appended to the
 * trail, so security decisions can be mirrored to a persistent, hash-chained
 * store (see security/audit-bridge.ts). Default-off — when absent, the trail
 * behaves exactly as before (#3291).
 */
export type DurableAuditSink = (event: AuditEvent) => void;

export class AuditTrail {
  private events: AuditEvent[] = [];
  private nextId = 1;

  constructor(private readonly durableSink?: DurableAuditSink) {}

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

    // Mirror to the durable store when wired (#3291). Best-effort: a sink
    // failure must never break the in-memory security pipeline.
    if (this.durableSink !== undefined) {
      try {
        this.durableSink(fullEvent);
      } catch {
        // Sink implementations already swallow+log; this is belt-and-suspenders.
      }
    }

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

    if (filter.actionType !== undefined) {
      results = filterByActionType(results, filter.actionType);
    }

    if (filter.actor !== undefined) {
      results = filterByActor(results, filter.actor);
    }

    if (filter.violationRule !== undefined) {
      results = filterByViolationRule(results, filter.violationRule);
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

/**
 * Narrow to events carrying the given `actionType` (#3197). Only PolicyGate and
 * Corroboration events have one; all others are excluded.
 */
function filterByActionType(
  events: readonly AuditEvent[],
  actionType: AgentActionType
): readonly AuditEvent[] {
  return events.filter(
    (e) => (e.type === 'policy_gate' || e.type === 'corroboration') && e.actionType === actionType
  );
}

/**
 * Narrow to events for the given actor (#3197), matched on `username`. Only
 * Trust-classification and Reputation events carry a username; others are
 * excluded so an actor filter never returns unrelated rows.
 */
function filterByActor(events: readonly AuditEvent[], actor: string): readonly AuditEvent[] {
  return events.filter(
    (e) => (e.type === 'trust_classification' || e.type === 'reputation') && e.username === actor
  );
}

/**
 * Narrow to PolicyGate events whose `violationRules` include the given rule
 * name (#3197) — the security post-mortem "who tripped rule X" query.
 */
function filterByViolationRule(events: readonly AuditEvent[], rule: string): readonly AuditEvent[] {
  return events.filter((e) => e.type === 'policy_gate' && e.violationRules.includes(rule));
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
 * Records a PIPELINE-policy gate decision (#3710) — the dev-pipeline
 * consensus→execute seam. Distinct from {@link emitPolicyEvent} (the security
 * policy-gate path with an `AgentAction`): this carries `mode`/`ruleIds`/
 * `stageType` so the durable record distinguishes soak(warn) from enforce(block)
 * and is usable by the tune/readiness loop. ONE append per call.
 */
export function emitPipelinePolicyEvent(
  trail: AuditTrail,
  data: Omit<PolicyGateEvent, 'id' | 'timestamp' | 'type' | 'component' | 'actionType'>
): string {
  return trail.append({
    type: 'policy_gate',
    component: 'pipeline-policy-evaluator',
    ...data,
  });
}

/** The pipeline-policy would-block rate over a window (#3727). */
export interface PolicyWouldBlockRate {
  /** Total pipeline-policy evaluations (the denominator — summary records). */
  readonly evaluations: number;
  /** Evaluations that had ≥1 violation (what enforce mode WOULD block). */
  readonly wouldBlock: number;
  /** `wouldBlock / evaluations`; 0 when there are no evaluations. */
  readonly rate: number;
}

/**
 * Compute the pipeline-policy would-block RATE from durable audit events (#3727)
 * — the read-side of the per-evaluation summary records, and the signal the
 * #3769-enforce soak-readiness gate needs. Denominator = per-evaluation SUMMARY
 * records (`recordKind === 'summary'`); numerator = summaries with
 * `violationCount > 0` (the would-block fraction, independent of warn/block mode).
 * Per-violation records (`recordKind === 'violation'`) are intentionally NOT
 * counted — counting them would double-count and break the denominator.
 */
export function computePolicyWouldBlockRate(events: readonly AuditEvent[]): PolicyWouldBlockRate {
  let evaluations = 0;
  let wouldBlock = 0;
  for (const e of events) {
    if (e.type !== 'policy_gate' || e.recordKind !== 'summary') continue;
    evaluations += 1;
    if ((e.violationCount ?? 0) > 0) wouldBlock += 1;
  }
  return { evaluations, wouldBlock, rate: evaluations > 0 ? wouldBlock / evaluations : 0 };
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

/**
 * Records a graph execution lifecycle event.
 */
export function emitGraphExecutionEvent(
  trail: AuditTrail,
  data: Omit<GraphExecutionAuditEvent, 'id' | 'timestamp' | 'type' | 'component'>
): string {
  return trail.append({
    type: 'graph_execution',
    component: 'graph-executor',
    ...data,
  });
}

/**
 * Records a ClawGuard AUDIT-mode violation (#4097) — a policy-violating tool
 * call that was log-and-allowed because the policy is in `audit` mode. ONE
 * append per call; mirrors to the durable sink when the trail is wired.
 */
export function emitClawGuardViolation(
  trail: AuditTrail,
  data: Omit<ClawGuardViolationEvent, 'id' | 'timestamp' | 'type' | 'component'>
): string {
  return trail.append({
    type: 'clawguard_violation',
    component: 'clawguard-audit',
    ...data,
  });
}

/**
 * Creates an onEvent callback that bridges graph events to the audit trail.
 * Pass the returned function as `onEvent` in GraphExecuteOptions.
 *
 * @example
 * const trail = createAuditTrail();
 * await executeGraph(graph, inputs, { onEvent: createGraphAuditBridge(trail) });
 */
export function createGraphAuditBridge(
  trail: AuditTrail
): (event: { readonly type: string; readonly [key: string]: unknown }) => void {
  return (event) => {
    const nodeId = typeof event['nodeId'] === 'string' ? event['nodeId'] : undefined;
    const stepNumber = typeof event['stepNumber'] === 'number' ? event['stepNumber'] : 0;
    emitGraphExecutionEvent(trail, {
      graphEvent: event.type,
      ...(nodeId !== undefined ? { nodeId } : {}),
      stepNumber,
      detail: formatGraphEventDetail(event),
    });
  };
}

/** Formats a brief detail string from a graph event. */
function formatGraphEventDetail(event: {
  readonly type: string;
  readonly [key: string]: unknown;
}): string {
  switch (event.type) {
    case 'node_started':
      return `Node ${String(event['nodeId'])} starting`;
    case 'node_completed':
      return `Node ${String(event['nodeId'])} completed in ${String(event['durationMs'])}ms`;
    case 'node_error':
      return `Node ${String(event['nodeId'])} failed: ${String(event['error'])}`;
    case 'state_updated':
      return `State updated: ${String(event['updatedKeys'])}`;
    case 'step_completed':
      return `Step ${String(event['stepNumber'])}: ${String(event['nodesExecuted'])} nodes`;
    case 'execution_complete':
      return `Complete: ${String(event['totalSteps'])} steps, ${String(event['durationMs'])}ms`;
    default:
      return event.type;
  }
}

/**
 * Creates a new AuditTrail instance. Pass a {@link DurableAuditSink} (e.g. from
 * `createDurableAuditSink(auditLogger)`) to mirror appended security decisions
 * to a durable, hash-chained store (#3291). Default: in-memory only.
 */
export function createAuditTrail(durableSink?: DurableAuditSink): AuditTrail {
  return new AuditTrail(durableSink);
}
