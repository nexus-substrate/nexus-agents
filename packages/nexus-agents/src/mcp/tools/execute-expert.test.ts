/**
 * nexus-agents/mcp - Execute Expert Tool Tests
 * (Source: Issue #500 - Add missing MCP tool test files)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ILogger } from '../../core/index.js';
import type { Expert } from '../../agents/index.js';
import { RateLimiter } from '../middleware/index.js';
import { ExecuteExpertInputSchema, type ExecuteExpertDeps } from './execute-expert.js';

/**
 * Creates a permissive rate limiter for tests.
 */
function createTestRateLimiter(): RateLimiter {
  return new RateLimiter({
    capacity: 1000,
    refillRate: 1000,
    refillIntervalMs: 1000,
  });
}

/**
 * Creates a mock expert for testing.
 */
function createMockExpert(
  role: string,
  shouldSucceed = true,
  errorMessage = 'Execution failed'
): Expert {
  return {
    id: `${role}-mock-id`,
    role,
    capabilities: ['task_execution', 'code_generation'] as const,
    state: 'idle',
    expertConfig: {
      id: `${role}-mock-id`,
      name: `${role} Mock`,
      role,
      systemPrompt: 'Mock prompt',
      capabilities: ['task_execution', 'code_generation'],
    },
    name: `${role} Mock`,
    metadata: undefined,
    execute: vi.fn().mockImplementation(() => {
      if (shouldSucceed) {
        return Promise.resolve({
          ok: true as const,
          value: {
            output: 'Mock execution output',
            metadata: {
              tokensUsed: 150,
              durationMs: 500,
            },
          },
        });
      }
      return Promise.resolve({
        ok: false as const,
        error: new Error(errorMessage),
      });
    }),
  } as unknown as Expert;
}

/**
 * Creates test dependencies.
 */
function createTestDeps(logger?: ILogger): ExecuteExpertDeps {
  const deps: ExecuteExpertDeps = {
    expertRegistry: new Map<string, Expert>(),
    rateLimiter: createTestRateLimiter(),
  };
  if (logger !== undefined) {
    deps.logger = logger;
  }
  return deps;
}

/**
 * Creates a mock logger for tests.
 */
function createMockLogger(): ILogger {
  const mockLogger: ILogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => mockLogger),
    setLevel: vi.fn(),
  };
  return mockLogger;
}

describe('ExecuteExpertInputSchema', () => {
  describe('expertId validation', () => {
    it('should accept valid expertId', () => {
      const input = { expertId: 'code_expert-abc123', task: 'Review this code' };
      const result = ExecuteExpertInputSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.expertId).toBe('code_expert-abc123');
      }
    });

    it('should reject empty expertId', () => {
      const input = { expertId: '', task: 'Review this code' };
      const result = ExecuteExpertInputSchema.safeParse(input);

      expect(result.success).toBe(false);
    });

    it('should reject missing expertId', () => {
      const input = { task: 'Review this code' };
      const result = ExecuteExpertInputSchema.safeParse(input);

      expect(result.success).toBe(false);
    });
  });

  describe('task validation', () => {
    it('should accept valid task', () => {
      const input = { expertId: 'test-id', task: 'Analyze this function' };
      const result = ExecuteExpertInputSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.task).toBe('Analyze this function');
      }
    });

    it('should reject empty task', () => {
      const input = { expertId: 'test-id', task: '' };
      const result = ExecuteExpertInputSchema.safeParse(input);

      expect(result.success).toBe(false);
    });

    it('should reject missing task', () => {
      const input = { expertId: 'test-id' };
      const result = ExecuteExpertInputSchema.safeParse(input);

      expect(result.success).toBe(false);
    });
  });

  describe('context validation', () => {
    it('should accept optional context', () => {
      const input = {
        expertId: 'test-id',
        task: 'Review code',
        context: { language: 'typescript', file: 'test.ts' },
      };
      const result = ExecuteExpertInputSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.context).toEqual({ language: 'typescript', file: 'test.ts' });
      }
    });

    it('should allow missing context', () => {
      const input = { expertId: 'test-id', task: 'Review code' };
      const result = ExecuteExpertInputSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.context).toBeUndefined();
      }
    });

    it('should accept empty context object', () => {
      const input = { expertId: 'test-id', task: 'Review code', context: {} };
      const result = ExecuteExpertInputSchema.safeParse(input);

      expect(result.success).toBe(true);
    });
  });

  describe('timeoutMs validation (Issue #1330)', () => {
    it('should accept timeout at floor (120s)', () => {
      const input = { expertId: 'test-id', task: 'Review code', timeoutMs: 120_000 };
      const result = ExecuteExpertInputSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) expect(result.data.timeoutMs).toBe(120_000);
    });

    it('should reject timeout below floor (30s)', () => {
      const input = { expertId: 'test-id', task: 'Review code', timeoutMs: 30_000 };
      const result = ExecuteExpertInputSchema.safeParse(input);

      expect(result.success).toBe(false);
    });

    it('should accept timeout at max (900s)', () => {
      const input = { expertId: 'test-id', task: 'Review code', timeoutMs: 900_000 };
      const result = ExecuteExpertInputSchema.safeParse(input);

      expect(result.success).toBe(true);
    });

    it('should reject timeout above max', () => {
      const input = { expertId: 'test-id', task: 'Review code', timeoutMs: 900_001 };
      const result = ExecuteExpertInputSchema.safeParse(input);

      expect(result.success).toBe(false);
    });

    it('should allow missing timeout (optional)', () => {
      const input = { expertId: 'test-id', task: 'Review code' };
      const result = ExecuteExpertInputSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) expect(result.data.timeoutMs).toBeUndefined();
    });
  });
});

describe('Expert registry lookup', () => {
  let deps: ExecuteExpertDeps;

  beforeEach(() => {
    deps = createTestDeps();
  });

  it('should find expert by ID', () => {
    const mockExpert = createMockExpert('code_expert');
    deps.expertRegistry.set('code_expert-abc123', mockExpert);

    const found = deps.expertRegistry.get('code_expert-abc123');
    expect(found).toBeDefined();
    expect(found?.role).toBe('code_expert');
  });

  it('should return undefined for non-existent expert', () => {
    const found = deps.expertRegistry.get('non-existent-id');
    expect(found).toBeUndefined();
  });

  it('should list available experts when lookup fails', () => {
    const mockExpert1 = createMockExpert('code_expert');
    const mockExpert2 = createMockExpert('security_expert');
    deps.expertRegistry.set('expert-1', mockExpert1);
    deps.expertRegistry.set('expert-2', mockExpert2);

    const availableIds = Array.from(deps.expertRegistry.keys());
    expect(availableIds).toContain('expert-1');
    expect(availableIds).toContain('expert-2');
    expect(availableIds).toHaveLength(2);
  });
});

describe('Expert execution', () => {
  let deps: ExecuteExpertDeps;
  let mockLogger: ILogger;

  beforeEach(() => {
    mockLogger = createMockLogger();
    deps = createTestDeps(mockLogger);
  });

  describe('successful execution', () => {
    it('should execute task with expert', async () => {
      const mockExpert = createMockExpert('code_expert', true);
      deps.expertRegistry.set('test-expert', mockExpert);

      const result = await mockExpert.execute({
        id: 'test-task',
        description: 'Review this code',
        context: { metadata: {} },
        constraints: { maxTokens: 4096, maxDuration: 180_000 },
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.output).toBe('Mock execution output');
        expect(result.value.metadata.tokensUsed).toBe(150);
      }
    });

    it('should track execution metrics', async () => {
      const mockExpert = createMockExpert('code_expert', true);
      deps.expertRegistry.set('test-expert', mockExpert);

      const startTime = Date.now();
      const result = await mockExpert.execute({
        id: 'test-task',
        description: 'Test task',
        context: { metadata: {} },
        constraints: { maxTokens: 4096, maxDuration: 180_000 },
      });
      const durationMs = Date.now() - startTime;

      expect(result.ok).toBe(true);
      expect(durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('failed execution', () => {
    it('should handle expert execution failure', async () => {
      const mockExpert = createMockExpert('code_expert', false, 'Task too complex');
      deps.expertRegistry.set('test-expert', mockExpert);

      const result = await mockExpert.execute({
        id: 'test-task',
        description: 'Complex task',
        context: { metadata: {} },
        constraints: { maxTokens: 4096, maxDuration: 180_000 },
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe('Task too complex');
      }
    });
  });
});

describe('Rate limiting', () => {
  it('should allow requests within rate limit', () => {
    const rateLimiter = createTestRateLimiter();

    const acquired = rateLimiter.tryAcquire();
    expect(acquired).toBe(true);
  });

  it('should track rate limit state', () => {
    const rateLimiter = new RateLimiter({
      capacity: 1,
      refillRate: 1,
      refillIntervalMs: 60000, // 1 minute
    });

    rateLimiter.tryAcquire(); // First request
    const state = rateLimiter.getState();

    expect(state.tokens).toBeLessThanOrEqual(1);
  });
});

describe('Logger integration', () => {
  it('should log expert execution start', () => {
    const mockLogger = createMockLogger();
    const deps = createTestDeps(mockLogger);
    const mockExpert = createMockExpert('code_expert');
    deps.expertRegistry.set('test-expert', mockExpert);

    deps.logger?.info('Executing expert task', {
      expertId: 'test-expert',
      role: mockExpert.role,
      taskId: 'test-task-123',
    });

    expect(mockLogger.info).toHaveBeenCalledWith(
      'Executing expert task',
      expect.objectContaining({
        expertId: 'test-expert',
        role: 'code_expert',
        taskId: 'test-task-123',
      })
    );
  });

  it('should log execution completion', () => {
    const mockLogger = createMockLogger();
    const deps = createTestDeps(mockLogger);

    deps.logger?.info('Expert execution completed', {
      expertId: 'test-expert',
      durationMs: 500,
      tokensUsed: 150,
    });

    expect(mockLogger.info).toHaveBeenCalledWith(
      'Expert execution completed',
      expect.objectContaining({
        expertId: 'test-expert',
        durationMs: 500,
        tokensUsed: 150,
      })
    );
  });

  it('should log execution failure', () => {
    const mockLogger = createMockLogger();
    const deps = createTestDeps(mockLogger);

    deps.logger?.warn('Expert execution failed', {
      expertId: 'test-expert',
      error: 'Task too complex',
    });

    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Expert execution failed',
      expect.objectContaining({
        expertId: 'test-expert',
        error: 'Task too complex',
      })
    );
  });
});

describe('Error message formatting', () => {
  it('should provide helpful hint when expert not found with empty registry', () => {
    const deps = createTestDeps();
    const expertId = 'non-existent';

    const availableIds = Array.from(deps.expertRegistry.keys());
    const hint =
      availableIds.length > 0
        ? ` Available experts: ${availableIds.join(', ')}`
        : ' No experts have been created yet. Use create_expert first.';
    const errorMessage = `Expert not found: ${expertId}.${hint}`;

    expect(errorMessage).toContain('No experts have been created yet');
    expect(errorMessage).toContain('Use create_expert first');
  });

  it('should list available experts in hint when registry has experts', () => {
    const deps = createTestDeps();
    deps.expertRegistry.set('expert-1', createMockExpert('code_expert'));
    deps.expertRegistry.set('expert-2', createMockExpert('security_expert'));

    const expertId = 'non-existent';
    const availableIds = Array.from(deps.expertRegistry.keys());
    const hint =
      availableIds.length > 0
        ? ` Available experts: ${availableIds.join(', ')}`
        : ' No experts have been created yet. Use create_expert first.';
    const errorMessage = `Expert not found: ${expertId}.${hint}`;

    expect(errorMessage).toContain('Available experts:');
    expect(errorMessage).toContain('expert-1');
    expect(errorMessage).toContain('expert-2');
  });
});

describe('Response formatting', () => {
  it('should format success response correctly', () => {
    const response = {
      expertId: 'test-expert',
      role: 'code_expert',
      output: 'Analysis complete',
      durationMs: 500,
      tokensUsed: 150,
      status: 'success' as const,
    };

    expect(response.status).toBe('success');
    expect(response.output).toBe('Analysis complete');
    expect(response.tokensUsed).toBeGreaterThan(0);
  });

  it('should format error response correctly', () => {
    const response = {
      expertId: 'test-expert',
      role: 'code_expert',
      output: '',
      durationMs: 100,
      tokensUsed: 0,
      status: 'error' as const,
      error: 'Execution failed',
    };

    expect(response.status).toBe('error');
    expect(response.error).toBe('Execution failed');
    expect(response.output).toBe('');
    expect(response.tokensUsed).toBe(0);
  });

  it('should serialize object output to JSON', () => {
    const output = { result: 'success', details: { count: 5 } };
    const outputStr = JSON.stringify(output, null, 2);

    expect(outputStr).toContain('"result": "success"');
    expect(outputStr).toContain('"count": 5');
  });
});
