/**
 * TRINITY Collaboration Protocol E2E Tests
 *
 * End-to-end tests for the TRINITY Thinker/Worker/Verifier pattern
 * from arXiv:2512.04695. Tests the full coordination flow.
 *
 * @module testing/e2e/agents/trinity-collaboration
 * (Source: Issue #314, arXiv:2512.04695)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createTrinityCoordinator,
  TRINITY_ROLE_PROMPTS,
  DEFAULT_TRINITY_CONFIG,
} from '../../../agents/collaboration/index.js';
import type { Task } from '../../../core/index.js';
import { measureLatency } from '../utils/index.js';
import { getGlobalEventBus, resetGlobalEventBus } from '../../../agents/collaboration/event-bus.js';
import type { DomainEvent } from '../../../agents/collaboration/event-bus-types.js';
import {
  createMockAgent,
  createTestTask,
  THINKER_SORT,
  WORKER_SORT,
  VERIFIER_PASS,
  VERIFIER_FAIL,
  THINKER_BUCKET,
  WORKER_BUCKET,
} from './trinity-fixtures.js';

describe('TRINITY Collaboration E2E Tests', () => {
  beforeEach(() => {
    resetGlobalEventBus();
  });

  describe('Thinker Role E2E', () => {
    it('should decompose complex tasks into structured analysis', async () => {
      const coordinator = createTrinityCoordinator();
      const agent = createMockAgent({ responses: [THINKER_SORT, WORKER_SORT, VERIFIER_PASS] });
      const result = await coordinator.execute({ task: createTestTask('Sort'), agent });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.thinkerOutput.problemAnalysis).toContain('sorting');
        expect(result.value.thinkerOutput.approach).toContain('quicksort');
        expect(result.value.thinkerOutput.considerations.length).toBeGreaterThan(0);
        expect(result.value.thinkerOutput.successCriteria.length).toBeGreaterThan(0);
      }
    });

    it('should produce reasoning output for rate limiter task', async () => {
      const coordinator = createTrinityCoordinator();
      const agent = createMockAgent({ responses: [THINKER_BUCKET, WORKER_BUCKET, VERIFIER_PASS] });
      const result = await coordinator.execute({ task: createTestTask('Rate limiter'), agent });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.thinkerOutput.problemAnalysis).toContain('token bucket');
      }
    });

    it('should use correct Thinker role prompt', async () => {
      const coordinator = createTrinityCoordinator();
      const agent = createMockAgent({ responses: [THINKER_SORT, WORKER_SORT, VERIFIER_PASS] });
      await coordinator.execute({ task: createTestTask('Task'), agent });

      const executeFn = agent.execute as ReturnType<typeof vi.fn>;
      const taskArg = executeFn.mock.calls[0]?.[0] as Task;
      expect(taskArg.description).toContain(TRINITY_ROLE_PROMPTS.thinker.slice(0, 50));
    });
  });

  describe('Worker Role E2E', () => {
    it('should execute tasks based on Thinker plan', async () => {
      const coordinator = createTrinityCoordinator();
      const agent = createMockAgent({ responses: [THINKER_SORT, WORKER_SORT, VERIFIER_PASS] });
      const result = await coordinator.execute({ task: createTestTask('Sort'), agent });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.workerOutput.implementation).toContain('quickSort');
        expect(result.value.workerOutput.stepsCompleted.length).toBeGreaterThan(0);
      }
    });

    it('should capture implementation results and deviations', async () => {
      const coordinator = createTrinityCoordinator();
      const agent = createMockAgent({ responses: [THINKER_BUCKET, WORKER_BUCKET, VERIFIER_PASS] });
      const result = await coordinator.execute({ task: createTestTask('Bucket'), agent });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.workerOutput.implementation).toContain('TokenBucket');
        expect(result.value.workerOutput.deviations.some((d) => d.includes('class'))).toBe(true);
      }
    });

    it('should receive Thinker context in task description', async () => {
      const coordinator = createTrinityCoordinator();
      const agent = createMockAgent({ responses: [THINKER_SORT, WORKER_SORT, VERIFIER_PASS] });
      await coordinator.execute({ task: createTestTask('Sort'), agent });

      const executeFn = agent.execute as ReturnType<typeof vi.fn>;
      const taskArg = executeFn.mock.calls[1]?.[0] as Task;
      expect(taskArg.description).toContain("Thinker's Analysis");
    });
  });

  describe('Verifier Role E2E', () => {
    it('should validate Worker output and return pass verdict', async () => {
      const coordinator = createTrinityCoordinator();
      const agent = createMockAgent({ responses: [THINKER_SORT, WORKER_SORT, VERIFIER_PASS] });
      const result = await coordinator.execute({ task: createTestTask('Sort'), agent });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.verifierOutput.verdict).toBe('pass');
        expect(result.value.success).toBe(true);
        expect(result.value.stopReason).toBe('verified');
      }
    });

    it('should detect issues and return fail verdict', async () => {
      const coordinator = createTrinityCoordinator({ maxIterations: 1 });
      const agent = createMockAgent({ responses: [THINKER_SORT, WORKER_SORT, VERIFIER_FAIL] });
      const result = await coordinator.execute({ task: createTestTask('Sort'), agent });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.verifierOutput.verdict).toBe('fail');
        expect(result.value.verifierOutput.issuesFound.length).toBeGreaterThan(0);
        expect(result.value.success).toBe(false);
      }
    });

    it('should receive full context including Worker output', async () => {
      const coordinator = createTrinityCoordinator();
      const agent = createMockAgent({ responses: [THINKER_SORT, WORKER_SORT, VERIFIER_PASS] });
      await coordinator.execute({ task: createTestTask('Verify'), agent });

      const executeFn = agent.execute as ReturnType<typeof vi.fn>;
      const taskArg = executeFn.mock.calls[2]?.[0] as Task;
      expect(taskArg.description).toContain('Worker Output');
      expect(taskArg.description).toContain('Success Criteria');
    });
  });

  describe('Full TRINITY Loop E2E', () => {
    it('should complete full loop: Thinker -> Worker -> Verifier -> result', async () => {
      const coordinator = createTrinityCoordinator();
      const agent = createMockAgent({ responses: [THINKER_SORT, WORKER_SORT, VERIFIER_PASS] });
      const { result, ms } = await measureLatency(() =>
        coordinator.execute({ task: createTestTask('Quicksort'), agent })
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.success).toBe(true);
        expect(result.value.iterations).toBe(1);
        expect(result.value.stopReason).toBe('verified');
        expect(result.value.totalDurationMs).toBeGreaterThan(0);
        expect(ms).toBeLessThan(5000);
      }
    });

    it('should iterate when Verifier rejects first attempt', async () => {
      const coordinator = createTrinityCoordinator({ maxIterations: 3 });
      const agent = createMockAgent({
        responses: [THINKER_SORT, WORKER_SORT, VERIFIER_FAIL, WORKER_SORT, VERIFIER_PASS],
      });
      const result = await coordinator.execute({ task: createTestTask('Retry'), agent });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.success).toBe(true);
        expect(result.value.iterations).toBe(2);
        expect(result.value.stopReason).toBe('verified');
      }
    });

    it('should pass previous feedback to Worker on retry', async () => {
      const coordinator = createTrinityCoordinator({ maxIterations: 3 });
      const agent = createMockAgent({
        responses: [THINKER_SORT, WORKER_SORT, VERIFIER_FAIL, WORKER_SORT, VERIFIER_PASS],
      });
      await coordinator.execute({ task: createTestTask('Feedback'), agent });

      const executeFn = agent.execute as ReturnType<typeof vi.fn>;
      const taskArg = executeFn.mock.calls[3]?.[0] as Task;
      expect(taskArg.description).toContain('Previous Attempt Feedback');
      expect(taskArg.description).toContain('Issues');
    });

    it('should stop after max iterations without success', async () => {
      const coordinator = createTrinityCoordinator({ maxIterations: 2 });
      const agent = createMockAgent({
        responses: [THINKER_SORT, WORKER_SORT, VERIFIER_FAIL, WORKER_SORT, VERIFIER_FAIL],
      });
      const result = await coordinator.execute({ task: createTestTask('No converge'), agent });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.success).toBe(false);
        expect(result.value.iterations).toBe(2);
        expect(result.value.stopReason).toBe('max_iterations');
      }
    });

    it('should record phase history when enabled', async () => {
      const coordinator = createTrinityCoordinator({ includeHistory: true });
      const agent = createMockAgent({ responses: [THINKER_SORT, WORKER_SORT, VERIFIER_PASS] });
      const result = await coordinator.execute({ task: createTestTask('History'), agent });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.history.length).toBe(3);
        expect(result.value.history[0]?.phase).toBe('thinking');
        expect(result.value.history[1]?.phase).toBe('working');
        expect(result.value.history[2]?.phase).toBe('verifying');
      }
    });

    it('should emit events throughout coordination lifecycle', async () => {
      const eventBus = getGlobalEventBus();
      const events: DomainEvent[] = [];
      eventBus.subscribe('protocol.*', (event) => {
        events.push(event);
      });

      const coordinator = createTrinityCoordinator();
      const agent = createMockAgent({ responses: [THINKER_SORT, WORKER_SORT, VERIFIER_PASS] });
      await coordinator.execute({ task: createTestTask('Events'), agent });

      expect(events.filter((e) => e.topic === 'protocol.started').length).toBeGreaterThanOrEqual(1);
      expect(events.filter((e) => e.topic === 'protocol.completed').length).toBeGreaterThanOrEqual(
        1
      );
    });
  });

  describe('Error Handling E2E', () => {
    it('should handle Thinker phase failure gracefully', async () => {
      const coordinator = createTrinityCoordinator();
      const agent = createMockAgent({ failOnCall: 0 });
      const result = await coordinator.execute({ task: createTestTask('Fail'), agent });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.message).toContain('Thinker phase failed');
    });

    it('should handle Worker phase failure gracefully', async () => {
      const coordinator = createTrinityCoordinator();
      const agent = createMockAgent({ responses: [THINKER_SORT], failOnCall: 1 });
      const result = await coordinator.execute({ task: createTestTask('Fail'), agent });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.message).toContain('Worker phase failed');
    });

    it('should handle Verifier phase failure gracefully', async () => {
      const coordinator = createTrinityCoordinator();
      const agent = createMockAgent({ responses: [THINKER_SORT, WORKER_SORT], failOnCall: 2 });
      const result = await coordinator.execute({ task: createTestTask('Fail'), agent });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.message).toContain('Verifier phase failed');
    });

    it('should handle malformed agent responses', async () => {
      const coordinator = createTrinityCoordinator();
      const agent = createMockAgent({
        responses: ['Random text', 'More text', 'Verdict: PASS'],
      });
      const result = await coordinator.execute({ task: createTestTask('Malformed'), agent });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.success).toBe(true);
        expect(result.value.thinkerOutput.problemAnalysis).toBeDefined();
      }
    });

    it('should handle cancellation request', async () => {
      const coordinator = createTrinityCoordinator({ maxIterations: 10 });
      const agent = createMockAgent({ responses: [THINKER_SORT, 'Working...'], delayMs: 10 });

      let callCount = 0;
      const originalExecute = agent.execute;
      agent.execute = vi.fn(async (task: Task) => {
        callCount++;
        if (callCount === 2) coordinator.cancel('User cancelled');
        return originalExecute(task);
      });

      const result = await coordinator.execute({ task: createTestTask('Cancel'), agent });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.stopReason).toBe('error');
    });
  });

  describe('Configuration E2E', () => {
    it('should respect custom maxIterations', async () => {
      const coordinator = createTrinityCoordinator({ maxIterations: 5 });
      const responses = [THINKER_SORT, ...Array<string>(10).fill(WORKER_SORT + VERIFIER_FAIL)];
      const agent = createMockAgent({ responses: responses.flat() });
      const result = await coordinator.execute({ task: createTestTask('Iter'), agent });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.iterations).toBe(5);
        expect(result.value.stopReason).toBe('max_iterations');
      }
    });

    it('should use default configuration values', () => {
      expect(createTrinityCoordinator()).toBeDefined();
      expect(DEFAULT_TRINITY_CONFIG.maxIterations).toBe(3);
      expect(DEFAULT_TRINITY_CONFIG.timeoutMs).toBe(5 * 60 * 1000);
      expect(DEFAULT_TRINITY_CONFIG.includeHistory).toBe(true);
    });

    it('should exclude history when configured', async () => {
      const coordinator = createTrinityCoordinator({ includeHistory: false });
      const agent = createMockAgent({ responses: [THINKER_SORT, WORKER_SORT, VERIFIER_PASS] });
      const result = await coordinator.execute({ task: createTestTask('No hist'), agent });

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.history.length).toBe(0);
    });
  });

  describe('Performance E2E', () => {
    it('should complete simple coordination under 1 second', async () => {
      const coordinator = createTrinityCoordinator();
      const agent = createMockAgent({ responses: [THINKER_SORT, WORKER_SORT, VERIFIER_PASS] });
      const { ms } = await measureLatency(() =>
        coordinator.execute({ task: createTestTask('Perf'), agent })
      );
      expect(ms).toBeLessThan(1000);
    });

    it('should track tokens used per phase', async () => {
      const coordinator = createTrinityCoordinator({ includeHistory: true });
      const agent = createMockAgent({ responses: [THINKER_SORT, WORKER_SORT, VERIFIER_PASS] });
      const result = await coordinator.execute({ task: createTestTask('Tokens'), agent });

      expect(result.ok).toBe(true);
      if (result.ok) {
        for (const phase of result.value.history) {
          expect(phase.tokensUsed).toBeGreaterThanOrEqual(0);
          expect(phase.durationMs).toBeGreaterThanOrEqual(0);
        }
      }
    });

    it('should handle multiple sequential executions', async () => {
      const coordinator = createTrinityCoordinator();
      const results = [];

      for (let i = 0; i < 3; i++) {
        const agent = createMockAgent({ responses: [THINKER_SORT, WORKER_SORT, VERIFIER_PASS] });
        results.push(await coordinator.execute({ task: createTestTask(`Seq${String(i)}`), agent }));
      }

      for (const result of results) {
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.value.success).toBe(true);
      }
    });
  });
});
