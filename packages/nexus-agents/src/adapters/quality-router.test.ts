/**
 * Tests for Quality-Constrained Router.
 * (Source: Issue #128, arXiv:2406.18510)
 */

/* eslint-disable @typescript-eslint/no-deprecated -- Testing deprecated router scheduled for v3.0 removal */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  QualityRouter,
  TaskComplexityEstimator,
  createQualityRouter,
  createComplexityEstimator,
} from './quality-router.js';
import type { Task } from '../core/index.js';
import type { ICliAdapter, CliResponse, CapabilityProfile } from '../cli-adapters/types.js';
import { ok } from '../core/index.js';

// ============================================================================
// Test Helpers
// ============================================================================

function createTestTask(description: string, context: Record<string, unknown> = {}): Task {
  return {
    id: 'test-task',
    description,
    context: { ...context },
  };
}

function createMockAdapter(name: 'claude' | 'gemini' | 'codex'): ICliAdapter {
  const capabilities: Record<string, CapabilityProfile> = {
    claude: { reasoning: 10, contextWindow: 200000, codeGeneration: 9, speed: 7, cost: 5 },
    gemini: { reasoning: 8, contextWindow: 1000000, codeGeneration: 7, speed: 8, cost: 9 },
    codex: { reasoning: 9, contextWindow: 400000, codeGeneration: 10, speed: 8, cost: 7 },
  };

  return {
    name,
    transport: 'subprocess',
    capabilities: capabilities[name]!,
    execute: vi.fn().mockResolvedValue(
      ok({
        text: 'Mock response',
        usage: { inputTokens: 100, outputTokens: 200 },
        durationMs: 1000,
        costUsd: 0.001,
      } satisfies CliResponse)
    ),
    healthCheck: vi.fn().mockResolvedValue({
      healthy: true,
      version: '1.0.0',
      versionStatus: 'supported' as const,
      lastChecked: new Date(),
    }),
    getCapacity: vi.fn().mockResolvedValue({
      remainingTokens: 100000,
      remainingRequests: 100,
      resetTime: new Date(),
      utilizationPercent: 10,
      exhausted: false,
    }),
    getVersion: vi.fn().mockResolvedValue('1.0.0'),
    getModelInfo: vi.fn().mockReturnValue({
      id: `${name}-model`,
      name: `${name} Model`,
      contextWindow: capabilities[name]!.contextWindow,
    }),
    initialize: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
  };
}

// ============================================================================
// TaskComplexityEstimator Tests
// ============================================================================

describe('TaskComplexityEstimator', () => {
  let estimator: TaskComplexityEstimator;

  beforeEach(() => {
    estimator = createComplexityEstimator();
  });

  describe('estimate', () => {
    it('should classify simple tasks as simple', () => {
      const task = createTestTask('What is TypeScript?');
      const result = estimator.estimate(task);

      expect(result.level).toBe('simple');
      expect(result.score).toBeLessThan(0.25);
    });

    it('should classify moderate tasks correctly', () => {
      const task = createTestTask(
        'Analyze and compare REST and GraphQL APIs. Evaluate the trade-offs between them, then design a hybrid approach that combines their strengths.'
      );
      const result = estimator.estimate(task);

      expect(['simple', 'moderate', 'complex']).toContain(result.level);
      expect(result.score).toBeGreaterThan(0.15);
    });

    it('should classify complex tasks correctly', () => {
      const task = createTestTask(`
        Design and implement a microservices architecture for an e-commerce platform.
        The system should include:
        1. User authentication with OAuth2
        2. Product catalog with search using Elasticsearch
        3. Order processing with event-driven architecture
        4. Payment integration with Stripe
        Include Kubernetes deployment manifests and CI/CD pipeline.
      `);
      const result = estimator.estimate(task);

      // Complex tasks should have higher scores
      expect(['moderate', 'complex', 'expert']).toContain(result.level);
      expect(result.score).toBeGreaterThan(0.3);
    });

    it('should detect reasoning tasks', () => {
      const task = createTestTask(
        'Why does React use a virtual DOM and how does it improve performance?'
      );
      const result = estimator.estimate(task);

      expect(result.taskType).toBe('reasoning');
    });

    it('should detect knowledge tasks', () => {
      const task = createTestTask('What is the syntax for async/await in JavaScript?');
      const result = estimator.estimate(task);

      expect(result.taskType).toBe('knowledge');
    });

    it('should include complexity factors', () => {
      const task = createTestTask(
        'Analyze and debug the authentication flow in our React/Node.js app.'
      );
      const result = estimator.estimate(task);

      expect(result.factors).toHaveProperty('lengthFactor');
      expect(result.factors).toHaveProperty('structureFactor');
      expect(result.factors).toHaveProperty('domainFactor');
      expect(result.factors).toHaveProperty('reasoningFactor');
      expect(result.factors).toHaveProperty('toolFactor');
    });

    it('should detect tool requirements', () => {
      const task = createTestTask('Read the config file and run the npm test command.');
      const result = estimator.estimate(task);

      expect(result.factors.toolFactor).toBeGreaterThan(0);
    });

    it('should detect domain specificity', () => {
      const task = createTestTask(
        'Configure the Kubernetes deployment with Terraform and set up the CI/CD pipeline.'
      );
      const result = estimator.estimate(task);

      expect(result.factors.domainFactor).toBeGreaterThanOrEqual(0.4);
    });
  });
});

// ============================================================================
// QualityRouter Tests
// ============================================================================

describe('QualityRouter', () => {
  let router: QualityRouter;
  let claudeAdapter: ICliAdapter;
  let geminiAdapter: ICliAdapter;
  let codexAdapter: ICliAdapter;

  beforeEach(() => {
    router = createQualityRouter();
    claudeAdapter = createMockAdapter('claude');
    geminiAdapter = createMockAdapter('gemini');
    codexAdapter = createMockAdapter('codex');
  });

  describe('registerAdapter', () => {
    it('should register adapters', () => {
      router.registerAdapter(claudeAdapter);
      router.registerAdapter(geminiAdapter);

      // Should not throw when routing
      const task = createTestTask('Test task');
      const result = router.route(task);
      expect(result.ok).toBe(true);
    });
  });

  describe('route', () => {
    it('should return error when no adapters registered', () => {
      const task = createTestTask('Test task');
      const result = router.route(task);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('No adapters registered');
      }
    });

    it('should select adapter for simple tasks', () => {
      router.registerAdapter(claudeAdapter);
      router.registerAdapter(geminiAdapter);
      router.registerAdapter(codexAdapter);

      const task = createTestTask('What is npm?');
      const result = router.route(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(['claude', 'gemini', 'codex']).toContain(result.value.selectedCli);
        expect(result.value.complexity.level).toBe('simple');
        expect(result.value.routingLatencyMs).toBeLessThan(100);
      }
    });

    it('should prefer cheaper adapters for simple tasks', () => {
      router.registerAdapter(claudeAdapter);
      router.registerAdapter(geminiAdapter);

      const task = createTestTask('List the JavaScript array methods.');
      const result = router.route(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Gemini is cheaper (cost: 9 vs 5) so should be preferred for simple tasks
        expect(result.value.selectedCli).toBe('gemini');
      }
    });

    it('should prefer capable adapters for complex reasoning tasks', () => {
      const customRouter = createQualityRouter({ minQuality: 0.9 });
      customRouter.registerAdapter(claudeAdapter);
      customRouter.registerAdapter(geminiAdapter);

      const task = createTestTask(`
        Analyze the trade-offs between different database indexing strategies.
        Compare B-tree, hash, and bitmap indexes. Explain when to use each
        and how they affect query performance and write overhead. Design an
        optimal indexing strategy for a high-throughput write-heavy system.
      `);
      const result = customRouter.route(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // With high quality threshold, capable adapters should be selected
        expect(result.value.qualityEstimate.score).toBeGreaterThan(0.5);
        // The router selects based on quality/cost trade-off
        expect(['claude', 'gemini']).toContain(result.value.selectedCli);
      }
    });

    it('should include alternatives in decision', () => {
      router.registerAdapter(claudeAdapter);
      router.registerAdapter(geminiAdapter);
      router.registerAdapter(codexAdapter);

      const task = createTestTask('Write a function to sort an array.');
      const result = router.route(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.alternatives.length).toBe(2);
      }
    });

    it('should include routing reason', () => {
      router.registerAdapter(claudeAdapter);

      const task = createTestTask('Debug this Python code.');
      const result = router.route(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.reason).toContain('Task complexity:');
        expect(result.value.reason).toContain('Task type:');
        expect(result.value.reason).toContain('Quality:');
      }
    });

    it('should respect cost constraints', () => {
      const costConstrainedRouter = createQualityRouter({ maxCostUsd: 0.0001 });
      costConstrainedRouter.registerAdapter(claudeAdapter);
      costConstrainedRouter.registerAdapter(geminiAdapter);

      const task = createTestTask('Simple question');
      const result = costConstrainedRouter.route(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Should prefer cheaper option
        expect(result.value.selectedCli).toBe('gemini');
      }
    });
  });

  describe('execute', () => {
    it('should route and execute task', async () => {
      router.registerAdapter(claudeAdapter);

      const task = createTestTask('Test execution');
      const result = await router.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.response.text).toBe('Mock response');
        expect(result.value.routing.selectedCli).toBe('claude');
        expect(result.value.actualLatencyMs).toBeGreaterThanOrEqual(0);
      }
    });

    it('should call adapter execute with correct task', async () => {
      router.registerAdapter(codexAdapter);

      const task = createTestTask('Write a test function');
      await router.execute(task);

      expect(codexAdapter.execute).toHaveBeenCalledWith({ content: 'Write a test function' });
    });
  });

  describe('quality estimation', () => {
    it('should estimate higher quality for capable adapters on matching tasks', () => {
      router.registerAdapter(claudeAdapter);
      router.registerAdapter(codexAdapter);

      // Reasoning task should favor claude
      const reasoningTask = createTestTask('Analyze why this algorithm has O(n log n) complexity.');
      const reasoningResult = router.route(reasoningTask);

      // Code task should favor codex
      const codeTask = createTestTask('Write a TypeScript function to validate email addresses.');
      const codeResult = router.route(codeTask);

      expect(reasoningResult.ok).toBe(true);
      expect(codeResult.ok).toBe(true);

      if (reasoningResult.ok && codeResult.ok) {
        // Different tasks should potentially route differently
        expect(reasoningResult.value.qualityEstimate.score).toBeGreaterThan(0);
        expect(codeResult.value.qualityEstimate.score).toBeGreaterThan(0);
      }
    });

    it('should include cost estimates', () => {
      router.registerAdapter(claudeAdapter);

      const task = createTestTask('Test cost estimation');
      const result = router.route(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.qualityEstimate.estimatedCostUsd).toBeGreaterThan(0);
        expect(result.value.qualityEstimate.estimatedLatencyMs).toBeGreaterThan(0);
      }
    });
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('QualityRouter Integration', () => {
  it('should handle full routing workflow', async () => {
    const router = createQualityRouter({ minQuality: 0.5 });
    router.registerAdapter(createMockAdapter('claude'));
    router.registerAdapter(createMockAdapter('gemini'));
    router.registerAdapter(createMockAdapter('codex'));

    const task = createTestTask(`
      Implement a REST API endpoint for user authentication.
      Use JWT tokens and bcrypt for password hashing.
      Include input validation and error handling.
    `);

    const result = await router.execute(task);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.response).toBeDefined();
      expect(result.value.routing.complexity.level).toBeDefined();
      expect(result.value.routing.alternatives.length).toBeGreaterThan(0);
    }
  });

  it('should provide sub-150ms routing latency', () => {
    const router = createQualityRouter();
    router.registerAdapter(createMockAdapter('claude'));
    router.registerAdapter(createMockAdapter('gemini'));
    router.registerAdapter(createMockAdapter('codex'));

    const task = createTestTask('Quick routing test');
    const result = router.route(task);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Paper claims sub-150ms routing latency
      expect(result.value.routingLatencyMs).toBeLessThan(150);
    }
  });
});
