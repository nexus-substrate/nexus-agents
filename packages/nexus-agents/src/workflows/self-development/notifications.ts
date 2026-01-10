/**
 * Notification System for Self-Development Workflow
 *
 * Provides notifications for workflow events (completion, failure, review requests).
 * Supports multiple notification channels via pluggable handlers.
 *
 * @module workflows/self-development/notifications
 */

import { createLogger } from '../../core/index.js';
import type { WorkflowPhase } from './types.js';

const logger = createLogger({ component: 'self-dev-notify' });

// =============================================================================
// Types
// =============================================================================

/** Notification severity levels. */
export type NotificationSeverity = 'info' | 'success' | 'warning' | 'error';

/** Notification event types. */
export type NotificationEventType =
  | 'workflow_started'
  | 'workflow_completed'
  | 'workflow_failed'
  | 'phase_completed'
  | 'human_review_required'
  | 'pr_created'
  | 'pr_merged';

/** Notification payload. */
export interface Notification {
  readonly type: NotificationEventType;
  readonly severity: NotificationSeverity;
  readonly title: string;
  readonly message: string;
  readonly timestamp: string;
  readonly executionId: string;
  readonly phase?: WorkflowPhase;
  readonly metadata?: Record<string, unknown>;
}

/** Notification handler interface. */
export interface INotificationHandler {
  readonly name: string;
  send(notification: Notification): Promise<void>;
}

// =============================================================================
// Console Notification Handler
// =============================================================================

/** Console-based notification handler (logs to stdout). */
export class ConsoleNotificationHandler implements INotificationHandler {
  readonly name = 'console';

  send(notification: Notification): Promise<void> {
    const icon = this.getIcon(notification.severity);
    const phase = notification.phase !== undefined ? ` [${notification.phase}]` : '';
    logger.info(`${icon} ${notification.title}${phase}: ${notification.message}`, {
      type: notification.type,
      executionId: notification.executionId,
      ...notification.metadata,
    });
    return Promise.resolve();
  }

  private getIcon(severity: NotificationSeverity): string {
    switch (severity) {
      case 'success':
        return '✓';
      case 'warning':
        return '⚠';
      case 'error':
        return '✗';
      default:
        return '→';
    }
  }
}

// =============================================================================
// Webhook Notification Handler
// =============================================================================

/** Configuration for webhook notifications. */
export interface WebhookConfig {
  readonly url: string;
  readonly headers?: Record<string, string>;
  readonly timeout?: number;
}

/** Webhook-based notification handler (HTTP POST). */
export class WebhookNotificationHandler implements INotificationHandler {
  readonly name = 'webhook';
  private readonly config: WebhookConfig;

  constructor(config: WebhookConfig) {
    this.config = config;
  }

  async send(notification: Notification): Promise<void> {
    try {
      const response = await fetch(this.config.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.config.headers },
        body: JSON.stringify(notification),
        signal: AbortSignal.timeout(this.config.timeout ?? 5000),
      });

      if (!response.ok) {
        logger.warn('Webhook notification failed', {
          status: response.status,
          url: this.config.url,
        });
      }
    } catch (error) {
      logger.warn('Webhook notification error', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

// =============================================================================
// Notification Service
// =============================================================================

/** Service for sending workflow notifications. */
export class NotificationService {
  private readonly handlers: INotificationHandler[] = [];

  /** Add a notification handler. */
  addHandler(handler: INotificationHandler): void {
    this.handlers.push(handler);
  }

  /** Remove a handler by name. */
  removeHandler(name: string): void {
    const index = this.handlers.findIndex((h) => h.name === name);
    if (index !== -1) this.handlers.splice(index, 1);
  }

  /** Send notification to all handlers. */
  async notify(notification: Notification): Promise<void> {
    await Promise.all(this.handlers.map((h) => h.send(notification)));
  }

  // Convenience methods for common notifications

  /** Notify workflow started. */
  async workflowStarted(executionId: string, issueNumber: number, title: string): Promise<void> {
    await this.notify({
      type: 'workflow_started',
      severity: 'info',
      title: 'Workflow Started',
      message: `Processing issue #${String(issueNumber)}: ${title}`,
      timestamp: new Date().toISOString(),
      executionId,
      metadata: { issueNumber, issueTitle: title },
    });
  }

  /** Notify workflow completed successfully. */
  async workflowCompleted(executionId: string, prNumber?: number, prUrl?: string): Promise<void> {
    const message =
      prNumber !== undefined
        ? `PR #${String(prNumber)} created: ${prUrl ?? 'N/A'}`
        : 'Workflow completed successfully';
    await this.notify({
      type: 'workflow_completed',
      severity: 'success',
      title: 'Workflow Completed',
      message,
      timestamp: new Date().toISOString(),
      executionId,
      metadata: { ...(prNumber !== undefined && { prNumber, prUrl }) },
    });
  }

  /** Notify workflow failed. */
  async workflowFailed(executionId: string, phase: WorkflowPhase, error: string): Promise<void> {
    await this.notify({
      type: 'workflow_failed',
      severity: 'error',
      title: 'Workflow Failed',
      message: error,
      timestamp: new Date().toISOString(),
      executionId,
      phase,
    });
  }

  /** Notify human review is required. */
  async reviewRequired(executionId: string, details?: string): Promise<void> {
    await this.notify({
      type: 'human_review_required',
      severity: 'warning',
      title: 'Review Required',
      message: details ?? 'Human review needed to continue',
      phase: 'review',
      timestamp: new Date().toISOString(),
      executionId,
    });
  }

  /** Notify PR was created. */
  async prCreated(executionId: string, prNumber: number, prUrl: string): Promise<void> {
    await this.notify({
      type: 'pr_created',
      severity: 'success',
      title: 'PR Created',
      message: `Pull request #${String(prNumber)} created`,
      phase: 'commit',
      timestamp: new Date().toISOString(),
      executionId,
      metadata: { prNumber, prUrl },
    });
  }

  /** Notify PR was merged. */
  async prMerged(executionId: string, prNumber: number): Promise<void> {
    await this.notify({
      type: 'pr_merged',
      severity: 'success',
      title: 'PR Merged',
      message: `Pull request #${String(prNumber)} merged successfully`,
      phase: 'commit',
      timestamp: new Date().toISOString(),
      executionId,
      metadata: { prNumber },
    });
  }
}

/** Create a notification service with default console handler. */
export function createNotificationService(includeConsole = true): NotificationService {
  const service = new NotificationService();
  if (includeConsole) {
    service.addHandler(new ConsoleNotificationHandler());
  }
  return service;
}
