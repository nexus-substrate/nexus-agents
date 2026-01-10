/**
 * Audit Trail for Self-Development Workflow
 *
 * Records structured audit events for compliance, debugging, and rollback support.
 *
 * @module workflows/self-development/audit-trail
 */

import { createLogger } from '../../core/index.js';
import type { WorkflowPhase } from './types.js';

const logger = createLogger({ component: 'self-dev-audit' });

// =============================================================================
// Types
// =============================================================================

/** Audit event severity levels. */
export type AuditSeverity = 'info' | 'warning' | 'critical';

/** Audit event categories. */
export type AuditCategory =
  | 'workflow'
  | 'security'
  | 'git'
  | 'github'
  | 'verification'
  | 'consensus'
  | 'human_review';

/** Options for recording an audit event. */
type RecordOptions = {
  severity?: AuditSeverity;
  actor?: string;
  details?: Record<string, unknown>;
  commitSha?: string;
};

/** Structured audit event. */
export interface AuditEvent {
  readonly id: string;
  readonly timestamp: string;
  readonly executionId: string;
  readonly category: AuditCategory;
  readonly severity: AuditSeverity;
  readonly event: string;
  readonly phase?: WorkflowPhase;
  readonly actor?: string;
  readonly details?: Record<string, unknown>;
  readonly issueNumber?: number;
  readonly prNumber?: number;
  readonly commitSha?: string;
}

/** Audit trail storage interface. */
export interface IAuditStorage {
  append(event: AuditEvent): Promise<void>;
  getByExecution(executionId: string): Promise<readonly AuditEvent[]>;
  getByIssue(issueNumber: number): Promise<readonly AuditEvent[]>;
}

// =============================================================================
// In-Memory Audit Storage
// =============================================================================

/** In-memory audit storage for testing and development. */
export class InMemoryAuditStorage implements IAuditStorage {
  private readonly events: AuditEvent[] = [];
  private readonly maxEvents: number;

  constructor(maxEvents: number = 10000) {
    this.maxEvents = maxEvents;
  }

  append(event: AuditEvent): Promise<void> {
    this.events.push(event);
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }
    return Promise.resolve();
  }

  getByExecution(executionId: string): Promise<readonly AuditEvent[]> {
    return Promise.resolve(this.events.filter((e) => e.executionId === executionId));
  }

  getByIssue(issueNumber: number): Promise<readonly AuditEvent[]> {
    return Promise.resolve(this.events.filter((e) => e.issueNumber === issueNumber));
  }

  /** Get all events (for testing). */
  getAll(): readonly AuditEvent[] {
    return [...this.events];
  }

  /** Clear all events (for testing). */
  clear(): void {
    this.events.length = 0;
  }
}

// =============================================================================
// Audit Trail
// =============================================================================

/** Counter for unique event IDs. */
let eventCounter = 0;

/** Generate unique event ID. */
function generateEventId(executionId: string): string {
  eventCounter += 1;
  return `${executionId}-${String(eventCounter).padStart(6, '0')}`;
}

/**
 * Audit trail for tracking workflow events.
 */
export class AuditTrail {
  private readonly storage: IAuditStorage;
  private readonly executionId: string;
  private currentPhase?: WorkflowPhase;
  private issueNumber?: number;
  private prNumber?: number;

  constructor(executionId: string, storage?: IAuditStorage) {
    this.executionId = executionId;
    this.storage = storage ?? new InMemoryAuditStorage();
  }

  /** Set current workflow phase. */
  setPhase(phase: WorkflowPhase): void {
    this.currentPhase = phase;
  }

  /** Set issue number for context. */
  setIssue(issueNumber: number): void {
    this.issueNumber = issueNumber;
  }

  /** Set PR number for context. */
  setPR(prNumber: number): void {
    this.prNumber = prNumber;
  }

  /** Build optional event fields. */
  private buildOptionalFields(
    options: RecordOptions
  ): Partial<
    Pick<AuditEvent, 'phase' | 'actor' | 'details' | 'issueNumber' | 'prNumber' | 'commitSha'>
  > {
    return {
      ...(this.currentPhase !== undefined && { phase: this.currentPhase }),
      ...(options.actor !== undefined && { actor: options.actor }),
      ...(options.details !== undefined && { details: options.details }),
      ...(this.issueNumber !== undefined && { issueNumber: this.issueNumber }),
      ...(this.prNumber !== undefined && { prNumber: this.prNumber }),
      ...(options.commitSha !== undefined && { commitSha: options.commitSha }),
    };
  }

  /**
   * Record an audit event.
   */
  async record(category: AuditCategory, event: string, options: RecordOptions = {}): Promise<void> {
    const auditEvent: AuditEvent = {
      id: generateEventId(this.executionId),
      timestamp: new Date().toISOString(),
      executionId: this.executionId,
      category,
      severity: options.severity ?? 'info',
      event,
      ...this.buildOptionalFields(options),
    };

    await this.storage.append(auditEvent);
    this.logEvent(event, category, options);
  }

  /** Log event to standard logger. */
  private logEvent(event: string, category: AuditCategory, options: RecordOptions): void {
    const logContext = {
      category,
      severity: options.severity ?? 'info',
      phase: this.currentPhase,
      executionId: this.executionId,
      ...options.details,
    };

    if (options.severity === 'critical') {
      logger.warn(`[AUDIT] ${event}`, logContext);
    } else {
      logger.info(`[AUDIT] ${event}`, logContext);
    }
  }

  // Convenience methods for common events

  /** Record workflow start. */
  async workflowStarted(issueNumber: number, issueTitle: string): Promise<void> {
    this.setIssue(issueNumber);
    await this.record('workflow', 'Workflow started', {
      details: { issueNumber, issueTitle },
    });
  }

  /** Record phase transition. */
  async phaseStarted(phase: WorkflowPhase): Promise<void> {
    this.setPhase(phase);
    await this.record('workflow', `Phase started: ${phase}`);
  }

  /** Record phase completion. */
  async phaseCompleted(phase: WorkflowPhase, durationMs: number): Promise<void> {
    await this.record('workflow', `Phase completed: ${phase}`, {
      details: { durationMs },
    });
  }

  /** Record phase failure. */
  async phaseFailed(phase: WorkflowPhase, error: string): Promise<void> {
    await this.record('workflow', `Phase failed: ${phase}`, {
      severity: 'critical',
      details: { error },
    });
  }

  /** Record human review decision. */
  async humanReview(decision: string, reviewer?: string, feedback?: string): Promise<void> {
    await this.record('human_review', `Human review: ${decision}`, {
      ...(reviewer !== undefined && { actor: reviewer }),
      details: { decision, ...(feedback !== undefined && { feedback }) },
    });
  }

  /** Record consensus vote. */
  async consensusVote(agentRole: string, vote: string, reasoning?: string): Promise<void> {
    await this.record('consensus', `Vote: ${agentRole} voted ${vote}`, {
      actor: agentRole,
      details: { vote, ...(reasoning !== undefined && { reasoning }) },
    });
  }

  /** Record security event. */
  async securityEvent(event: string, details?: Record<string, unknown>): Promise<void> {
    await this.record('security', event, {
      severity: 'warning',
      ...(details !== undefined && { details }),
    });
  }

  /** Record git operation. */
  async gitOperation(
    operation: string,
    commitSha?: string,
    details?: Record<string, unknown>
  ): Promise<void> {
    await this.record('git', operation, {
      ...(commitSha !== undefined && { commitSha }),
      ...(details !== undefined && { details }),
    });
  }

  /** Record PR creation. */
  async prCreated(prNumber: number, prUrl: string): Promise<void> {
    this.setPR(prNumber);
    await this.record('github', 'PR created', {
      details: { prNumber, prUrl },
    });
  }

  /** Record PR merge. */
  async prMerged(prNumber: number, mergeMethod: string): Promise<void> {
    await this.record('github', 'PR merged', {
      details: { prNumber, mergeMethod },
    });
  }

  /** Record verification result. */
  async verificationResult(
    checkName: string,
    passed: boolean,
    details?: Record<string, unknown>
  ): Promise<void> {
    await this.record('verification', `Check: ${checkName} ${passed ? 'passed' : 'failed'}`, {
      severity: passed ? 'info' : 'warning',
      details: { checkName, passed, ...details },
    });
  }

  /** Record workflow completion. */
  async workflowCompleted(success: boolean, durationMs: number): Promise<void> {
    await this.record('workflow', `Workflow ${success ? 'completed' : 'failed'}`, {
      severity: success ? 'info' : 'critical',
      details: { success, durationMs },
    });
  }

  /** Get all events for this execution. */
  async getEvents(): Promise<readonly AuditEvent[]> {
    return this.storage.getByExecution(this.executionId);
  }
}

/**
 * Create an audit trail for a workflow execution.
 */
export function createAuditTrail(executionId: string, storage?: IAuditStorage): AuditTrail {
  return new AuditTrail(executionId, storage);
}
