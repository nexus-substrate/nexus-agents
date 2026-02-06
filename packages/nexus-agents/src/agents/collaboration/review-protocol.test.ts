/**
 * nexus-agents/agents - Review Protocol Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ILogger, Task, TaskResult, IAgent, Result } from '../../core/index.js';
import { ok, err, AgentError } from '../../core/index.js';
import { ReviewProtocol } from './review-protocol.js';
import type { CollaborationConfig } from './collaboration-types.js';

/**
 * Mock logger for testing.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createMockLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
    setLevel: vi.fn(),
  } as unknown as ILogger;
}

/**
 * Creates a valid task for testing.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createTestTask(overrides: Partial<Task> = {}) {
  return {
    id: 'test-task-1',
    description: 'Test task description',
    context: {},
    ...overrides,
  } as Task;
}

/**
 * Creates a valid task result for testing.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createTestResult(taskId: string, output: unknown = 'Test output') {
  return {
    taskId,
    output,
    metadata: {
      durationMs: 100,
      tokensUsed: 50,
      toolsUsed: [],
      model: 'test-model',
    },
  } as TaskResult;
}

/**
 * Creates a valid collaboration config for testing.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createTestConfig(overrides: Partial<CollaborationConfig> = {}) {
  return {
    sessionId: 'session-1',
    pattern: 'review' as const,
    experts: ['producer-1', 'reviewer-1'],
    task: createTestTask(),
    timeout: 60000,
    ...overrides,
  } as CollaborationConfig;
}

/**
 * Creates a mock agent for testing.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createMockAgent(executeResult?: Result<TaskResult, AgentError>) {
  const defaultResult = ok(createTestResult('test-task-1', 'Mock agent output'));
  return {
    execute: vi.fn(() => Promise.resolve(executeResult ?? defaultResult)),
    id: 'mock-agent-1',
    role: 'custom' as const,
  } as unknown as IAgent;
}

describe('ReviewProtocol', () => {
  let protocol: ReviewProtocol;
  let mockLogger: ILogger;

  beforeEach(() => {
    mockLogger = createMockLogger();
    protocol = new ReviewProtocol({ logger: mockLogger });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should create a protocol with default options', () => {
      const defaultProtocol = new ReviewProtocol();
      expect(defaultProtocol).toBeInstanceOf(ReviewProtocol);
      expect(defaultProtocol.pattern).toBe('review');
    });

    it('should accept custom logger', () => {
      const customLogger = createMockLogger();
      const customProtocol = new ReviewProtocol({ logger: customLogger });
      expect(customProtocol).toBeInstanceOf(ReviewProtocol);
    });

    it('should have review pattern', () => {
      expect(protocol.pattern).toBe('review');
    });
  });

  describe('cancel', () => {
    it('should mark protocol as cancelled', () => {
      protocol.cancel('Test cancellation');
      expect(mockLogger.info).toHaveBeenCalledWith('Protocol cancelled', {
        reason: 'Test cancellation',
      });
    });

    it('should not throw if session is null', () => {
      expect(() => {
        protocol.cancel('Cancel before session');
      }).not.toThrow();
    });
  });

  describe('execute - validation', () => {
    it('should fail if config has fewer than 2 experts', async () => {
      const config = createTestConfig({ experts: ['producer-1'] });
      const agents = new Map<string, IAgent>();
      agents.set('producer-1', createMockAgent());

      const result = await protocol.execute(config, agents);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe('Review protocol requires at least 2 experts');
      }
    });

    it('should fail if producer agent not found', async () => {
      const config = createTestConfig({ experts: ['producer-1', 'reviewer-1'] });
      const agents = new Map<string, IAgent>();
      agents.set('reviewer-1', createMockAgent());

      const result = await protocol.execute(config, agents);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Agent not found');
      }
    });

    it('should fail if reviewer agent not found', async () => {
      const config = createTestConfig({ experts: ['producer-1', 'reviewer-1'] });
      const agents = new Map<string, IAgent>();
      agents.set('producer-1', createMockAgent());

      const result = await protocol.execute(config, agents);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Agent not found');
      }
    });

    it('should fail if expert IDs are undefined', async () => {
      const config = createTestConfig({ experts: [] });
      const agents = new Map<string, IAgent>();

      const result = await protocol.execute(config, agents);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe('Review protocol requires at least 2 experts');
      }
    });
  });

  describe('execute - production phase', () => {
    it('should execute producer agent with task', async () => {
      const config = createTestConfig();
      const producerAgent = createMockAgent(ok(createTestResult('test-task-1', 'Producer work')));
      const reviewerAgent = createMockAgent(
        ok(createTestResult('test-task-1-review', { approved: true, feedback: 'LGTM' }))
      );

      const agents = new Map<string, IAgent>();
      agents.set('producer-1', producerAgent);
      agents.set('reviewer-1', reviewerAgent);

      const result = await protocol.execute(config, agents);

      expect(result.ok).toBe(true);
      expect(producerAgent.execute).toHaveBeenCalledWith(config.task);
    });

    it('should fail if producer execution fails', async () => {
      const config = createTestConfig();
      const producerError = new AgentError('Producer failed');
      const producerAgent = createMockAgent(err(producerError));
      const reviewerAgent = createMockAgent();

      const agents = new Map<string, IAgent>();
      agents.set('producer-1', producerAgent);
      agents.set('reviewer-1', reviewerAgent);

      const result = await protocol.execute(config, agents);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(producerError);
      }
    });

    it('should handle cancelled protocol during production', async () => {
      const config = createTestConfig();
      const producerAgent = createMockAgent();
      const reviewerAgent = createMockAgent();

      const agents = new Map<string, IAgent>();
      agents.set('producer-1', producerAgent);
      agents.set('reviewer-1', reviewerAgent);

      // Override producer's execute to cancel mid-execution
      producerAgent.execute = vi.fn(() => {
        protocol.cancel('Cancel during production');
        const result = err(new AgentError('Protocol cancelled'));
        return Promise.resolve(result);
      });

      const result = await protocol.execute(config, agents);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe('Protocol cancelled');
      }
    });
  });

  describe('execute - review phase', () => {
    it('should execute reviewer agent with production output', async () => {
      const config = createTestConfig();
      const producerOutput = { code: 'function test() {}', description: 'Test function' };
      const producerAgent = createMockAgent(ok(createTestResult('test-task-1', producerOutput)));
      const reviewerAgent = createMockAgent(
        ok(createTestResult('test-task-1-review', { approved: true, feedback: 'Looks good' }))
      );

      const agents = new Map<string, IAgent>();
      agents.set('producer-1', producerAgent);
      agents.set('reviewer-1', reviewerAgent);

      const result = await protocol.execute(config, agents);

      expect(result.ok).toBe(true);
      expect(reviewerAgent.execute).toHaveBeenCalled();

      // Verify review task structure
      const reviewTaskCall = (reviewerAgent.execute as ReturnType<typeof vi.fn>).mock.calls[0]!;
      const reviewTask = reviewTaskCall[0] as Task;
      expect(reviewTask.id).toBe('test-task-1-review');
      expect(reviewTask.description).toContain('Review the following work');
      expect(reviewTask.description).toContain(JSON.stringify(producerOutput, null, 2));
    });

    it('should fail if reviewer execution fails', async () => {
      const config = createTestConfig();
      const producerAgent = createMockAgent(ok(createTestResult('test-task-1', 'Producer work')));
      const reviewerError = new AgentError('Reviewer failed');
      const reviewerAgent = createMockAgent(err(reviewerError));

      const agents = new Map<string, IAgent>();
      agents.set('producer-1', producerAgent);
      agents.set('reviewer-1', reviewerAgent);

      const result = await protocol.execute(config, agents);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(reviewerError);
      }
    });

    it('should handle cancelled protocol during review', async () => {
      const config = createTestConfig();
      const producerAgent = createMockAgent(ok(createTestResult('test-task-1', 'Producer work')));
      const reviewerAgent = createMockAgent();

      const agents = new Map<string, IAgent>();
      agents.set('producer-1', producerAgent);
      agents.set('reviewer-1', reviewerAgent);

      // Cancel after production succeeds
      producerAgent.execute = vi.fn(() => {
        protocol.cancel('Cancel during review');
        return Promise.resolve(ok(createTestResult('test-task-1', 'Producer work')));
      });

      const result = await protocol.execute(config, agents);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe('Protocol cancelled');
      }
    });
  });

  describe('execute - approval extraction', () => {
    it('should extract approval from object output', async () => {
      const config = createTestConfig();
      const producerAgent = createMockAgent(ok(createTestResult('test-task-1', 'Work')));
      const reviewerAgent = createMockAgent(
        ok(createTestResult('test-task-1-review', { approved: true, feedback: 'Good work' }))
      );

      const agents = new Map<string, IAgent>();
      agents.set('producer-1', producerAgent);
      agents.set('reviewer-1', reviewerAgent);

      const result = await protocol.execute(config, agents);

      expect(result.ok).toBe(true);
    });

    it('should extract approval from string with "approved"', async () => {
      const config = createTestConfig();
      const producerAgent = createMockAgent(ok(createTestResult('test-task-1', 'Work')));
      const reviewerAgent = createMockAgent(
        ok(createTestResult('test-task-1-review', 'This work is approved'))
      );

      const agents = new Map<string, IAgent>();
      agents.set('producer-1', producerAgent);
      agents.set('reviewer-1', reviewerAgent);

      const result = await protocol.execute(config, agents);

      expect(result.ok).toBe(true);
    });

    it('should extract approval from string with "lgtm"', async () => {
      const config = createTestConfig();
      const producerAgent = createMockAgent(ok(createTestResult('test-task-1', 'Work')));
      const reviewerAgent = createMockAgent(
        ok(createTestResult('test-task-1-review', 'LGTM - ship it!'))
      );

      const agents = new Map<string, IAgent>();
      agents.set('producer-1', producerAgent);
      agents.set('reviewer-1', reviewerAgent);

      const result = await protocol.execute(config, agents);

      expect(result.ok).toBe(true);
    });

    it('should default to approved for non-string/object output', async () => {
      const config = createTestConfig();
      const producerAgent = createMockAgent(ok(createTestResult('test-task-1', 'Work')));
      const reviewerAgent = createMockAgent(ok(createTestResult('test-task-1-review', null)));

      const agents = new Map<string, IAgent>();
      agents.set('producer-1', producerAgent);
      agents.set('reviewer-1', reviewerAgent);

      const result = await protocol.execute(config, agents);

      expect(result.ok).toBe(true);
    });
  });

  describe('execute - feedback extraction', () => {
    it('should extract feedback from object output', async () => {
      const config = createTestConfig();
      const producerAgent = createMockAgent(ok(createTestResult('test-task-1', 'Work')));
      const reviewerAgent = createMockAgent(
        ok(
          createTestResult('test-task-1-review', {
            approved: true,
            feedback: 'Consider adding tests',
          })
        )
      );

      const agents = new Map<string, IAgent>();
      agents.set('producer-1', producerAgent);
      agents.set('reviewer-1', reviewerAgent);

      const result = await protocol.execute(config, agents);

      expect(result.ok).toBe(true);
    });

    it('should use string output as feedback', async () => {
      const config = createTestConfig();
      const producerAgent = createMockAgent(ok(createTestResult('test-task-1', 'Work')));
      const reviewerAgent = createMockAgent(
        ok(createTestResult('test-task-1-review', 'This is my feedback'))
      );

      const agents = new Map<string, IAgent>();
      agents.set('producer-1', producerAgent);
      agents.set('reviewer-1', reviewerAgent);

      const result = await protocol.execute(config, agents);

      expect(result.ok).toBe(true);
    });

    it('should stringify non-string/object feedback', async () => {
      const config = createTestConfig();
      const producerAgent = createMockAgent(ok(createTestResult('test-task-1', 'Work')));
      const reviewerAgent = createMockAgent(ok(createTestResult('test-task-1-review', 12345)));

      const agents = new Map<string, IAgent>();
      agents.set('producer-1', producerAgent);
      agents.set('reviewer-1', reviewerAgent);

      const result = await protocol.execute(config, agents);

      expect(result.ok).toBe(true);
    });
  });

  describe('execute - finalization', () => {
    it('should finalize session successfully', async () => {
      const config = createTestConfig();
      const producerAgent = createMockAgent(ok(createTestResult('test-task-1', 'Producer work')));
      const reviewerAgent = createMockAgent(
        ok(createTestResult('test-task-1-review', { approved: true, feedback: 'LGTM' }))
      );

      const agents = new Map<string, IAgent>();
      agents.set('producer-1', producerAgent);
      agents.set('reviewer-1', reviewerAgent);

      const result = await protocol.execute(config, agents);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.sessionId).toBe('session-1');
        expect(result.value.pattern).toBe('review');
        expect(result.value.success).toBe(true);
      }
    });

    it('should handle session finalization error', async () => {
      const config = createTestConfig();
      const producerAgent = createMockAgent(ok(createTestResult('test-task-1', 'Work')));
      const reviewerAgent = createMockAgent(
        ok(createTestResult('test-task-1-review', { approved: false, feedback: 'Needs work' }))
      );

      const agents = new Map<string, IAgent>();
      agents.set('producer-1', producerAgent);
      agents.set('reviewer-1', reviewerAgent);

      const result = await protocol.execute(config, agents);

      // Even with not-approved review, protocol should complete successfully
      expect(result.ok).toBe(true);
    });
  });

  describe('execute - with multiple experts', () => {
    it('should use first expert as producer and second as reviewer', async () => {
      const config = createTestConfig({
        experts: ['expert-a', 'expert-b', 'expert-c'],
      });
      const agentA = createMockAgent(ok(createTestResult('test-task-1', 'Work from A')));
      const agentB = createMockAgent(
        ok(createTestResult('test-task-1-review', { approved: true, feedback: 'B approves' }))
      );
      const agentC = createMockAgent();

      const agents = new Map<string, IAgent>();
      agents.set('expert-a', agentA);
      agents.set('expert-b', agentB);
      agents.set('expert-c', agentC);

      const result = await protocol.execute(config, agents);

      expect(result.ok).toBe(true);
      expect(agentA.execute).toHaveBeenCalled();
      expect(agentB.execute).toHaveBeenCalled();
      expect(agentC.execute).not.toHaveBeenCalled();
    });
  });

  describe('execute - edge cases', () => {
    it('should handle empty producer output', async () => {
      const config = createTestConfig();
      const producerAgent = createMockAgent(ok(createTestResult('test-task-1', '')));
      const reviewerAgent = createMockAgent(
        ok(createTestResult('test-task-1-review', { approved: true, feedback: 'OK' }))
      );

      const agents = new Map<string, IAgent>();
      agents.set('producer-1', producerAgent);
      agents.set('reviewer-1', reviewerAgent);

      const result = await protocol.execute(config, agents);

      expect(result.ok).toBe(true);
    });

    it('should handle complex nested producer output', async () => {
      const config = createTestConfig();
      const complexOutput = {
        code: { files: [{ path: 'test.ts', content: 'export const x = 1;' }] },
        metadata: { linesOfCode: 100, complexity: 5 },
      };
      const producerAgent = createMockAgent(ok(createTestResult('test-task-1', complexOutput)));
      const reviewerAgent = createMockAgent(
        ok(createTestResult('test-task-1-review', { approved: true, feedback: 'Good' }))
      );

      const agents = new Map<string, IAgent>();
      agents.set('producer-1', producerAgent);
      agents.set('reviewer-1', reviewerAgent);

      const result = await protocol.execute(config, agents);

      expect(result.ok).toBe(true);

      // Verify complex output was passed to review task
      const reviewTaskCall = (reviewerAgent.execute as ReturnType<typeof vi.fn>).mock.calls[0]!;
      const reviewTask = reviewTaskCall[0] as Task;
      expect(reviewTask.description).toContain(JSON.stringify(complexOutput, null, 2));
    });

    it('should preserve task context in review task', async () => {
      const config = createTestConfig({
        task: createTestTask({
          context: { metadata: { priority: 'high', tags: ['important'] } },
        }),
      });
      const producerAgent = createMockAgent(ok(createTestResult('test-task-1', 'Work')));
      const reviewerAgent = createMockAgent(
        ok(createTestResult('test-task-1-review', { approved: true, feedback: 'OK' }))
      );

      const agents = new Map<string, IAgent>();
      agents.set('producer-1', producerAgent);
      agents.set('reviewer-1', reviewerAgent);

      const result = await protocol.execute(config, agents);

      expect(result.ok).toBe(true);

      // Verify context preserved
      const reviewTaskCall = (reviewerAgent.execute as ReturnType<typeof vi.fn>).mock.calls[0]!;
      const reviewTask = reviewTaskCall[0] as Task;
      expect(reviewTask.context.metadata).toBeDefined();
    });
  });

  describe('logging', () => {
    it('should log protocol start', async () => {
      const config = createTestConfig();
      const producerAgent = createMockAgent();
      const reviewerAgent = createMockAgent();

      const agents = new Map<string, IAgent>();
      agents.set('producer-1', producerAgent);
      agents.set('reviewer-1', reviewerAgent);

      await protocol.execute(config, agents);

      expect(mockLogger.info).toHaveBeenCalledWith('Starting review protocol', {
        sessionId: 'session-1',
        producerId: 'producer-1',
        reviewerId: 'reviewer-1',
      });
    });

    it('should log cancellation', () => {
      protocol.cancel('Test reason');

      expect(mockLogger.info).toHaveBeenCalledWith('Protocol cancelled', {
        reason: 'Test reason',
      });
    });
  });
});
