/**
 * nexus-agents/agents - Consensus Protocol Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ILogger, Task, TaskResult, IAgent } from '../../core/index.js';
import { ok, err, AgentError } from '../../core/index.js';
import { ConsensusProtocol } from './consensus-protocol.js';
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
    pattern: 'consensus',
    experts: ['expert-1', 'expert-2', 'expert-3'],
    task: createTestTask(),
    timeout: 60000,
    ...overrides,
  };
}

/**
 * Creates a mock agent for testing.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createMockAgent(taskId: string, voteOutput: unknown) {
  return {
    id: `agent-${taskId}`,
    role: 'custom' as const,
    state: 'idle' as const,
    capabilities: [] as string[],
    execute: vi.fn(() => Promise.resolve(ok(createTestResult(taskId, voteOutput)))),
    handleMessage: vi.fn(() =>
      Promise.resolve(ok({ messageId: `msg-${taskId}`, status: 'completed' as const, data: {} }))
    ),
    initialize: vi.fn(() => Promise.resolve(ok(undefined))),
    cleanup: vi.fn(() => Promise.resolve(ok(undefined))),
  } as unknown as IAgent;
}

describe('ConsensusProtocol', () => {
  let protocol: ConsensusProtocol;
  let mockLogger: ILogger;

  beforeEach(() => {
    mockLogger = createMockLogger();
    protocol = new ConsensusProtocol({ logger: mockLogger });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should create protocol with default options', () => {
      const defaultProtocol = new ConsensusProtocol();
      expect(defaultProtocol).toBeInstanceOf(ConsensusProtocol);
      expect(defaultProtocol.pattern).toBe('consensus');
    });

    it('should accept custom logger', () => {
      const customLogger = createMockLogger();
      const customProtocol = new ConsensusProtocol({ logger: customLogger });
      expect(customProtocol).toBeInstanceOf(ConsensusProtocol);
    });

    it('should have pattern set to consensus', () => {
      expect(protocol.pattern).toBe('consensus');
    });
  });

  describe('cancel', () => {
    it('should cancel protocol without active session', () => {
      protocol.cancel('Test cancellation');
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Protocol cancelled',
        expect.objectContaining({ reason: 'Test cancellation' })
      );
    });

    it('should cancel protocol with active session', async () => {
      const config = createTestConfig();
      const agents = new Map<string, IAgent>([
        ['expert-1', createMockAgent('task-1', { decision: 'approve', reasoning: 'Good' })],
        ['expert-2', createMockAgent('task-2', { decision: 'approve', reasoning: 'Good' })],
        ['expert-3', createMockAgent('task-3', { decision: 'approve', reasoning: 'Good' })],
      ]);

      // Start execution but don't await
      const executePromise = protocol.execute(config, agents);

      // Cancel immediately
      protocol.cancel('User cancelled');

      const result = await executePromise;
      // Cancellation doesn't prevent completion if agents already finished
      expect(result.ok).toBe(true);
    });
  });

  describe('execute', () => {
    it('should successfully execute consensus protocol with 3 experts', async () => {
      const config = createTestConfig();
      const agents = new Map<string, IAgent>([
        ['expert-1', createMockAgent('task-1', { decision: 'approve', reasoning: 'Looks good' })],
        ['expert-2', createMockAgent('task-2', { decision: 'approve', reasoning: 'LGTM' })],
        ['expert-3', createMockAgent('task-3', { decision: 'approve', reasoning: 'Approved' })],
      ]);

      const result = await protocol.execute(config, agents);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.sessionId).toBe('session-1');
        expect(result.value.pattern).toBe('consensus');
        expect(result.value.success).toBe(true);
      }
    });

    it('should handle mixed votes (approve and reject)', async () => {
      const config = createTestConfig();
      const agents = new Map<string, IAgent>([
        ['expert-1', createMockAgent('task-1', { decision: 'approve', reasoning: 'Good' })],
        ['expert-2', createMockAgent('task-2', { decision: 'reject', reasoning: 'Not good' })],
        ['expert-3', createMockAgent('task-3', { decision: 'approve', reasoning: 'Good' })],
      ]);

      const result = await protocol.execute(config, agents);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.expertResults).toHaveLength(3);
      }
    });

    it('should handle abstain votes', async () => {
      const config = createTestConfig();
      const agents = new Map<string, IAgent>([
        ['expert-1', createMockAgent('task-1', { decision: 'approve', reasoning: 'Good' })],
        ['expert-2', createMockAgent('task-2', { decision: 'abstain', reasoning: 'Unsure' })],
        ['expert-3', createMockAgent('task-3', { decision: 'approve', reasoning: 'Good' })],
      ]);

      const result = await protocol.execute(config, agents);

      expect(result.ok).toBe(true);
    });

    it('should extract votes from string output', async () => {
      const config = createTestConfig();
      const agents = new Map<string, IAgent>([
        ['expert-1', createMockAgent('task-1', 'I approve this task')],
        ['expert-2', createMockAgent('task-2', 'I reject this proposal')],
        ['expert-3', createMockAgent('task-3', 'Yes, looks good')],
      ]);

      const result = await protocol.execute(config, agents);

      expect(result.ok).toBe(true);
    });

    it('should extract votes from vote field', async () => {
      const config = createTestConfig();
      const agents = new Map<string, IAgent>([
        ['expert-1', createMockAgent('task-1', { vote: 'approve', reasoning: 'Good' })],
        ['expert-2', createMockAgent('task-2', { vote: 'reject', reasoning: 'Bad' })],
        ['expert-3', createMockAgent('task-3', { vote: 'approve', reasoning: 'Good' })],
      ]);

      const result = await protocol.execute(config, agents);

      expect(result.ok).toBe(true);
    });

    it('should fail if fewer than 3 experts provided', async () => {
      const config = createTestConfig({ experts: ['expert-1', 'expert-2'] });
      const agents = new Map<string, IAgent>([
        ['expert-1', createMockAgent('task-1', { decision: 'approve', reasoning: 'Good' })],
        ['expert-2', createMockAgent('task-2', { decision: 'approve', reasoning: 'Good' })],
      ]);

      const result = await protocol.execute(config, agents);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('at least 3 experts');
      }
    });

    it('should fail if expert not found in agents map', async () => {
      const config = createTestConfig();
      const agents = new Map<string, IAgent>([
        ['expert-1', createMockAgent('task-1', { decision: 'approve', reasoning: 'Good' })],
        ['expert-2', createMockAgent('task-2', { decision: 'approve', reasoning: 'Good' })],
        // expert-3 missing
      ]);

      const result = await protocol.execute(config, agents);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Agent not found');
      }
    });

    it('should handle agent execution failure', async () => {
      const config = createTestConfig();
      const failingAgent = {
        id: 'failing-agent',
        role: 'custom' as const,
        execute: vi.fn(() => Promise.resolve(err(new AgentError('Execution failed')))),
        initialize: vi.fn(() => Promise.resolve(ok(undefined))),
        cleanup: vi.fn(() => Promise.resolve(ok(undefined))),
      };

      const agents = new Map<string, IAgent>([
        ['expert-1', createMockAgent('task-1', { decision: 'approve', reasoning: 'Good' })],
        ['expert-2', failingAgent],
        ['expert-3', createMockAgent('task-3', { decision: 'approve', reasoning: 'Good' })],
      ]);

      const result = await protocol.execute(config, agents);

      // Should still complete with partial results
      expect(result.ok).toBe(true);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Expert failed in consensus voting',
        expect.objectContaining({ expertId: 'expert-2' })
      );
    });

    it('should handle all agents failing', async () => {
      const config = createTestConfig();
      const failingAgent1 = {
        id: 'failing-agent-1',
        role: 'custom' as const,
        execute: vi.fn(() => Promise.resolve(err(new AgentError('Execution failed')))),
        initialize: vi.fn(() => Promise.resolve(ok(undefined))),
        cleanup: vi.fn(() => Promise.resolve(ok(undefined))),
      };
      const failingAgent2 = {
        id: 'failing-agent-2',
        role: 'custom' as const,
        execute: vi.fn(() => Promise.resolve(err(new AgentError('Execution failed')))),
        initialize: vi.fn(() => Promise.resolve(ok(undefined))),
        cleanup: vi.fn(() => Promise.resolve(ok(undefined))),
      };
      const failingAgent3 = {
        id: 'failing-agent-3',
        role: 'custom' as const,
        execute: vi.fn(() => Promise.resolve(err(new AgentError('Execution failed')))),
        initialize: vi.fn(() => Promise.resolve(ok(undefined))),
        cleanup: vi.fn(() => Promise.resolve(ok(undefined))),
      };

      const agents = new Map<string, IAgent>([
        ['expert-1', failingAgent1],
        ['expert-2', failingAgent2],
        ['expert-3', failingAgent3],
      ]);

      const result = await protocol.execute(config, agents);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.success).toBe(false);
      }
    });

    it('should handle cancellation during execution', async () => {
      const config = createTestConfig();
      let cancelledDuringExecution = false;
      const slowAgent = {
        id: 'slow-agent',
        role: 'custom' as const,
        execute: vi.fn(() => {
          // Check if protocol was cancelled
          if (cancelledDuringExecution) {
            return Promise.resolve(err(new AgentError('Protocol cancelled')));
          }
          return Promise.resolve(
            ok(createTestResult('task-1', { decision: 'approve', reasoning: 'Good' }))
          );
        }),
        initialize: vi.fn(() => Promise.resolve(ok(undefined))),
        cleanup: vi.fn(() => Promise.resolve(ok(undefined))),
      };

      const agents = new Map<string, IAgent>([
        ['expert-1', slowAgent],
        ['expert-2', createMockAgent('task-2', { decision: 'approve', reasoning: 'Good' })],
        ['expert-3', createMockAgent('task-3', { decision: 'approve', reasoning: 'Good' })],
      ]);

      // Cancel before execution
      cancelledDuringExecution = true;
      protocol.cancel('Timeout');

      const result = await protocol.execute(config, agents);
      expect(result.ok).toBe(true); // Still completes with available results
    });

    it('should handle empty agents map', async () => {
      const config = createTestConfig();
      const agents = new Map<string, IAgent>();

      const result = await protocol.execute(config, agents);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Agent not found');
      }
    });

    it('should handle requireUnanimous flag', async () => {
      const config = createTestConfig({ requireUnanimous: true });
      const agents = new Map<string, IAgent>([
        ['expert-1', createMockAgent('task-1', { decision: 'approve', reasoning: 'Good' })],
        ['expert-2', createMockAgent('task-2', { decision: 'approve', reasoning: 'Good' })],
        ['expert-3', createMockAgent('task-3', { decision: 'approve', reasoning: 'Good' })],
      ]);

      const result = await protocol.execute(config, agents);

      expect(result.ok).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Starting consensus protocol',
        expect.objectContaining({ requireUnanimous: true })
      );
    });

    it('should handle custom timeout', async () => {
      const config = createTestConfig({ timeout: 30000 });
      const agents = new Map<string, IAgent>([
        ['expert-1', createMockAgent('task-1', { decision: 'approve', reasoning: 'Good' })],
        ['expert-2', createMockAgent('task-2', { decision: 'approve', reasoning: 'Good' })],
        ['expert-3', createMockAgent('task-3', { decision: 'approve', reasoning: 'Good' })],
      ]);

      const result = await protocol.execute(config, agents);

      expect(result.ok).toBe(true);
    });

    it('should log execution start', async () => {
      const config = createTestConfig();
      const agents = new Map<string, IAgent>([
        ['expert-1', createMockAgent('task-1', { decision: 'approve', reasoning: 'Good' })],
        ['expert-2', createMockAgent('task-2', { decision: 'approve', reasoning: 'Good' })],
        ['expert-3', createMockAgent('task-3', { decision: 'approve', reasoning: 'Good' })],
      ]);

      await protocol.execute(config, agents);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Starting consensus protocol',
        expect.objectContaining({
          sessionId: 'session-1',
          expertCount: 3,
        })
      );
    });

    it('should handle unparseable vote output', async () => {
      const config = createTestConfig();
      const agents = new Map<string, IAgent>([
        ['expert-1', createMockAgent('task-1', null)],
        ['expert-2', createMockAgent('task-2', undefined)],
        ['expert-3', createMockAgent('task-3', 123)],
      ]);

      const result = await protocol.execute(config, agents);

      // Should default to abstain for unparseable outputs
      expect(result.ok).toBe(true);
    });

    it('should handle expert array with duplicates', async () => {
      const config = createTestConfig({ experts: ['expert-1', 'expert-1', 'expert-2'] });
      const agents = new Map<string, IAgent>([
        ['expert-1', createMockAgent('task-1', { decision: 'approve', reasoning: 'Good' })],
        ['expert-2', createMockAgent('task-2', { decision: 'approve', reasoning: 'Good' })],
      ]);

      const result = await protocol.execute(config, agents);

      // Protocol executes with 3 expert slots even if duplicates (counts each entry)
      expect(result.ok).toBe(true);
    });

    it('should create voting task with modified description', async () => {
      const config = createTestConfig({
        task: createTestTask({ description: 'Original task' }),
      });
      const capturedTask = vi.fn();
      const agentWithCapture = {
        id: 'capture-agent',
        role: 'custom' as const,
        state: 'idle' as const,
        capabilities: [] as string[],
        execute: vi.fn((task: Task) => {
          capturedTask(task);
          return Promise.resolve(
            ok(createTestResult(task.id, { decision: 'approve', reasoning: 'Good' }))
          );
        }),
        handleMessage: vi.fn(() =>
          Promise.resolve(ok({ messageId: 'msg', status: 'completed' as const, data: {} }))
        ),
        initialize: vi.fn(() => Promise.resolve(ok(undefined))),
        cleanup: vi.fn(() => Promise.resolve(ok(undefined))),
      } as unknown as IAgent;

      const agents = new Map<string, IAgent>([
        ['expert-1', agentWithCapture],
        ['expert-2', createMockAgent('task-2', { decision: 'approve', reasoning: 'Good' })],
        ['expert-3', createMockAgent('task-3', { decision: 'approve', reasoning: 'Good' })],
      ]);

      await protocol.execute(config, agents);

      expect(capturedTask).toHaveBeenCalled();
      const task = capturedTask.mock.calls[0]![0] as Task;
      expect(task.description).toContain('vote');
    });
  });

  describe('edge cases', () => {
    it('should handle exactly 3 experts (minimum)', async () => {
      const config = createTestConfig({ experts: ['e1', 'e2', 'e3'] });
      const agents = new Map<string, IAgent>([
        ['e1', createMockAgent('task-1', { decision: 'approve', reasoning: 'Good' })],
        ['e2', createMockAgent('task-2', { decision: 'approve', reasoning: 'Good' })],
        ['e3', createMockAgent('task-3', { decision: 'approve', reasoning: 'Good' })],
      ]);

      const result = await protocol.execute(config, agents);

      expect(result.ok).toBe(true);
    });

    it('should handle large number of experts', async () => {
      const expertIds = Array.from({ length: 10 }, (_, i) => `expert-${String(i + 1)}`);
      const config = createTestConfig({ experts: expertIds });
      const agents = new Map<string, IAgent>(
        expertIds.map((id) => [
          id,
          createMockAgent(`task-${id}`, { decision: 'approve', reasoning: 'Good' }),
        ])
      );

      const result = await protocol.execute(config, agents);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.expertResults).toHaveLength(10);
      }
    });

    it('should reject empty task description', async () => {
      const config = createTestConfig({
        task: createTestTask({ description: '' }),
      });
      const agents = new Map<string, IAgent>([
        ['expert-1', createMockAgent('task-1', { decision: 'approve', reasoning: 'Good' })],
        ['expert-2', createMockAgent('task-2', { decision: 'approve', reasoning: 'Good' })],
        ['expert-3', createMockAgent('task-3', { decision: 'approve', reasoning: 'Good' })],
      ]);

      const result = await protocol.execute(config, agents);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Invalid collaboration config');
      }
    });

    it('should handle special characters in expert IDs', async () => {
      const config = createTestConfig({
        experts: ['expert@1', 'expert#2', 'expert$3'],
      });
      const agents = new Map<string, IAgent>([
        ['expert@1', createMockAgent('task-1', { decision: 'approve', reasoning: 'Good' })],
        ['expert#2', createMockAgent('task-2', { decision: 'approve', reasoning: 'Good' })],
        ['expert$3', createMockAgent('task-3', { decision: 'approve', reasoning: 'Good' })],
      ]);

      const result = await protocol.execute(config, agents);

      expect(result.ok).toBe(true);
    });
  });
});
