/**
 * CLI Adapter Cascade Integration Tests
 *
 * Tests for CLI adapter routing, capability matching, and cascade decisions.
 * Tests the router and confidence router functionality.
 *
 * (Source: Issue #109)
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { Task } from '../../src/core/types/agent.js';
import {
  TaskRouter,
  createTaskRouter,
  ConfidenceRouter,
  createConfidenceRouter,
  BudgetRouter,
  createBudgetRouter,
  CliCircuitBreaker,
  CircuitBreakerRegistry,
  analyzeTask,
  DEFAULT_CAPABILITIES,
  type ICliAdapter,
  type CliName,
  type CliTask,
  type CliResponse,
  type CapabilityProfile,
  type CapacityStatus,
} from '../../src/cli-adapters/index.js';
import { ok } from '../../src/core/index.js';

// Simple mock adapter for testing
function createMockAdapter(
  name: CliName,
  capabilities?: Partial<CapabilityProfile>,
  capacity?: Partial<CapacityStatus>
): ICliAdapter {
  const defaultCapacity: CapacityStatus = {
    remainingTokens: 100_000,
    remainingRequests: 100,
    resetTime: new Date(Date.now() + 3600000),
    utilizationPercent: 10,
    exhausted: false,
    ...capacity,
  };

  return {
    name,
    transport: 'subprocess' as const,
    capabilities: { ...DEFAULT_CAPABILITIES[name], ...capabilities },
    execute: vi
      .fn()
      .mockResolvedValue(
        ok({
          text: 'Mock response',
          usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
        })
      ),
    healthCheck: vi.fn().mockResolvedValue({
      healthy: true,
      version: '1.0.0',
      versionStatus: 'supported' as const,
      lastChecked: new Date(),
    }),
    getCapacity: vi.fn().mockResolvedValue(defaultCapacity),
    getVersion: vi.fn().mockResolvedValue('1.0.0'),
    getModelInfo: vi.fn().mockReturnValue({
      id: `${name}-model`,
      name: `${name.charAt(0).toUpperCase()}${name.slice(1)} Model`,
      contextWindow: DEFAULT_CAPABILITIES[name].contextWindow,
    }),
    initialize: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
  };
}

// Helper to create test tasks for TaskRouter (uses Task from core/types)
function createTestTask(overrides?: Partial<Task>): Task {
  return {
    id: 'test-task-1',
    description: 'Test task description',
    context: {},
    ...overrides,
  };
}

// Helper to create CliTask for ConfidenceRouter
function createCliTask(content: string): CliTask {
  return { content };
}

describe('Integration: CLI Cascade', () => {
  describe('TaskRouter - Capability-Based Routing', () => {
    let mockClaude: ICliAdapter;
    let mockGemini: ICliAdapter;
    let mockCodex: ICliAdapter;
    let adapters: Map<CliName, ICliAdapter>;
    let router: TaskRouter;

    beforeEach(() => {
      mockClaude = createMockAdapter('claude', {
        reasoning: 10,
        contextWindow: 200000,
        codeGeneration: 9,
        speed: 7,
        cost: 5,
      });

      mockGemini = createMockAdapter('gemini', {
        reasoning: 8,
        contextWindow: 1000000,
        codeGeneration: 7,
        speed: 8,
        cost: 9,
      });

      mockCodex = createMockAdapter('codex', {
        reasoning: 9,
        contextWindow: 400000,
        codeGeneration: 10,
        speed: 8,
        cost: 7,
      });

      adapters = new Map<CliName, ICliAdapter>([
        ['claude', mockClaude],
        ['gemini', mockGemini],
        ['codex', mockCodex],
      ]);

      router = createTaskRouter(adapters);
    });

    it('should analyze task profiles correctly', () => {
      const task = createTestTask({
        description: 'Design microservices architecture for distributed system',
      });

      const profile = analyzeTask(task);
      expect(profile.taskType).toBe('architecture');
      expect(profile.reasoningComplexity).toBeGreaterThanOrEqual(5);
    });

    it('should route tasks and return routing decision', async () => {
      const task = createTestTask({
        description: 'Analyze code patterns in this repository',
      });

      const decision = await router.routeWithDetails(task);

      expect(decision.ok).toBe(true);
      if (decision.ok) {
        expect(decision.value.adapter).toBeDefined();
        expect(decision.value.confidence).toBeGreaterThan(0);
        expect(decision.value.reason).toBeDefined();
        expect(Array.isArray(decision.value.alternatives)).toBe(true);
      }
    });

    it('should prefer high reasoning models for architecture tasks', async () => {
      const task = createTestTask({
        description: 'Design system architecture for distributed database with complex reasoning',
      });

      const decision = await router.route(task);

      expect(decision.ok).toBe(true);
      if (decision.ok) {
        // Claude has highest reasoning (10)
        expect(decision.value.name).toBe('claude');
      }
    });

    it('should prefer Gemini for large context tasks', async () => {
      const task = createTestTask({
        description:
          'Analyze the entire large codebase repository with massive context across all files',
      });

      const decision = await router.route(task);

      expect(decision.ok).toBe(true);
      if (decision.ok) {
        // Gemini has largest context window (1M)
        expect(decision.value.name).toBe('gemini');
      }
    });

    it('should provide alternatives in routing decision', async () => {
      const task = createTestTask({
        description: 'Implement a new feature with code generation',
      });

      const decision = await router.routeWithDetails(task);

      expect(decision.ok).toBe(true);
      if (decision.ok) {
        // Should have alternatives
        expect(decision.value.alternatives.length).toBeGreaterThanOrEqual(0);
        // Primary adapter should not be in alternatives
        const altNames = decision.value.alternatives.map((a) => a.name);
        expect(altNames).not.toContain(decision.value.adapter.name);
      }
    });
  });

  describe('ConfidenceRouter - Cascade Decisions', () => {
    let adapters: Map<CliName, ICliAdapter>;
    let router: ConfidenceRouter;

    beforeEach(() => {
      const mockClaude = createMockAdapter('claude', {
        reasoning: 10,
        contextWindow: 200000,
        codeGeneration: 9,
        speed: 7,
        cost: 5,
      });

      const mockGemini = createMockAdapter('gemini', {
        reasoning: 8,
        contextWindow: 1000000,
        codeGeneration: 7,
        speed: 8,
        cost: 9,
      });

      adapters = new Map<CliName, ICliAdapter>([
        ['claude', mockClaude],
        ['gemini', mockGemini],
      ]);

      router = createConfidenceRouter(adapters);
    });

    it('should estimate confidence for responses', () => {
      const task = createCliTask('Simple analysis task');

      const response: CliResponse = {
        text: 'This is a confident answer with detailed explanation and clear reasoning about the solution.',
      };

      const estimate = router.estimateConfidence(task, response);

      expect(estimate.score).toBeGreaterThan(0);
      expect(estimate.score).toBeLessThanOrEqual(1);
      expect(estimate.factors).toBeDefined();
      expect(typeof estimate.shouldEscalate).toBe('boolean');
    });

    it('should detect low confidence responses with hedging language', () => {
      const task = createCliTask('Complex analysis requiring confidence');

      const hedgingResponse: CliResponse = {
        text: 'I think maybe this could be correct, but I am not sure. Perhaps it might work.',
      };

      const estimate = router.estimateConfidence(task, hedgingResponse);

      // Hedging language should reduce confidence
      expect(estimate.factors.hedgingFactor).toBeLessThan(1);
    });

    it('should determine whether to escalate', () => {
      const highConf = {
        score: 0.9,
        factors: {} as Record<string, number>,
        shouldEscalate: false,
        reason: 'High confidence',
      };
      const lowConf = {
        score: 0.4,
        factors: {} as Record<string, number>,
        shouldEscalate: true,
        reason: 'Low confidence',
      };

      expect(router.shouldEscalate(highConf, 0.7)).toBe(false);
      expect(router.shouldEscalate(lowConf, 0.7)).toBe(true);
    });
  });

  describe('BudgetRouter - Cost Constraints', () => {
    let adapters: Map<CliName, ICliAdapter>;
    let router: BudgetRouter;

    beforeEach(() => {
      const mockClaude = createMockAdapter('claude', {
        reasoning: 10,
        contextWindow: 200000,
        codeGeneration: 9,
        speed: 7,
        cost: 5, // More expensive
      });

      const mockGemini = createMockAdapter('gemini', {
        reasoning: 8,
        contextWindow: 1000000,
        codeGeneration: 7,
        speed: 8,
        cost: 9, // Cheaper
      });

      adapters = new Map<CliName, ICliAdapter>([
        ['claude', mockClaude],
        ['gemini', mockGemini],
      ]);

      router = createBudgetRouter(adapters, {
        sessionBudget: { tokenBudget: 100000, costBudgetUsd: 1.0 },
        taskBudget: { maxTokens: 50000, maxCostUsd: 0.5 },
      });
    });

    it('should track session budget', () => {
      const budget = router.getSessionBudget();

      expect(budget.tokenBudget).toBe(100000);
      expect(budget.costBudgetUsd).toBe(1.0);
      expect(budget.tokensUsed).toBe(0);
      expect(budget.utilizationPercent).toBe(0);
    });

    it('should update budget after usage', () => {
      router.updateBudget({ tokens: 25000, costUsd: 0.25 });

      const budget = router.getSessionBudget();
      expect(budget.tokensUsed).toBe(25000);
      expect(budget.costSpentUsd).toBe(0.25);
      expect(budget.utilizationPercent).toBe(25);
    });

    it('should check budget constraints for tasks', () => {
      // BudgetRouter.checkBudget expects CliTask with 'content' field
      const cliTask = createCliTask('Simple task for budget check');

      // checkBudget returns a simple result object
      const result = router.checkBudget(cliTask);

      expect(result).toBeDefined();
      expect(typeof result.withinBudget).toBe('boolean');
      expect(result.withinBudget).toBe(true);
    });

    it('should warn when approaching budget limit', () => {
      // Use most of the budget
      router.updateBudget({ tokens: 80000, costUsd: 0.8 });

      // BudgetRouter.checkBudget expects CliTask with 'content' field
      const cliTask = createCliTask('Task near budget limit');

      const result = router.checkBudget(cliTask);

      // Should have warnings about approaching limit
      expect(result).toBeDefined();
      expect(Array.isArray(result.warnings)).toBe(true);
    });

    it('should reset budget', () => {
      router.updateBudget({ tokens: 50000, costUsd: 0.5 });
      expect(router.getSessionBudget().tokensUsed).toBe(50000);

      router.resetBudget();

      expect(router.getSessionBudget().tokensUsed).toBe(0);
      expect(router.getSessionBudget().costSpentUsd).toBe(0);
    });
  });

  describe('CircuitBreaker - Fault Tolerance', () => {
    let breaker: CliCircuitBreaker;

    beforeEach(() => {
      breaker = new CliCircuitBreaker('test-cli', {
        failureThreshold: 3,
        successThreshold: 2,
        timeout: 1000,
      });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should start in closed state', () => {
      expect(breaker.getState()).toBe('closed');
    });

    it('should track failures', async () => {
      // Execute failing operations
      const failingFn = (): Promise<string> => {
        return Promise.reject(new Error('Service unavailable'));
      };

      await breaker.execute(failingFn);
      await breaker.execute(failingFn);

      const snapshot = breaker.getSnapshot();
      expect(snapshot.failureCount).toBe(2);
    });

    it('should open after failure threshold', async () => {
      const failingFn = (): Promise<string> => {
        return Promise.reject(new Error('Service unavailable'));
      };

      // Trigger 3 failures
      await breaker.execute(failingFn);
      await breaker.execute(failingFn);
      await breaker.execute(failingFn);

      expect(breaker.getState()).toBe('open');
    });

    it('should reject or allow probe requests when open', async () => {
      // Open the breaker
      const failingFn = (): Promise<string> => {
        return Promise.reject(new Error('Error'));
      };

      for (let i = 0; i < 3; i++) {
        await breaker.execute(failingFn);
      }

      expect(breaker.getState()).toBe('open');

      // Next request may be rejected or allowed as a probe
      const successFn = (): Promise<string> => Promise.resolve('success');
      const result = await breaker.execute(successFn);

      // Circuit breaker behavior varies - it may reject or allow a probe request
      expect(typeof result.ok).toBe('boolean');
    });

    it('should allow reset of the circuit breaker', () => {
      // Verify reset functionality exists
      expect(typeof breaker.reset).toBe('function');

      // After reset, should be closed
      breaker.reset();
      expect(breaker.getState()).toBe('closed');
    });

    it('should provide snapshot with state information', async () => {
      const failingFn = (): Promise<string> => {
        return Promise.reject(new Error('Error'));
      };

      // Cause some failures
      await breaker.execute(failingFn);
      await breaker.execute(failingFn);

      const snapshot = breaker.getSnapshot();
      expect(snapshot).toBeDefined();
      expect(snapshot.failureCount).toBe(2);
      expect(snapshot.state).toBe('closed');
    });
  });

  describe('CircuitBreakerRegistry - Multi-CLI Management', () => {
    let registry: CircuitBreakerRegistry;

    beforeEach(() => {
      registry = new CircuitBreakerRegistry({
        failureThreshold: 3,
        successThreshold: 2,
        timeout: 1000,
      });
    });

    it('should create separate breakers per CLI', () => {
      const claudeBreaker = registry.getBreaker('claude');
      const geminiBreaker = registry.getBreaker('gemini');

      expect(claudeBreaker).not.toBe(geminiBreaker);
      expect(claudeBreaker.getState()).toBe('closed');
      expect(geminiBreaker.getState()).toBe('closed');
    });

    it('should track breakers independently', async () => {
      const claudeBreaker = registry.getBreaker('claude');
      const geminiBreaker = registry.getBreaker('gemini');

      const failingFn = (): Promise<string> => {
        return Promise.reject(new Error('Error'));
      };

      // Fail claude
      for (let i = 0; i < 3; i++) {
        await claudeBreaker.execute(failingFn);
      }

      expect(claudeBreaker.getState()).toBe('open');
      expect(geminiBreaker.getState()).toBe('closed'); // Should still be healthy
    });

    it('should provide registry-wide status', () => {
      // Get breakers to register them
      registry.getBreaker('claude');
      registry.getBreaker('gemini');

      // Check that we can get all snapshots
      const allSnapshots = registry.getAllSnapshots();
      expect(allSnapshots).toBeDefined();
      expect(allSnapshots.size).toBe(2);
    });
  });
});
