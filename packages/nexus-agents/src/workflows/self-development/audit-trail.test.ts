/**
 * Audit Trail Tests
 *
 * @module workflows/self-development/audit-trail.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  AuditTrail,
  InMemoryAuditStorage,
  createAuditTrail,
  type AuditEvent,
} from './audit-trail.js';

describe('audit-trail', () => {
  let storage: InMemoryAuditStorage;
  let trail: AuditTrail;

  beforeEach(() => {
    storage = new InMemoryAuditStorage();
    trail = new AuditTrail('test-exec-001', storage);
  });

  describe('InMemoryAuditStorage', () => {
    it('stores and retrieves events by execution ID', async () => {
      const event: AuditEvent = {
        id: 'evt-001',
        timestamp: new Date().toISOString(),
        executionId: 'exec-123',
        category: 'workflow',
        severity: 'info',
        event: 'Test event',
      };

      await storage.append(event);
      const events = await storage.getByExecution('exec-123');

      expect(events).toHaveLength(1);
      expect(events[0]?.event).toBe('Test event');
    });

    it('filters events by issue number', async () => {
      await storage.append({
        id: 'evt-001',
        timestamp: new Date().toISOString(),
        executionId: 'exec-1',
        category: 'workflow',
        severity: 'info',
        event: 'Issue 42 event',
        issueNumber: 42,
      });

      await storage.append({
        id: 'evt-002',
        timestamp: new Date().toISOString(),
        executionId: 'exec-2',
        category: 'workflow',
        severity: 'info',
        event: 'Issue 99 event',
        issueNumber: 99,
      });

      const events = await storage.getByIssue(42);
      expect(events).toHaveLength(1);
      expect(events[0]?.issueNumber).toBe(42);
    });

    it('enforces max events limit', async () => {
      const smallStorage = new InMemoryAuditStorage(3);

      for (let i = 1; i <= 5; i++) {
        await smallStorage.append({
          id: `evt-${String(i)}`,
          timestamp: new Date().toISOString(),
          executionId: 'exec',
          category: 'workflow',
          severity: 'info',
          event: `Event ${String(i)}`,
        });
      }

      const events = smallStorage.getAll();
      expect(events).toHaveLength(3);
      expect(events[0]?.event).toBe('Event 3');
      expect(events[2]?.event).toBe('Event 5');
    });

    it('clears all events', async () => {
      await storage.append({
        id: 'evt-001',
        timestamp: new Date().toISOString(),
        executionId: 'exec',
        category: 'workflow',
        severity: 'info',
        event: 'Test',
      });

      storage.clear();
      expect(storage.getAll()).toHaveLength(0);
    });
  });

  describe('AuditTrail', () => {
    describe('record', () => {
      it('records event with default severity', async () => {
        await trail.record('workflow', 'Test event');

        const events = await trail.getEvents();
        expect(events).toHaveLength(1);
        expect(events[0]?.category).toBe('workflow');
        expect(events[0]?.severity).toBe('info');
        expect(events[0]?.event).toBe('Test event');
      });

      it('records event with custom severity', async () => {
        await trail.record('security', 'Security warning', { severity: 'warning' });

        const events = await trail.getEvents();
        expect(events[0]?.severity).toBe('warning');
      });

      it('includes actor and details', async () => {
        await trail.record('consensus', 'Vote cast', {
          actor: 'architect',
          details: { vote: 'approve', confidence: 0.95 },
        });

        const events = await trail.getEvents();
        expect(events[0]?.actor).toBe('architect');
        expect(events[0]?.details).toEqual({ vote: 'approve', confidence: 0.95 });
      });

      it('includes current phase and issue context', async () => {
        trail.setPhase('plan');
        trail.setIssue(123);

        await trail.record('workflow', 'Planning started');

        const events = await trail.getEvents();
        expect(events[0]?.phase).toBe('plan');
        expect(events[0]?.issueNumber).toBe(123);
      });
    });

    describe('workflowStarted', () => {
      it('records workflow start with issue details', async () => {
        await trail.workflowStarted(42, 'Add new feature');

        const events = await trail.getEvents();
        expect(events[0]?.event).toBe('Workflow started');
        expect(events[0]?.details).toEqual({ issueNumber: 42, issueTitle: 'Add new feature' });
      });
    });

    describe('phaseStarted/phaseCompleted', () => {
      it('records phase transitions', async () => {
        await trail.phaseStarted('analyze');
        await trail.phaseCompleted('analyze', 5000);

        const events = await trail.getEvents();
        expect(events).toHaveLength(2);
        expect(events[0]?.event).toBe('Phase started: analyze');
        expect(events[1]?.event).toBe('Phase completed: analyze');
        expect(events[1]?.details).toEqual({ durationMs: 5000 });
      });
    });

    describe('phaseFailed', () => {
      it('records phase failure with critical severity', async () => {
        await trail.phaseFailed('implement', 'Compilation error');

        const events = await trail.getEvents();
        expect(events[0]?.severity).toBe('critical');
        expect(events[0]?.details).toEqual({ error: 'Compilation error' });
      });
    });

    describe('humanReview', () => {
      it('records human review decision', async () => {
        await trail.humanReview('approved', 'reviewer@example.com', 'Looks good');

        const events = await trail.getEvents();
        expect(events[0]?.category).toBe('human_review');
        expect(events[0]?.actor).toBe('reviewer@example.com');
        expect(events[0]?.details).toEqual({
          decision: 'approved',
          feedback: 'Looks good',
        });
      });
    });

    describe('consensusVote', () => {
      it('records agent vote', async () => {
        await trail.consensusVote('security', 'approve', 'No security concerns');

        const events = await trail.getEvents();
        expect(events[0]?.category).toBe('consensus');
        expect(events[0]?.actor).toBe('security');
        expect(events[0]?.details).toEqual({
          vote: 'approve',
          reasoning: 'No security concerns',
        });
      });
    });

    describe('securityEvent', () => {
      it('records security events with warning severity', async () => {
        await trail.securityEvent('Suspicious pattern detected', { pattern: 'rm -rf' });

        const events = await trail.getEvents();
        expect(events[0]?.category).toBe('security');
        expect(events[0]?.severity).toBe('warning');
      });
    });

    describe('gitOperation', () => {
      it('records git operations with commit SHA', async () => {
        await trail.gitOperation('Branch created', 'abc1234', { branch: 'feat/new-feature' });

        const events = await trail.getEvents();
        expect(events[0]?.category).toBe('git');
        expect(events[0]?.commitSha).toBe('abc1234');
      });
    });

    describe('prCreated/prMerged', () => {
      it('records PR lifecycle', async () => {
        await trail.prCreated(100, 'https://github.com/test/repo/pull/100');
        await trail.prMerged(100, 'squash');

        const events = await trail.getEvents();
        expect(events).toHaveLength(2);
        expect(events[0]?.event).toBe('PR created');
        expect(events[1]?.event).toBe('PR merged');
      });
    });

    describe('verificationResult', () => {
      it('records passing check', async () => {
        await trail.verificationResult('typecheck', true, { errorCount: 0 });

        const events = await trail.getEvents();
        expect(events[0]?.severity).toBe('info');
        expect(events[0]?.event).toBe('Check: typecheck passed');
      });

      it('records failing check with warning severity', async () => {
        await trail.verificationResult('lint', false, { errorCount: 5 });

        const events = await trail.getEvents();
        expect(events[0]?.severity).toBe('warning');
        expect(events[0]?.event).toBe('Check: lint failed');
      });
    });

    describe('workflowCompleted', () => {
      it('records successful completion', async () => {
        await trail.workflowCompleted(true, 60000);

        const events = await trail.getEvents();
        expect(events[0]?.event).toBe('Workflow completed');
        expect(events[0]?.severity).toBe('info');
      });

      it('records failed completion with critical severity', async () => {
        await trail.workflowCompleted(false, 30000);

        const events = await trail.getEvents();
        expect(events[0]?.event).toBe('Workflow failed');
        expect(events[0]?.severity).toBe('critical');
      });
    });
  });

  describe('createAuditTrail', () => {
    it('creates AuditTrail instance', () => {
      const trail = createAuditTrail('exec-001');
      expect(trail).toBeInstanceOf(AuditTrail);
    });

    it('accepts custom storage', () => {
      const customStorage = new InMemoryAuditStorage();
      const trail = createAuditTrail('exec-001', customStorage);

      expect(trail).toBeInstanceOf(AuditTrail);
    });
  });
});
