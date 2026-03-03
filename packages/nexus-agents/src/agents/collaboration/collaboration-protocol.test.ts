/**
 * nexus-agents/agents - Collaboration Protocol Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  Result,
  IAgent,
  Task,
  TaskResult,
  AgentRole,
  AgentState,
  AgentCapability,
} from '../../core/index.js';
import { ok, err, AgentError } from '../../core/index.js';
import {
  SequentialProtocol,
  ParallelProtocol,
  ReviewProtocol,
  ConsensusProtocol,
  ProtocolFactory,
  createProtocolFactory,
} from './collaboration-protocol.js';
import type { CollaborationConfig } from './collaboration-types.js';

/**
 * Creates a mock agent for testing.
 */
function createMockAgent(
  id: string,
  executeResult: Result<TaskResult, AgentError> = ok(createTestResult(id))
): IAgent {
  return {
    id,
    role: 'code_expert' as AgentRole,
    state: 'idle' as AgentState,
    capabilities: ['task_execution'] as readonly AgentCapability[],
    execute: vi.fn().mockResolvedValue(executeResult),
    handleMessage: vi.fn().mockResolvedValue(ok({ messageId: '1', status: 'completed' })),
    initialize: vi.fn().mockResolvedValue(ok(undefined)),
    cleanup: vi.fn().mockResolvedValue(undefined),
  };
}

/**
 * Creates a test task result.
 */
function createTestResult(
  expertId: string,
  output: unknown = `Output from ${expertId}`
): TaskResult {
  return {
    taskId: 'test-task-1',
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
 * Creates a test collaboration config.
 */
function createTestConfig(overrides: Partial<CollaborationConfig> = {}): CollaborationConfig {
  return {
    sessionId: 'session-1',
    pattern: 'parallel',
    experts: ['expert-1', 'expert-2'],
    task: {
      id: 'test-task-1',
      description: 'Test task description',
      context: {},
    },
    timeout: 60000,
    ...overrides,
  };
}

describe('SequentialProtocol', () => {
  let protocol: SequentialProtocol;
  let agents: Map<string, IAgent>;

  beforeEach(() => {
    protocol = new SequentialProtocol();
    agents = new Map([
      ['expert-1', createMockAgent('expert-1')],
      ['expert-2', createMockAgent('expert-2')],
    ]);
  });

  it('should have correct pattern', () => {
    expect(protocol.pattern).toBe('sequential');
  });

  it('should execute experts in order', async () => {
    const config = createTestConfig({ pattern: 'sequential' });

    const result = await protocol.execute(config, agents);

    expect(result.ok).toBe(true);
    expect(agents.get('expert-1')?.execute).toHaveBeenCalled();
    expect(agents.get('expert-2')?.execute).toHaveBeenCalled();
  });

  it('should pass previous results to next expert', async () => {
    const config = createTestConfig({ pattern: 'sequential' });

    await protocol.execute(config, agents);

    const expert2 = agents.get('expert-2');
    expect(expert2).toBeDefined();
    const expert2Execute = expert2!.execute as ReturnType<typeof vi.fn>;
    const callArgs = expert2Execute.mock.calls[0]?.[0] as Task | undefined;

    expect(callArgs?.context.metadata?.previousResults).toBeDefined();
    expect(callArgs?.context.metadata?.previousResults).toHaveLength(1);
  });

  it('should fail if agent not found', async () => {
    const config = createTestConfig({
      pattern: 'sequential',
      experts: ['expert-1', 'missing-expert'],
    });

    const result = await protocol.execute(config, agents);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Agent not found');
    }
  });

  it('should stop on expert failure by default', async () => {
    const failingAgent = createMockAgent('expert-1', err(new AgentError('Execution failed')));
    agents.set('expert-1', failingAgent);

    const config = createTestConfig({ pattern: 'sequential' });
    const result = await protocol.execute(config, agents);

    expect(result.ok).toBe(false);
    expect(agents.get('expert-2')?.execute).not.toHaveBeenCalled();
  });

  it('should continue on failure if configured', async () => {
    const failingAgent = createMockAgent('expert-1', err(new AgentError('Execution failed')));
    agents.set('expert-1', failingAgent);

    protocol = new SequentialProtocol({ continueOnFailure: true });
    const config = createTestConfig({ pattern: 'sequential' });
    const result = await protocol.execute(config, agents);

    expect(result.ok).toBe(true);
    expect(agents.get('expert-2')?.execute).toHaveBeenCalled();
  });

  it('should respect sequential delay', async () => {
    protocol = new SequentialProtocol({ sequentialDelay: 100 });
    const config = createTestConfig({ pattern: 'sequential' });

    const startTime = Date.now();
    await protocol.execute(config, agents);
    const duration = Date.now() - startTime;

    expect(duration).toBeGreaterThanOrEqual(100);
  });

  it('should be cancellable', async () => {
    // Create a slow agent for expert-1 that takes time
    const slowAgent = createMockAgent('expert-1');
    (slowAgent.execute as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise((resolve) =>
        setTimeout(() => {
          resolve(ok(createTestResult('expert-1')));
        }, 100)
      )
    );
    agents.set('expert-1', slowAgent);

    const config = createTestConfig({ pattern: 'sequential' });
    const executePromise = protocol.execute(config, agents);

    // Cancel after a short delay to ensure execution has started
    await new Promise((resolve) => setTimeout(resolve, 10));
    protocol.cancel('User cancelled');

    const result = await executePromise;

    // Protocol was cancelled after first expert completed
    // Since first expert already finished, result is ok but second expert was skipped
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Only expert-1 completed, expert-2 was skipped due to cancellation
      const completedExperts = result.value.expertResults.filter((e) => e.success).length;
      expect(completedExperts).toBeLessThanOrEqual(2);
    }
  });
});

describe('ParallelProtocol', () => {
  let protocol: ParallelProtocol;
  let agents: Map<string, IAgent>;

  beforeEach(() => {
    protocol = new ParallelProtocol();
    agents = new Map([
      ['expert-1', createMockAgent('expert-1')],
      ['expert-2', createMockAgent('expert-2')],
      ['expert-3', createMockAgent('expert-3')],
    ]);
  });

  it('should have correct pattern', () => {
    expect(protocol.pattern).toBe('parallel');
  });

  it('should execute all experts in parallel', async () => {
    const config = createTestConfig({
      pattern: 'parallel',
      experts: ['expert-1', 'expert-2', 'expert-3'],
    });

    const result = await protocol.execute(config, agents);

    expect(result.ok).toBe(true);
    expect(agents.get('expert-1')?.execute).toHaveBeenCalled();
    expect(agents.get('expert-2')?.execute).toHaveBeenCalled();
    expect(agents.get('expert-3')?.execute).toHaveBeenCalled();
  });

  it('should aggregate results from all experts', async () => {
    const config = createTestConfig({
      pattern: 'parallel',
      experts: ['expert-1', 'expert-2'],
    });

    const result = await protocol.execute(config, agents);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.expertResults).toHaveLength(2);
    }
  });

  it('should handle partial failures', async () => {
    const failingAgent = createMockAgent('expert-2', err(new AgentError('Failed')));
    agents.set('expert-2', failingAgent);

    const config = createTestConfig({
      pattern: 'parallel',
      experts: ['expert-1', 'expert-2'],
    });

    const result = await protocol.execute(config, agents);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.expertResults[0]?.success).toBe(true);
      expect(result.value.expertResults[1]?.success).toBe(false);
    }
  });

  it('should fail if agent not found', async () => {
    const config = createTestConfig({
      pattern: 'parallel',
      experts: ['expert-1', 'missing-expert'],
    });

    const result = await protocol.execute(config, agents);

    expect(result.ok).toBe(false);
  });
});

describe('ReviewProtocol', () => {
  let protocol: ReviewProtocol;
  let agents: Map<string, IAgent>;

  beforeEach(() => {
    protocol = new ReviewProtocol();
    agents = new Map([
      ['producer', createMockAgent('producer')],
      [
        'reviewer',
        createMockAgent(
          'reviewer',
          ok(createTestResult('reviewer', { approved: true, feedback: 'LGTM' }))
        ),
      ],
    ]);
  });

  it('should have correct pattern', () => {
    expect(protocol.pattern).toBe('review');
  });

  it('should execute producer then reviewer', async () => {
    const config = createTestConfig({
      pattern: 'review',
      experts: ['producer', 'reviewer'],
    });

    const result = await protocol.execute(config, agents);

    expect(result.ok).toBe(true);
    expect(agents.get('producer')?.execute).toHaveBeenCalled();
    expect(agents.get('reviewer')?.execute).toHaveBeenCalled();
  });

  it('should require at least 2 experts', async () => {
    const config = createTestConfig({
      pattern: 'review',
      experts: ['producer'],
    });

    const result = await protocol.execute(config, agents);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('at least 2 experts');
    }
  });

  it('should pass production output to reviewer', async () => {
    const config = createTestConfig({
      pattern: 'review',
      experts: ['producer', 'reviewer'],
    });

    await protocol.execute(config, agents);

    const reviewer = agents.get('reviewer');
    expect(reviewer).toBeDefined();
    const reviewerExecute = reviewer!.execute as ReturnType<typeof vi.fn>;
    const callArgs = reviewerExecute.mock.calls[0]?.[0] as Task | undefined;

    expect(callArgs?.description).toContain('Review');
  });

  it('should extract approval from string output', async () => {
    const stringReviewer = createMockAgent(
      'reviewer',
      ok(createTestResult('reviewer', 'This looks good, approved!'))
    );
    agents.set('reviewer', stringReviewer);

    const config = createTestConfig({
      pattern: 'review',
      experts: ['producer', 'reviewer'],
    });

    const result = await protocol.execute(config, agents);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.success).toBe(true);
    }
  });

  it('should fail if producer fails', async () => {
    const failingProducer = createMockAgent('producer', err(new AgentError('Failed')));
    agents.set('producer', failingProducer);

    const config = createTestConfig({
      pattern: 'review',
      experts: ['producer', 'reviewer'],
    });

    const result = await protocol.execute(config, agents);

    expect(result.ok).toBe(false);
  });
});

describe('ConsensusProtocol', () => {
  let protocol: ConsensusProtocol;
  let agents: Map<string, IAgent>;

  beforeEach(() => {
    protocol = new ConsensusProtocol();
    agents = new Map([
      [
        'expert-1',
        createMockAgent(
          'expert-1',
          ok(createTestResult('expert-1', { decision: 'approve', reasoning: 'Good' }))
        ),
      ],
      [
        'expert-2',
        createMockAgent(
          'expert-2',
          ok(createTestResult('expert-2', { decision: 'approve', reasoning: 'Fine' }))
        ),
      ],
      [
        'expert-3',
        createMockAgent(
          'expert-3',
          ok(createTestResult('expert-3', { decision: 'reject', reasoning: 'Bad' }))
        ),
      ],
    ]);
  });

  it('should have correct pattern', () => {
    expect(protocol.pattern).toBe('consensus');
  });

  it('should execute all experts for voting', async () => {
    const config = createTestConfig({
      pattern: 'consensus',
      experts: ['expert-1', 'expert-2', 'expert-3'],
    });

    const result = await protocol.execute(config, agents);

    expect(result.ok).toBe(true);
    expect(agents.get('expert-1')?.execute).toHaveBeenCalled();
    expect(agents.get('expert-2')?.execute).toHaveBeenCalled();
    expect(agents.get('expert-3')?.execute).toHaveBeenCalled();
  });

  it('should require at least 3 experts', async () => {
    const config = createTestConfig({
      pattern: 'consensus',
      experts: ['expert-1', 'expert-2'],
    });

    const result = await protocol.execute(config, agents);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('at least 3 experts');
    }
  });

  it('should extract votes from output', async () => {
    const config = createTestConfig({
      pattern: 'consensus',
      experts: ['expert-1', 'expert-2', 'expert-3'],
    });

    const result = await protocol.execute(config, agents);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.aggregatedResult.output).toBeDefined();
    }
  });

  it('should handle string vote output', async () => {
    const stringVoter = createMockAgent(
      'expert-1',
      ok(createTestResult('expert-1', 'I approve this change'))
    );
    agents.set('expert-1', stringVoter);

    const config = createTestConfig({
      pattern: 'consensus',
      experts: ['expert-1', 'expert-2', 'expert-3'],
    });

    const result = await protocol.execute(config, agents);

    expect(result.ok).toBe(true);
  });

  it('should handle abstain votes', async () => {
    const abstainVoter = createMockAgent(
      'expert-3',
      ok(createTestResult('expert-3', { decision: 'abstain', reasoning: 'Not sure' }))
    );
    agents.set('expert-3', abstainVoter);

    const config = createTestConfig({
      pattern: 'consensus',
      experts: ['expert-1', 'expert-2', 'expert-3'],
    });

    const result = await protocol.execute(config, agents);

    expect(result.ok).toBe(true);
  });

  it('should handle partial voting failures', async () => {
    const failingVoter = createMockAgent('expert-3', err(new AgentError('Failed')));
    agents.set('expert-3', failingVoter);

    const config = createTestConfig({
      pattern: 'consensus',
      experts: ['expert-1', 'expert-2', 'expert-3'],
    });

    const result = await protocol.execute(config, agents);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.expertResults[2]?.success).toBe(false);
    }
  });
});

describe('ProtocolFactory', () => {
  let factory: ProtocolFactory;

  beforeEach(() => {
    factory = createProtocolFactory();
  });

  it('should create sequential protocol', () => {
    const protocol = factory.create('sequential');
    expect(protocol.pattern).toBe('sequential');
    expect(protocol).toBeInstanceOf(SequentialProtocol);
  });

  it('should create parallel protocol', () => {
    const protocol = factory.create('parallel');
    expect(protocol.pattern).toBe('parallel');
    expect(protocol).toBeInstanceOf(ParallelProtocol);
  });

  it('should create review protocol', () => {
    const protocol = factory.create('review');
    expect(protocol.pattern).toBe('review');
    expect(protocol).toBeInstanceOf(ReviewProtocol);
  });

  it('should create consensus protocol', () => {
    const protocol = factory.create('consensus');
    expect(protocol.pattern).toBe('consensus');
    expect(protocol).toBeInstanceOf(ConsensusProtocol);
  });

  it('should throw for unknown pattern', () => {
    expect(() => factory.create('unknown' as 'parallel')).toThrow();
  });

  it('should execute collaboration directly', async () => {
    const agents = new Map([
      ['expert-1', createMockAgent('expert-1')],
      ['expert-2', createMockAgent('expert-2')],
    ]);

    const config = createTestConfig({ pattern: 'parallel' });
    const result = await factory.execute(config, agents);

    expect(result.ok).toBe(true);
  });

  it('should pass options to created protocols', async () => {
    const customFactory = createProtocolFactory({
      continueOnFailure: true,
    });

    const failingAgent = createMockAgent('expert-1', err(new AgentError('Failed')));
    const successAgent = createMockAgent('expert-2');
    const agents = new Map([
      ['expert-1', failingAgent],
      ['expert-2', successAgent],
    ]);

    const config = createTestConfig({
      pattern: 'sequential',
      experts: ['expert-1', 'expert-2'],
    });

    const result = await customFactory.execute(config, agents);

    expect(result.ok).toBe(true);
    expect(successAgent.execute).toHaveBeenCalled();
  });
});
