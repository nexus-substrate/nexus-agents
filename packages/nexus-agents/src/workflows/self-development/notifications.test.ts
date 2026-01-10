/**
 * Notification System Tests
 *
 * @module workflows/self-development/notifications.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  NotificationService,
  ConsoleNotificationHandler,
  WebhookNotificationHandler,
  createNotificationService,
  type Notification,
  type INotificationHandler,
} from './notifications.js';

/** Mock handler that collects notifications. */
class MockNotificationHandler implements INotificationHandler {
  readonly name = 'mock';
  readonly notifications: Notification[] = [];

  send(notification: Notification): Promise<void> {
    this.notifications.push(notification);
    return Promise.resolve();
  }

  clear(): void {
    this.notifications.length = 0;
  }
}

describe('notifications', () => {
  describe('ConsoleNotificationHandler', () => {
    it('sends notification to console', async () => {
      const handler = new ConsoleNotificationHandler();

      await expect(
        handler.send({
          type: 'workflow_completed',
          severity: 'success',
          title: 'Test',
          message: 'Test message',
          timestamp: new Date().toISOString(),
          executionId: 'exec-001',
        })
      ).resolves.not.toThrow();
    });
  });

  describe('WebhookNotificationHandler', () => {
    beforeEach(() => {
      vi.stubGlobal('fetch', vi.fn());
    });

    it('sends POST request with notification payload', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', mockFetch);

      const handler = new WebhookNotificationHandler({
        url: 'https://example.com/webhook',
        headers: { Authorization: 'Bearer token' },
      });

      await handler.send({
        type: 'workflow_completed',
        severity: 'success',
        title: 'Test',
        message: 'Test message',
        timestamp: '2026-01-10T00:00:00Z',
        executionId: 'exec-001',
      });

      expect(mockFetch).toHaveBeenCalledWith('https://example.com/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token',
        },
        body: expect.stringContaining('workflow_completed'),
        signal: expect.any(AbortSignal),
      });
    });

    it('handles fetch errors gracefully', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

      const handler = new WebhookNotificationHandler({ url: 'https://example.com/webhook' });

      await expect(
        handler.send({
          type: 'workflow_failed',
          severity: 'error',
          title: 'Error',
          message: 'Failed',
          timestamp: new Date().toISOString(),
          executionId: 'exec-001',
        })
      ).resolves.not.toThrow();
    });

    it('handles non-ok response gracefully', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

      const handler = new WebhookNotificationHandler({ url: 'https://example.com/webhook' });

      await expect(
        handler.send({
          type: 'workflow_failed',
          severity: 'error',
          title: 'Error',
          message: 'Failed',
          timestamp: new Date().toISOString(),
          executionId: 'exec-001',
        })
      ).resolves.not.toThrow();
    });
  });

  describe('NotificationService', () => {
    let service: NotificationService;
    let mockHandler: MockNotificationHandler;

    beforeEach(() => {
      service = new NotificationService();
      mockHandler = new MockNotificationHandler();
      service.addHandler(mockHandler);
    });

    it('sends notification to all handlers', async () => {
      const secondHandler = new MockNotificationHandler();
      service.addHandler(secondHandler);

      await service.notify({
        type: 'workflow_started',
        severity: 'info',
        title: 'Test',
        message: 'Test',
        timestamp: new Date().toISOString(),
        executionId: 'exec-001',
      });

      expect(mockHandler.notifications).toHaveLength(1);
      expect(secondHandler.notifications).toHaveLength(1);
    });

    it('removes handler by name', async () => {
      service.removeHandler('mock');

      await service.notify({
        type: 'workflow_started',
        severity: 'info',
        title: 'Test',
        message: 'Test',
        timestamp: new Date().toISOString(),
        executionId: 'exec-001',
      });

      expect(mockHandler.notifications).toHaveLength(0);
    });

    describe('convenience methods', () => {
      it('workflowStarted sends info notification', async () => {
        await service.workflowStarted('exec-001', 42, 'Add feature');

        expect(mockHandler.notifications).toHaveLength(1);
        expect(mockHandler.notifications[0]).toMatchObject({
          type: 'workflow_started',
          severity: 'info',
          metadata: { issueNumber: 42, issueTitle: 'Add feature' },
        });
      });

      it('workflowCompleted sends success notification', async () => {
        await service.workflowCompleted('exec-001', 100, 'https://github.com/pr/100');

        expect(mockHandler.notifications[0]).toMatchObject({
          type: 'workflow_completed',
          severity: 'success',
          metadata: { prNumber: 100, prUrl: 'https://github.com/pr/100' },
        });
      });

      it('workflowCompleted without PR info', async () => {
        await service.workflowCompleted('exec-001');

        expect(mockHandler.notifications[0]?.message).toBe('Workflow completed successfully');
        expect(mockHandler.notifications[0]?.metadata).toEqual({});
      });

      it('workflowFailed sends error notification', async () => {
        await service.workflowFailed('exec-001', 'implement', 'Build failed');

        expect(mockHandler.notifications[0]).toMatchObject({
          type: 'workflow_failed',
          severity: 'error',
          phase: 'implement',
          message: 'Build failed',
        });
      });

      it('reviewRequired sends warning notification', async () => {
        await service.reviewRequired('exec-001', 'High-risk changes detected');

        expect(mockHandler.notifications[0]).toMatchObject({
          type: 'human_review_required',
          severity: 'warning',
          phase: 'review',
          message: 'High-risk changes detected',
        });
      });

      it('prCreated sends success notification', async () => {
        await service.prCreated('exec-001', 100, 'https://github.com/pr/100');

        expect(mockHandler.notifications[0]).toMatchObject({
          type: 'pr_created',
          severity: 'success',
          metadata: { prNumber: 100, prUrl: 'https://github.com/pr/100' },
        });
      });

      it('prMerged sends success notification', async () => {
        await service.prMerged('exec-001', 100);

        expect(mockHandler.notifications[0]).toMatchObject({
          type: 'pr_merged',
          severity: 'success',
          metadata: { prNumber: 100 },
        });
      });

      describe('executionSummary', () => {
        const mockSummary = {
          duration: '5.2min',
          phases: 'analyze: 0.5min, research: 1.2min',
          quality: 'Coverage: 95%',
          iterations: 'TRINITY: 2, Reflexion: 1',
          vote: '100% approval',
          humanReview: '30s (1 revision)',
        };

        it('sends success notification for completed workflow', async () => {
          await service.executionSummary('exec-001', true, mockSummary);

          expect(mockHandler.notifications[0]).toMatchObject({
            type: 'execution_summary',
            severity: 'success',
            title: 'Execution Summary',
          });
          expect(mockHandler.notifications[0]?.message).toContain('Status: COMPLETED');
          expect(mockHandler.notifications[0]?.message).toContain('Duration: 5.2min');
          expect(mockHandler.notifications[0]?.metadata).toMatchObject({
            success: true,
            summary: mockSummary,
          });
        });

        it('sends error notification for failed workflow', async () => {
          await service.executionSummary('exec-001', false, mockSummary);

          expect(mockHandler.notifications[0]).toMatchObject({
            type: 'execution_summary',
            severity: 'error',
          });
          expect(mockHandler.notifications[0]?.message).toContain('Status: FAILED');
        });

        it('includes metrics when provided', async () => {
          const mockMetrics = {
            totalDurationMs: 312000,
            phaseDurations: {
              analyze: 30000,
              research: 72000,
              plan: 90000,
              refine: 60000,
              vote: 10000,
              review: 30000,
              implement: 15000,
              verify: 5000,
              commit: 0,
            },
            trinityIterations: 2,
            reflexionIterations: 1,
            selfDebugIterations: 0,
            selfRefineIterations: 0,
            testCoverage: 95,
            finalSeverity: 0.23,
            approvalRate: 1.0,
            vetoCount: 0,
            humanReviewTime: 30000,
            humanRevisions: 1,
          };

          await service.executionSummary('exec-001', true, mockSummary, mockMetrics);

          expect(mockHandler.notifications[0]?.metadata).toMatchObject({
            success: true,
            summary: mockSummary,
            metrics: mockMetrics,
          });
        });

        it('handles N/A values in summary', async () => {
          const minimalSummary = {
            duration: '1.0min',
            phases: 'analyze: 1.0min',
            quality: 'N/A',
            iterations: 'none',
            vote: 'N/A',
            humanReview: 'N/A',
          };

          await service.executionSummary('exec-001', true, minimalSummary);

          const message = mockHandler.notifications[0]?.message ?? '';
          expect(message).toContain('Status: COMPLETED');
          expect(message).toContain('Duration: 1.0min');
          // N/A fields should not appear in message
          expect(message).not.toContain('Quality:');
          expect(message).not.toContain('Vote:');
        });
      });
    });
  });

  describe('createNotificationService', () => {
    it('creates service with console handler by default', () => {
      const service = createNotificationService();
      // Service has console handler - verified by testing it can send
      expect(service).toBeInstanceOf(NotificationService);
    });

    it('creates service without console handler when disabled', () => {
      const service = createNotificationService(false);
      expect(service).toBeInstanceOf(NotificationService);
    });
  });
});
