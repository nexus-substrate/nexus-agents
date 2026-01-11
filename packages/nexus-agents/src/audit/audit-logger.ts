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

import * as crypto from 'node:crypto';
import type { ILogger } from '../core/logger.js';
import { createLogger } from '../core/logger.js';
import type {
  IAuditLogger,
  IAuditStorage,
  AuditEvent,
  AuditEventInput,
  AuditLogConfig,
  AuditActor,
  ToolInvocationAuditOpts,
  PolicyDecisionAuditOpts,
  SecurityEventAuditOpts,
  RateLimitAuditOpts,
} from './audit-types.js';
import { AuditLogConfigSchema, AuditError } from './audit-types.js';
import { FileAuditStorage } from './audit-storage.js';

// ============================================================================
// ID Generation
// ============================================================================

function generateEventId(): string {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(6).toString('hex');
  return `aud_${timestamp}_${random}`;
}

// ============================================================================
// Hash Chain Support
// ============================================================================

function computeEventHash(event: AuditEvent): string {
  const data = JSON.stringify({
    id: event.id,
    timestamp: event.timestamp,
    category: event.category,
    action: event.action,
    outcome: event.outcome,
    actor: event.actor,
    previousHash: event.previousHash,
  });
  return crypto.createHash('sha256').update(data).digest('hex');
}

// ============================================================================
// System Actor (for internal events)
// ============================================================================

const SYSTEM_ACTOR: AuditActor = {
  type: 'system',
  id: 'nexus-agents',
  name: 'Nexus Agents System',
};

// ============================================================================
// Audit Logger Implementation
// ============================================================================

export class AuditLogger implements IAuditLogger {
  private readonly storage: IAuditStorage;
  private readonly logger: ILogger;
  private readonly enableHashChain: boolean;
  private readonly minSeverity: 'info' | 'warning' | 'critical';
  private readonly categories?: readonly string[] | undefined;
  private lastHash: string | null = null;
  private eventQueue: AuditEvent[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly flushIntervalMs: number;
  private closed = false;

  constructor(config: AuditLogConfig, storage?: IAuditStorage, logger?: ILogger) {
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
    this.storage = storage ?? new FileAuditStorage(validated.data, this.logger);

    this.startFlushTimer();
    this.logger.info('AuditLogger initialized', { logDir: config.logDir });
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flushQueue().catch((err: unknown) => {
        this.logger.error('Audit flush failed', err instanceof Error ? err : undefined);
      });
    }, this.flushIntervalMs);
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
    const now = new Date();
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
      severity: opts.decision === 'deny' ? 'warning' : 'info',
      outcome: opts.decision === 'allow' ? 'success' : 'denied',
      action: 'policy.evaluate',
      description: opts.reason,
      actor: opts.actor,
      resource: { type: 'tool', id: opts.toolName, name: opts.toolName },
      requestId: opts.requestId,
      policyName: opts.policyName,
      policyDecision: opts.decision,
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

  private async flushQueue(): Promise<void> {
    if (this.eventQueue.length === 0) return;

    const events = this.eventQueue.splice(0, this.eventQueue.length);
    for (const event of events) {
      await this.storage.write(event);
    }
  }

  async flush(): Promise<void> {
    await this.flushQueue();
    await this.storage.flush();
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
  logger?: ILogger
): AuditLogger {
  return new AuditLogger(config, storage, logger);
}
