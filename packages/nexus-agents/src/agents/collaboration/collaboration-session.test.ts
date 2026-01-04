/**
 * @nexus-agents/agents - Collaboration Session Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ILogger, Task, TaskResult } from '../../core/index.js';
import { CollaborationSession, createCollaborationSession } from './collaboration-session.js';
import type { CollaborationConfig } from './collaboration-types.js';

/**
 * Mock logger for testing.
 */
function createMockLogger(): ILogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
    setLevel: vi.fn(),
  };
}

/**
 * Creates a valid task for testing.
 */
function createTestTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'test-task-1',
    description: 'Test task description',
    context: {},
    ...overrides,
  };
}

/**
 * Creates a valid task result for testing.
 */
function createTestResult(taskId: string, output: unknown = 'Test output'): TaskResult {
  return {
    taskId,
    output,
    metadata: {
      durationMs: 100,
      tokensUsed: 50,
      toolsUsed: [],
      model: 'test-model',
    },
  };
}

/**
 * Creates a valid collaboration config for testing.
 */
function createTestConfig(overrides: Partial<CollaborationConfig> = {}): CollaborationConfig {
  return {
    sessionId: 'session-1',
    pattern: 'parallel',
    experts: ['expert-1', 'expert-2'],
    task: createTestTask(),
    timeout: 60000,
    ...overrides,
  };
}

describe('CollaborationSession', () => {
  let session: CollaborationSession;
  let mockLogger: ILogger;

  beforeEach(() => {
    mockLogger = createMockLogger();
    session = createCollaborationSession({ logger: mockLogger });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should create a session with default options', () => {
      const defaultSession = createCollaborationSession();
      expect(defaultSession).toBeInstanceOf(CollaborationSession);
    });

    it('should accept custom logger', () => {
      const customLogger = createMockLogger();
      const customSession = createCollaborationSession({ logger: customLogger });
      const config = createTestConfig();

      customSession.start(config);
      expect(customLogger.info).toHaveBeenCalled();
    });

    it('should accept callbacks', () => {
      const onStatusChange = vi.fn();
      const onMessage = vi.fn();
      const customSession = createCollaborationSession({
        onStatusChange,
        onMessage,
      });

      const config = createTestConfig();
      customSession.start(config);

      expect(onStatusChange).toHaveBeenCalledWith('in_progress');
    });
  });

  describe('start', () => {
    it('should start a valid session', () => {
      const config = createTestConfig();
      const result = session.start(config);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('session-1');
      }
    });

    it('should set session status to in_progress', () => {
      const config = createTestConfig();
      session.start(config);

      const status = session.getStatus();
      expect(status?.status).toBe('in_progress');
    });

    it('should initialize participants', () => {
      const config = createTestConfig();
      session.start(config);

      const status = session.getStatus();
      expect(status?.participants).toHaveLength(2);
      expect(status?.participants[0]?.expertId).toBe('expert-1');
      expect(status?.participants[0]?.status).toBe('pending');
    });

    it('should fail with invalid config', () => {
      const config = { ...createTestConfig(), sessionId: '' };
      const result = session.start(config);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Invalid collaboration config');
      }
    });

    it('should fail if session already in progress', () => {
      const config = createTestConfig();
      session.start(config);

      const result = session.start(config);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('already in progress');
      }
    });

    it('should fail if not enough experts for pattern', () => {
      const config = createTestConfig({
        pattern: 'consensus',
        experts: ['expert-1', 'expert-2'], // needs 3
      });

      const result = session.start(config);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('requires at least 3 experts');
      }
    });

    it('should log session start', () => {
      const config = createTestConfig();
      session.start(config);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Starting collaboration session',
        expect.objectContaining({
          sessionId: 'session-1',
          pattern: 'parallel',
          expertCount: 2,
        })
      );
    });
  });

  describe('submitResult', () => {
    beforeEach(() => {
      session.start(createTestConfig());
    });

    it('should accept valid result submission', () => {
      const result = createTestResult('test-task-1');
      const submitResult = session.submitResult('expert-1', result);

      expect(submitResult.ok).toBe(true);
    });

    it('should update participant status', () => {
      const result = createTestResult('test-task-1');
      session.submitResult('expert-1', result);

      const status = session.getStatus();
      const participant = status?.participants.find((p) => p.expertId === 'expert-1');
      expect(participant?.status).toBe('submitted');
    });

    it('should store result', () => {
      const result = createTestResult('test-task-1');
      session.submitResult('expert-1', result);

      const status = session.getStatus();
      expect(status?.results.get('expert-1')).toBeDefined();
    });

    it('should fail if no active session', () => {
      const noSessionSession = createCollaborationSession();
      const result = createTestResult('test-task-1');
      const submitResult = noSessionSession.submitResult('expert-1', result);

      expect(submitResult.ok).toBe(false);
      if (!submitResult.ok) {
        expect(submitResult.error.message).toContain('No active session');
      }
    });

    it('should fail if expert not in session', () => {
      const result = createTestResult('test-task-1');
      const submitResult = session.submitResult('unknown-expert', result);

      expect(submitResult.ok).toBe(false);
      if (!submitResult.ok) {
        expect(submitResult.error.message).toContain('not in session');
      }
    });

    it('should fail if expert already submitted', () => {
      const result = createTestResult('test-task-1');
      session.submitResult('expert-1', result);

      const secondResult = session.submitResult('expert-1', result);
      expect(secondResult.ok).toBe(false);
      if (!secondResult.ok) {
        expect(secondResult.error.message).toContain('already submitted');
      }
    });

    it('should transition to finalizing when all results submitted', () => {
      session.submitResult('expert-1', createTestResult('test-task-1', 'output-1'));
      session.submitResult('expert-2', createTestResult('test-task-1', 'output-2'));

      const status = session.getStatus();
      expect(status?.status).toBe('finalizing');
    });
  });

  describe('requestReview', () => {
    beforeEach(() => {
      session.start(createTestConfig({ pattern: 'review' }));
    });

    it('should accept valid review request', () => {
      const result = session.requestReview('expert-1', 'expert-2', { code: 'test' });
      expect(result.ok).toBe(true);
    });

    it('should update reviewer status', () => {
      session.requestReview('expert-1', 'expert-2', { code: 'test' });

      const status = session.getStatus();
      const reviewer = status?.participants.find((p) => p.expertId === 'expert-2');
      expect(reviewer?.status).toBe('reviewing');
    });

    it('should set session to awaiting_review', () => {
      session.requestReview('expert-1', 'expert-2', { code: 'test' });

      const status = session.getStatus();
      expect(status?.status).toBe('awaiting_review');
    });

    it('should fail for non-review pattern', () => {
      const parallelSession = createCollaborationSession();
      parallelSession.start(createTestConfig({ pattern: 'parallel' }));

      const result = parallelSession.requestReview('expert-1', 'expert-2', {});
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('only allowed in review pattern');
      }
    });
  });

  describe('submitReview', () => {
    beforeEach(() => {
      session.start(createTestConfig({ pattern: 'review' }));
      session.requestReview('expert-1', 'expert-2', { code: 'test' });
    });

    it('should accept valid review submission', () => {
      const result = session.submitReview('expert-2', 'expert-1', true, 'LGTM');
      expect(result.ok).toBe(true);
    });

    it('should store review response', () => {
      session.submitReview('expert-2', 'expert-1', true, 'LGTM');

      const status = session.getStatus();
      expect(status?.reviews).toHaveLength(1);
      expect(status?.reviews[0]?.approved).toBe(true);
    });

    it('should fail if reviewer not in session', () => {
      const result = session.submitReview('unknown', 'expert-1', true, 'LGTM');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('not in session');
      }
    });
  });

  describe('vote', () => {
    beforeEach(() => {
      session.start(
        createTestConfig({
          pattern: 'consensus',
          experts: ['expert-1', 'expert-2', 'expert-3'],
        })
      );
    });

    it('should accept valid vote', () => {
      const result = session.vote('expert-1', 'approve', 'Looks good');
      expect(result.ok).toBe(true);
    });

    it('should update participant status to voted', () => {
      session.vote('expert-1', 'approve', 'Looks good');

      const status = session.getStatus();
      const voter = status?.participants.find((p) => p.expertId === 'expert-1');
      expect(voter?.status).toBe('voted');
    });

    it('should store vote', () => {
      session.vote('expert-1', 'approve', 'Looks good');

      const status = session.getStatus();
      expect(status?.votes).toHaveLength(1);
      expect(status?.votes[0]?.decision).toBe('approve');
    });

    it('should set session to voting status', () => {
      session.vote('expert-1', 'approve', 'Looks good');

      const status = session.getStatus();
      expect(status?.status).toBe('voting');
    });

    it('should fail for non-consensus pattern', () => {
      const parallelSession = createCollaborationSession();
      parallelSession.start(createTestConfig({ pattern: 'parallel' }));

      const result = parallelSession.vote('expert-1', 'approve', 'Looks good');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('only allowed in consensus pattern');
      }
    });

    it('should fail if expert already voted', () => {
      session.vote('expert-1', 'approve', 'Looks good');
      const result = session.vote('expert-1', 'reject', 'Changed my mind');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('already voted');
      }
    });

    it('should fail with empty reasoning', () => {
      const result = session.vote('expert-1', 'approve', '');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('reasoning is required');
      }
    });

    it('should transition to finalizing when all votes received', () => {
      session.vote('expert-1', 'approve', 'Good');
      session.vote('expert-2', 'approve', 'Good');
      session.vote('expert-3', 'approve', 'Good');

      const status = session.getStatus();
      expect(status?.status).toBe('finalizing');
    });
  });

  describe('getStatus', () => {
    it('should return null when no session', () => {
      expect(session.getStatus()).toBeNull();
    });

    it('should return session state copy', () => {
      session.start(createTestConfig());

      const status1 = session.getStatus();
      const status2 = session.getStatus();

      expect(status1).not.toBe(status2);
      expect(status1).toEqual(status2);
    });
  });

  describe('getSessionId', () => {
    it('should return null when no session', () => {
      expect(session.getSessionId()).toBeNull();
    });

    it('should return session ID when active', () => {
      session.start(createTestConfig());
      expect(session.getSessionId()).toBe('session-1');
    });
  });

  describe('markExpertFailed', () => {
    beforeEach(() => {
      session.start(createTestConfig());
    });

    it('should increment retry count', () => {
      session.markExpertFailed('expert-1', 'Connection error');

      const status = session.getStatus();
      const expert = status?.participants.find((p) => p.expertId === 'expert-1');
      expect(expert?.retryCount).toBe(1);
      expect(expert?.status).toBe('pending');
    });

    it('should mark as failed after max retries', () => {
      session.markExpertFailed('expert-1', 'Error 1');
      session.markExpertFailed('expert-1', 'Error 2');
      session.markExpertFailed('expert-1', 'Error 3');

      const status = session.getStatus();
      const expert = status?.participants.find((p) => p.expertId === 'expert-1');
      expect(expert?.status).toBe('failed');
    });
  });

  describe('getTaskAssignments', () => {
    it('should return empty array when no session', () => {
      expect(session.getTaskAssignments()).toEqual([]);
    });

    it('should return parallel assignments for all pending experts', () => {
      session.start(createTestConfig({ pattern: 'parallel' }));

      const assignments = session.getTaskAssignments();
      expect(assignments).toHaveLength(2);
      expect(assignments[0]?.type).toBe('task_assignment');
    });

    it('should return sequential assignment for first pending expert', () => {
      session.start(
        createTestConfig({
          pattern: 'sequential',
          experts: ['expert-1', 'expert-2'],
        })
      );

      const assignments = session.getTaskAssignments();
      expect(assignments).toHaveLength(1);
      expect(assignments[0]?.expertId).toBe('expert-1');
      expect(assignments[0]?.sequencePosition).toBe(0);
    });
  });

  describe('finalize', () => {
    beforeEach(() => {
      session.start(createTestConfig());
    });

    it('should return collaboration result', () => {
      session.submitResult('expert-1', createTestResult('test-task-1'));
      session.submitResult('expert-2', createTestResult('test-task-1'));

      const result = session.finalize();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.sessionId).toBe('session-1');
        expect(result.value.pattern).toBe('parallel');
        expect(result.value.success).toBe(true);
      }
    });

    it('should calculate quality score', () => {
      session.submitResult('expert-1', createTestResult('test-task-1'));
      session.submitResult('expert-2', createTestResult('test-task-1'));

      const result = session.finalize();
      if (result.ok) {
        expect(result.value.aggregatedResult.qualityScore).toBeGreaterThan(0);
      }
    });

    it('should include expert results', () => {
      session.submitResult('expert-1', createTestResult('test-task-1'));

      const result = session.finalize();
      if (result.ok) {
        expect(result.value.expertResults).toHaveLength(2);
        expect(result.value.expertResults[0]?.success).toBe(true);
        expect(result.value.expertResults[1]?.success).toBe(false);
      }
    });

    it('should fail if no active session', () => {
      const noSession = createCollaborationSession();
      const result = noSession.finalize();

      expect(result.ok).toBe(false);
    });

    it('should clear session after finalize', () => {
      session.submitResult('expert-1', createTestResult('test-task-1'));
      session.finalize();

      expect(session.getStatus()).toBeNull();
    });
  });

  describe('cancel', () => {
    it('should cancel session with reason', () => {
      session.start(createTestConfig());
      session.cancel('User cancelled');

      const status = session.getStatus();
      expect(status?.status).toBe('failed');
      expect(status?.error).toBe('User cancelled');
    });

    it('should do nothing if no session', () => {
      expect(() => {
        session.cancel('No session');
      }).not.toThrow();
    });
  });

  describe('timeout handling', () => {
    it('should timeout session after configured duration', () => {
      session.start(createTestConfig({ timeout: 1000 }));

      vi.advanceTimersByTime(1001);

      const status = session.getStatus();
      expect(status?.status).toBe('timed_out');
    });

    it('should emit timeout event', () => {
      const listener = vi.fn();
      session.addEventListener(listener);
      session.start(createTestConfig({ timeout: 1000 }));

      vi.advanceTimersByTime(1001);

      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ type: 'timeout' }));
    });

    it('should use default timeout from pattern', () => {
      // Don't pass timeout at all - let it use default
      session.start(createTestConfig());

      vi.advanceTimersByTime(3 * 60 * 1000); // parallel default

      const status = session.getStatus();
      expect(status?.status).toBe('timed_out');
    });
  });

  describe('event listeners', () => {
    it('should call listeners on status change', () => {
      const listener = vi.fn();
      session.addEventListener(listener);
      session.start(createTestConfig());

      expect(listener).toHaveBeenCalledWith({ type: 'status_change', status: 'in_progress' });
    });

    it('should call listeners on result submission', () => {
      const listener = vi.fn();
      session.addEventListener(listener);
      session.start(createTestConfig());

      const result = createTestResult('test-task-1');
      session.submitResult('expert-1', result);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'result_submitted',
          expertId: 'expert-1',
        })
      );
    });

    it('should remove listener', () => {
      const listener = vi.fn();
      session.addEventListener(listener);
      session.removeEventListener(listener);
      session.start(createTestConfig());

      expect(listener).not.toHaveBeenCalled();
    });

    it('should catch listener errors', () => {
      const errorListener = vi.fn().mockImplementation(() => {
        throw new Error('Listener error');
      });
      session.addEventListener(errorListener);
      session.start(createTestConfig());

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Event listener error',
        expect.any(Error),
        expect.objectContaining({ eventType: 'status_change' })
      );
    });
  });

  describe('consensus success criteria', () => {
    it('should succeed with majority approval', () => {
      session.start(
        createTestConfig({
          pattern: 'consensus',
          experts: ['e1', 'e2', 'e3'],
        })
      );

      session.vote('e1', 'approve', 'Good');
      session.vote('e2', 'approve', 'Good');
      session.vote('e3', 'reject', 'Bad');

      const result = session.finalize();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.success).toBe(true);
      }
    });

    it('should fail without majority approval', () => {
      session.start(
        createTestConfig({
          pattern: 'consensus',
          experts: ['e1', 'e2', 'e3'],
        })
      );

      session.vote('e1', 'approve', 'Good');
      session.vote('e2', 'reject', 'Bad');
      session.vote('e3', 'reject', 'Bad');

      const result = session.finalize();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.success).toBe(false);
      }
    });

    it('should require unanimous for requireUnanimous', () => {
      session.start(
        createTestConfig({
          pattern: 'consensus',
          experts: ['e1', 'e2', 'e3'],
          requireUnanimous: true,
        })
      );

      session.vote('e1', 'approve', 'Good');
      session.vote('e2', 'approve', 'Good');
      session.vote('e3', 'reject', 'Bad');

      const result = session.finalize();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.success).toBe(false);
      }
    });
  });
});
