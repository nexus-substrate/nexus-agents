/**
 * nexus-agents/cli-adapters - Task Router Tests
 *
 * Unit tests for the capability-based task router.
 *
 * (Source: Issue #78 - Capability-based task router)
 */

/* eslint-disable @typescript-eslint/no-deprecated -- Testing deprecated analyzeTask, see Issue #574 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Task } from '../core/types/agent.js';
import type { ICliAdapter, CliName, CapacityStatus, CapabilityProfile } from './types.js';
import { DEFAULT_CAPABILITIES } from './types.js';
import { TaskRouter, createTaskRouter, RoutingError } from './router.js';
import { analyzeTask, summarizeProfile, type TaskProfile } from './task-analyzer.js';

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * Creates a mock CLI adapter for testing.
 */
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
    transport: 'subprocess',
    capabilities: { ...DEFAULT_CAPABILITIES[name], ...capabilities },
    execute: vi.fn().mockResolvedValue({ ok: true, value: { text: 'test' } }),
    healthCheck: vi.fn().mockResolvedValue({
      healthy: true,
      version: '1.0.0',
      versionStatus: 'supported',
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

/**
 * Creates a test task.
 */
function createTestTask(overrides?: Partial<Task>): Task {
  return {
    id: 'test-task-1',
    description: 'Test task description',
    context: {},
    ...overrides,
  };
}

// ============================================================================
// Task Analyzer Tests
// ============================================================================

describe('analyzeTask', () => {
  it('should classify architecture tasks correctly', () => {
    const task = createTestTask({
      description: 'Design the system architecture for a distributed microservice',
    });

    const profile = analyzeTask(task);

    expect(profile.taskType).toBe('architecture');
    expect(profile.reasoningComplexity).toBeGreaterThanOrEqual(7);
  });

  it('should classify code implementation tasks correctly', () => {
    const task = createTestTask({
      description: 'Implement a new authentication module with JWT support',
    });

    const profile = analyzeTask(task);

    expect(profile.taskType).toBe('code_implementation');
    expect(profile.codeGeneration).toBe(true);
  });

  it('should classify test generation tasks correctly', () => {
    const task = createTestTask({
      description: 'Write unit tests for the user service with vitest',
    });

    const profile = analyzeTask(task);

    expect(profile.taskType).toBe('test_generation');
    expect(profile.codeGeneration).toBe(true);
  });

  it('should classify code review tasks correctly', () => {
    const task = createTestTask({
      description: 'Review the pull request for security vulnerabilities and bugs',
    });

    const profile = analyzeTask(task);

    expect(profile.taskType).toBe('code_review');
    expect(profile.reasoningComplexity).toBeGreaterThanOrEqual(6);
  });

  it('should classify large codebase tasks correctly', () => {
    const task = createTestTask({
      description: 'Analyze the entire codebase repository with large context across all files',
    });

    const profile = analyzeTask(task);

    expect(profile.taskType).toBe('large_codebase');
  });

  it('should classify bulk operations tasks correctly', () => {
    const task = createTestTask({
      description: 'Bulk update all files in batch to rename and migrate multiple components',
    });

    const profile = analyzeTask(task);

    expect(profile.taskType).toBe('bulk_operations');
    expect(profile.parallelizable).toBe(true);
  });

  it('should detect multimodal content from keywords', () => {
    const task = createTestTask({
      description: 'Analyze this screenshot and implement the UI',
    });

    const profile = analyzeTask(task);

    expect(profile.multimodal).toBe(true);
  });

  it('should detect multimodal content from file extensions', () => {
    const task = createTestTask({
      description: 'Implement this design',
      context: { files: ['mockup.png', 'design.jpg'] },
    });

    const profile = analyzeTask(task);

    expect(profile.multimodal).toBe(true);
  });

  it('should detect budget sensitivity from keywords', () => {
    const task = createTestTask({
      description: 'Quick simple fix for this minor issue',
    });

    const profile = analyzeTask(task);

    expect(profile.budgetSensitive).toBe(true);
  });

  it('should detect budget sensitivity from low priority', () => {
    const task = createTestTask({
      description: 'Update the changelog',
      priority: 1,
    });

    const profile = analyzeTask(task);

    expect(profile.budgetSensitive).toBe(true);
  });

  it('should estimate context tokens based on task content', () => {
    const task = createTestTask({
      description: 'A'.repeat(1000), // 1000 chars
      context: {
        files: ['file1.ts', 'file2.ts', 'file3.ts'],
        history: [
          { role: 'user', content: 'Previous message', timestamp: new Date().toISOString() },
        ],
      },
    });

    const profile = analyzeTask(task);

    // Base (1000) + description (250) + files (1500) + history
    expect(profile.contextRequired).toBeGreaterThan(2500);
  });

  it('should calculate high complexity for complex tasks', () => {
    const task = createTestTask({
      description:
        'Optimize the complex concurrent algorithm to prevent race conditions and deadlocks in this distributed architecture',
    });

    const profile = analyzeTask(task);

    // Architecture tasks with complexity keywords should be 8+ (base 8 + keywords)
    expect(profile.reasoningComplexity).toBeGreaterThanOrEqual(8);
  });
});

describe('summarizeProfile', () => {
  it('should create readable summary', () => {
    const profile: TaskProfile = {
      contextRequired: 5000,
      reasoningComplexity: 7,
      codeGeneration: true,
      multimodal: false,
      parallelizable: true,
      budgetSensitive: false,
      taskType: 'code_implementation',
    };

    const summary = summarizeProfile(profile);

    expect(summary).toContain('code_implementation');
    expect(summary).toContain('5000 tokens');
    expect(summary).toContain('7/10');
    expect(summary).toContain('code-gen');
    expect(summary).toContain('parallel');
  });
});

// ============================================================================
// Task Router Tests
// ============================================================================

describe('TaskRouter', () => {
  let adapters: Map<CliName, ICliAdapter>;
  let claudeAdapter: ICliAdapter;
  let geminiAdapter: ICliAdapter;
  let codexAdapter: ICliAdapter;

  beforeEach(() => {
    claudeAdapter = createMockAdapter('claude');
    geminiAdapter = createMockAdapter('gemini');
    codexAdapter = createMockAdapter('codex');

    adapters = new Map<CliName, ICliAdapter>([
      ['claude', claudeAdapter],
      ['gemini', geminiAdapter],
      ['codex', codexAdapter],
    ]);
  });

  describe('route', () => {
    it('should route architecture tasks to Claude', async () => {
      const router = new TaskRouter(adapters);
      const task = createTestTask({
        description: 'Design the system architecture for a microservice',
      });

      const result = await router.route(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.name).toBe('claude');
      }
    });

    it('should route large codebase tasks to Gemini', async () => {
      const router = new TaskRouter(adapters);
      const task = createTestTask({
        description: 'Analyze the entire codebase and repository',
        context: {
          files: Array.from({ length: 100 }, (_, i) => 'file' + String(i) + '.ts'),
        },
      });

      const result = await router.route(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.name).toBe('gemini');
      }
    });

    it('should route code implementation tasks to Codex', async () => {
      const router = new TaskRouter(adapters);
      const task = createTestTask({
        description: 'Implement a new feature with function and class components',
      });

      const result = await router.route(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.name).toBe('codex');
      }
    });

    it('should route test generation tasks to Codex', async () => {
      const router = new TaskRouter(adapters);
      const task = createTestTask({
        description: 'Write unit tests for the user service',
      });

      const result = await router.route(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.name).toBe('codex');
      }
    });

    it('should route code review tasks to Claude', async () => {
      const router = new TaskRouter(adapters);
      const task = createTestTask({
        description: 'Review this code for security vulnerabilities',
      });

      const result = await router.route(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.name).toBe('claude');
      }
    });

    it('should route bulk operations to Gemini', async () => {
      const router = new TaskRouter(adapters);
      const task = createTestTask({
        description: 'Refactor all files to use new naming convention',
      });

      const result = await router.route(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.name).toBe('gemini');
      }
    });
  });

  describe('capacity filtering', () => {
    it('should filter out exhausted adapters', async () => {
      // Mark Claude as exhausted
      vi.mocked(claudeAdapter.getCapacity).mockResolvedValue({
        remainingTokens: 0,
        remainingRequests: 0,
        resetTime: new Date(),
        utilizationPercent: 100,
        exhausted: true,
      });

      const router = new TaskRouter(adapters);
      const task = createTestTask({
        description: 'Design system architecture',
      });

      const result = await router.route(task);

      // Should route to Gemini (second preference for architecture)
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.name).not.toBe('claude');
      }
    });

    it('should filter adapters below capacity threshold', async () => {
      // Set Claude utilization very high
      vi.mocked(claudeAdapter.getCapacity).mockResolvedValue({
        remainingTokens: 1000,
        remainingRequests: 5,
        resetTime: new Date(),
        utilizationPercent: 95,
        exhausted: false,
      });

      const router = new TaskRouter(adapters, { minCapacityThreshold: 0.1 });
      const task = createTestTask({
        description: 'Design system architecture',
      });

      const result = await router.route(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.name).not.toBe('claude');
      }
    });

    it('should filter adapters with insufficient context window', async () => {
      // Mock Codex with small context window
      const smallCodex = createMockAdapter('codex', { contextWindow: 1_000 });
      adapters.set('codex', smallCodex);

      const router = new TaskRouter(adapters);
      // Use a long description to exceed context window (SharedTaskAnalyzer ADR-0004)
      const task = createTestTask({
        description: 'A'.repeat(5000) + ' Implement a large feature with many components',
        context: {},
      });

      const result = await router.route(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Should not route to codex due to context limitations
        // Will likely route to gemini or claude
        expect(['claude', 'gemini']).toContain(result.value.name);
      }
    });

    it('should return error when no adapters available', async () => {
      // Mark all adapters as exhausted
      for (const adapter of adapters.values()) {
        vi.mocked(adapter.getCapacity).mockResolvedValue({
          remainingTokens: 0,
          remainingRequests: 0,
          resetTime: new Date(),
          utilizationPercent: 100,
          exhausted: true,
        });
      }

      const router = new TaskRouter(adapters);
      const task = createTestTask({ description: 'Any task' });

      const result = await router.route(task);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(RoutingError);
        expect(result.error.message).toContain('No adapters available');
      }
    });
  });

  describe('routeWithDetails', () => {
    it('should return routing decision with confidence and alternatives', async () => {
      const router = new TaskRouter(adapters);
      const task = createTestTask({
        description: 'Design system architecture for microservices',
      });

      const result = await router.routeWithDetails(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.adapter.name).toBe('claude');
        expect(result.value.confidence).toBeGreaterThan(0);
        expect(result.value.confidence).toBeLessThanOrEqual(1);
        expect(result.value.reason).toBeTruthy();
        expect(result.value.alternatives.length).toBeGreaterThan(0);
        expect(result.value.decisionTimeMs).toBeGreaterThanOrEqual(0);
      }
    });

    it('should include decision time metric', async () => {
      const router = new TaskRouter(adapters);
      const task = createTestTask({ description: 'Test task' });

      const result = await router.routeWithDetails(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.decisionTimeMs).toBeLessThan(100);
      }
    });
  });

  describe('configuration', () => {
    it('should prefer cost-efficient adapters when configured', async () => {
      const router = new TaskRouter(adapters, { preferCostEfficient: true });
      // Use bulk operations which naturally favors Gemini AND adds cost weight
      const task = createTestTask({
        description: 'Bulk process these files in batch for efficiency',
      });

      const result = await router.route(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Gemini is preferred for bulk ops AND is most cost efficient (9/10)
        expect(result.value.name).toBe('gemini');
      }
    });

    it('should use custom capacity threshold', async () => {
      // Set all adapters at 80% utilization
      for (const adapter of adapters.values()) {
        vi.mocked(adapter.getCapacity).mockResolvedValue({
          remainingTokens: 20_000,
          remainingRequests: 20,
          resetTime: new Date(),
          utilizationPercent: 80,
          exhausted: false,
        });
      }

      // With 30% threshold, 80% utilization should fail
      const strictRouter = new TaskRouter(adapters, { minCapacityThreshold: 0.3 });
      const task = createTestTask({ description: 'Test task' });

      const strictResult = await strictRouter.route(task);
      expect(strictResult.ok).toBe(false);

      // With 10% threshold, 80% utilization should pass
      const lenientRouter = new TaskRouter(adapters, { minCapacityThreshold: 0.1 });
      const lenientResult = await lenientRouter.route(task);
      expect(lenientResult.ok).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle capacity check failures gracefully', async () => {
      // Make Claude capacity check fail
      vi.mocked(claudeAdapter.getCapacity).mockRejectedValue(new Error('Network error'));

      const router = new TaskRouter(adapters);
      const task = createTestTask({
        description: 'Design architecture',
      });

      const result = await router.route(task);

      // Should still succeed by using other adapters
      expect(result.ok).toBe(true);
      if (result.ok) {
        // Claude should be excluded due to error (treated as exhausted)
        expect(result.value.name).not.toBe('claude');
      }
    });
  });
});

describe('createTaskRouter', () => {
  it('should create a router instance', () => {
    const adapters = new Map<CliName, ICliAdapter>([['claude', createMockAdapter('claude')]]);

    const router = createTaskRouter(adapters);

    expect(router).toBeDefined();
    expect(router.route).toBeDefined();
    expect(router.routeWithDetails).toBeDefined();
  });

  it('should pass configuration to router', async () => {
    const adapters = new Map<CliName, ICliAdapter>([
      ['claude', createMockAdapter('claude')],
      ['gemini', createMockAdapter('gemini')],
    ]);

    const router = createTaskRouter(adapters, { preferCostEfficient: true });
    // Use bulk ops task which naturally favors Gemini
    const task = createTestTask({ description: 'Bulk update files in batch' });

    const result = await router.route(task);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Gemini is more cost efficient AND preferred for bulk ops
      expect(result.value.name).toBe('gemini');
    }
  });
});
