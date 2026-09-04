/**
 * Security → durable audit bridge (#3291, epic #3288 item 3).
 *
 * The security `AuditTrail` (audit-trail.ts) is in-memory-only, so every
 * trust/policy/reputation/sanitization decision is lost on process exit. The
 * durable `AuditLogger` (audit/) persists with a tamper-evident hash chain but
 * lacks these rich security event types. This bridge maps each security
 * `AuditEvent` (the discriminated union) into a durable `AuditEventInput` and
 * forwards it to an `IAuditLogger`, so security decisions become durable and
 * hash-verifiable — satisfying CLAUDE.md's "immutable audit" mandate.
 *
 * Per the #3291 confirmation vote (fold-in design): security events are folded
 * into the durable schema with `category`/`action` distinguishing them
 * (queryable by `action: 'security.*'`), rather than standing up a parallel
 * SecurityAuditLogger.
 *
 * @module security/audit-bridge
 */

import { createLogger, getErrorMessage } from '../core/index.js';
import { createAuditTrail } from './audit-trail.js';
import type {
  AuditEvent as SecurityAuditEvent,
  AuditTrail,
  DurableAuditSink,
} from './audit-trail.js';
import type {
  AuditEventInput,
  AuditActor,
  AuditOutcome,
  AuditSeverity,
  IAuditLogger,
} from '../audit/audit-types.js';

const logger = createLogger({ component: 'SecurityAuditBridge' });

function systemActor(id: string, name?: string): AuditActor {
  return name !== undefined ? { type: 'system', id, name } : { type: 'system', id };
}

function userActor(username: string): AuditActor {
  return { type: 'user', id: username };
}

type TrustEvent = Extract<SecurityAuditEvent, { type: 'trust_classification' }>;
type PolicyEvent = Extract<SecurityAuditEvent, { type: 'policy_gate' }>;
type CorroborationEvt = Extract<SecurityAuditEvent, { type: 'corroboration' }>;
type ReputationEvt = Extract<SecurityAuditEvent, { type: 'reputation' }>;
type SanitizationEvt = Extract<SecurityAuditEvent, { type: 'sanitization' }>;
type GraphEvt = Extract<SecurityAuditEvent, { type: 'graph_execution' }>;
type ClawGuardEvt = Extract<SecurityAuditEvent, { type: 'clawguard_violation' }>;

function mapTrust(e: TrustEvent): AuditEventInput {
  const severity: AuditSeverity = e.wasDowngraded ? 'warning' : 'info';
  return {
    category: 'authorization',
    severity,
    outcome: 'success',
    action: 'security.trust_classification',
    actor: userActor(e.username),
    description: e.reason,
    metadata: {
      assignedTier: e.assignedTier,
      userRole: e.userRole,
      // Absent when no allowlist was consulted (#4992) — never a default false.
      ...(e.isAllowlisted !== undefined ? { isAllowlisted: e.isAllowlisted } : {}),
      wasDowngraded: e.wasDowngraded,
      component: e.component,
    },
  };
}

/**
 * Optional pipeline-policy metadata fields, absent on the security path. Extracted
 * so {@link mapPolicyGate} stays under the complexity cap. `actionType`/`mode`/
 * `ruleIds`/`stageType` are the #3710 round-trip fields; `recordKind`/
 * `violationCount` are #3727 (the summary/violation discriminator + per-evaluation
 * count the durable would-block rate needs).
 */
function pipelinePolicyMetadata(e: PolicyEvent): Record<string, unknown> {
  return {
    ...(e.actionType !== undefined ? { actionType: e.actionType } : {}),
    ...(e.mode !== undefined ? { mode: e.mode } : {}),
    ...(e.ruleIds !== undefined ? { ruleIds: e.ruleIds } : {}),
    ...(e.stageType !== undefined ? { stageType: e.stageType } : {}),
    ...(e.recordKind !== undefined ? { recordKind: e.recordKind } : {}),
    ...(e.violationCount !== undefined ? { violationCount: e.violationCount } : {}),
  };
}

function mapPolicyGate(e: PolicyEvent): AuditEventInput {
  const outcome: AuditOutcome = e.allowed ? 'success' : 'denied';
  // #3710/#3727: the pipeline-policy path carries mode/ruleIds/stageType +
  // recordKind/violationCount and no actionType; these MUST round-trip into the
  // durable metadata (see pipelinePolicyMetadata). The security path leaves them
  // undefined and keeps its actionType-keyed shape.
  return {
    category: 'authorization',
    severity: e.allowed ? 'info' : 'warning',
    outcome,
    action: 'security.policy_gate',
    actor: systemActor(e.component),
    policyName: 'security.policy_gate',
    policyDecision: e.allowed ? 'allow' : 'deny',
    ...(e.violationRules.length > 0 ? { violationType: e.violationRules.join(',') } : {}),
    metadata: {
      requiresApproval: e.requiresApproval,
      inputTrustTier: e.inputTrustTier,
      violationRules: e.violationRules,
      ...pipelinePolicyMetadata(e),
    },
  };
}

function mapCorroboration(e: CorroborationEvt): AuditEventInput {
  return {
    category: 'security',
    severity: e.satisfied ? 'info' : 'warning',
    outcome: e.satisfied ? 'success' : 'denied',
    action: 'security.corroboration',
    actor: systemActor(e.component),
    metadata: {
      actionType: e.actionType,
      sourceCount: e.sourceCount,
      missingRequirements: e.missingRequirements,
    },
  };
}

function mapReputation(e: ReputationEvt): AuditEventInput {
  return {
    category: 'security',
    severity: e.isSuspicious ? 'warning' : 'info',
    outcome: 'success',
    action: 'security.reputation',
    actor: userActor(e.username),
    metadata: {
      reputationScore: e.reputationScore,
      isSuspicious: e.isSuspicious,
      effectiveTier: e.effectiveTier,
      signalCount: e.signalCount,
      component: e.component,
    },
  };
}

function mapSanitization(e: SanitizationEvt): AuditEventInput {
  return {
    category: 'security',
    severity: e.injectionFlagCount > 0 ? 'warning' : 'info',
    outcome: 'success',
    action: 'security.sanitization',
    actor: systemActor(e.component, e.source),
    metadata: {
      source: e.source,
      wasModified: e.wasModified,
      strippedCount: e.strippedCount,
      injectionFlagCount: e.injectionFlagCount,
      strippedElements: e.strippedElements,
    },
  };
}

function mapGraphExecution(e: GraphEvt): AuditEventInput {
  return {
    category: 'system',
    severity: 'info',
    outcome: 'success',
    action: 'security.graph_execution',
    actor: systemActor(e.component),
    description: e.detail,
    metadata: {
      graphEvent: e.graphEvent,
      ...(e.nodeId !== undefined ? { nodeId: e.nodeId } : {}),
      stepNumber: e.stepNumber,
    },
  };
}

/**
 * Map a ClawGuard AUDIT-mode violation (#4097) to a durable event. `outcome` is
 * `success` because audit mode ALLOWED the call (it is log-and-allow, not a
 * denial); `severity` is `warning` to flag the policy violation. Queryable by
 * `action: 'security.clawguard_violation'`.
 */
function mapClawGuard(e: ClawGuardEvt): AuditEventInput {
  return {
    category: 'authorization',
    severity: 'warning',
    outcome: 'success',
    action: 'security.clawguard_violation',
    actor: systemActor(e.component),
    metadata: {
      toolName: e.toolName,
      warning: e.warning,
      policySource: e.policySource,
      mode: e.mode,
      requestId: e.requestId,
    },
  };
}

/**
 * Map a security `AuditEvent` (discriminated union) to a durable
 * `AuditEventInput`. Pure — no side effects. The durable logger assigns
 * id/timestamp/hash, so those are omitted here.
 */
export function securityAuditEventToInput(event: SecurityAuditEvent): AuditEventInput {
  switch (event.type) {
    case 'trust_classification':
      return mapTrust(event);
    case 'policy_gate':
      return mapPolicyGate(event);
    case 'corroboration':
      return mapCorroboration(event);
    case 'reputation':
      return mapReputation(event);
    case 'sanitization':
      return mapSanitization(event);
    case 'graph_execution':
      return mapGraphExecution(event);
    case 'clawguard_violation':
      return mapClawGuard(event);
  }
}

/**
 * Build a {@link SecurityAuditSink} that maps security events into the durable
 * schema and writes them through `auditLogger`. Errors are swallowed and logged
 * — durable mirroring must never break the security pipeline.
 */
export function createDurableAuditSink(auditLogger: IAuditLogger): DurableAuditSink {
  return (event: SecurityAuditEvent) => {
    try {
      auditLogger.log(securityAuditEventToInput(event));
    } catch (error) {
      logger.warn('Failed to mirror security event to durable audit log', {
        type: event.type,
        error: getErrorMessage(error),
      });
    }
  };
}

/**
 * Wrap an optional `auditLogger` into a durable {@link AuditTrail} (#4097) — the
 * single representation of "mirror security events to the shared hash chain when
 * a logger is threaded." Returns undefined when none is present, so the no-logger
 * path establishes NO trail and stays byte-identical (mirrors the dev-pipeline
 * `buildPolicyAuditTrail` guard). Consumers wrap execution in `withAuditTrail`
 * ONLY when this returns a trail.
 */
export function createDurableAuditTrail(auditLogger?: IAuditLogger): AuditTrail | undefined {
  if (auditLogger === undefined) return undefined;
  return createAuditTrail(createDurableAuditSink(auditLogger));
}
