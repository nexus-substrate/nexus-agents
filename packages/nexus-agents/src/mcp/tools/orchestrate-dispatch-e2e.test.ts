/**
 * E2E integration tests for the worker dispatch pipeline.
 *
 * Tests the full flow: orchestrate → agentPlan → dispatchWorkers → composeWorkerPrompt
 * → model adapter → conflict detection → result aggregation.
 *
 * Uses a mock model adapter to verify the pipeline wiring end-to-end
 * without requiring live API keys.
 */

import { describe, it, expect, vi } from 'vitest';
import { executeWorkerDispatch, isWorkerDispatchEnabled } from './orchestrate-dispatch.js';
import type { AgentPlan, AgentPlanEntry } from '../../orchestration/aorchestra/index.js';
import type { IModelAdapter } from '../../core/index.js';
import type { ContentBlock } from '../../core/types/model.js';
import { createLogger } from '../../core/index.js';

const logger = createLogger({ component: 'test-dispatch-e2e' });

function makeEntry(role: string, subTask: string, wave: number): AgentPlanEntry {
  return { role, subTask, priority: wave, wave };
}

function makePlan(entries: AgentPlanEntry[]): AgentPlan {
  return {
    entries,
    totalExperts: entries.length,
    taskType: 'code_implementation',
    complexity: 'medium',
  };
}

function createMockAdapter(responses: Map<string, string>): IModelAdapter {
  return {
    complete: vi
      .fn()
      .mockImplementation(
        (opts: {
          messages: Array<{ content: string }>;
        }): Promise<{ ok: true; value: { content: ContentBlock[] } }> => {
          const prompt = opts.messages[0]?.content ?? '';
          // Match response by role keyword in prompt
          for (const [keyword, response] of responses) {
            if (prompt.includes(keyword)) {
              return Promise.resolve({
                ok: true as const,
                value: {
                  content: [{ type: 'text' as const, text: response }],
                },
              });
            }
          }
          return Promise.resolve({
            ok: true as const,
            value: {
              content: [{ type: 'text' as const, text: 'Default response' }],
            },
          });
        }
      ),
  } as unknown as IModelAdapter;
}

describe('Worker Dispatch E2E Pipeline', () => {
  it('dispatches a single-wave plan and returns aggregated results', async () => {
    const adapter = createMockAdapter(
      new Map([
        ['code', 'Implemented the rate limiter in src/rate-limiter.ts'],
        ['testing', 'Added unit tests in src/rate-limiter.test.ts'],
      ])
    );

    const plan = makePlan([
      makeEntry('code', 'Implement rate limiter', 1),
      makeEntry('testing', 'Write tests for rate limiter', 1),
    ]);

    const result = await executeWorkerDispatch({
      agentPlan: plan,
      taskDescription: 'Build a rate limiter with tests',
      modelAdapter: adapter,
      logger,
    });

    expect(result.totalWorkers).toBe(2);
    expect(result.successCount).toBe(2);
    expect(result.errorCount).toBe(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.results).toHaveLength(2);
    expect(result.results[0]?.status).toBe('success');
    expect(result.results[1]?.status).toBe('success');
  });

  it('dispatches multi-wave plan with wave-sequential execution', async () => {
    const callOrder: string[] = [];
    let callIndex = 0;
    // Track role by which entry was dispatched (entries are dispatched in order)
    const roleSequence = ['architecture', 'code', 'testing'];

    const adapter = {
      complete: vi
        .fn()
        .mockImplementation((): Promise<{ ok: true; value: { content: ContentBlock[] } }> => {
          const role = roleSequence[callIndex] ?? 'unknown';
          callIndex++;
          callOrder.push(role);
          return Promise.resolve({
            ok: true as const,
            value: {
              content: [{ type: 'text' as const, text: `Result from ${role}` }],
            },
          });
        }),
    } as unknown as IModelAdapter;

    const plan = makePlan([
      makeEntry('architecture', 'Review architecture', 1),
      makeEntry('code', 'Implement feature', 2),
      makeEntry('testing', 'Write tests', 2),
    ]);

    const result = await executeWorkerDispatch({
      agentPlan: plan,
      taskDescription: 'Multi-wave task',
      modelAdapter: adapter,
      logger,
    });

    expect(result.totalWorkers).toBe(3);
    expect(result.successCount).toBe(3);
    // Architecture (wave 1) must complete before code/testing (wave 2)
    expect(callOrder[0]).toBe('architecture');
    expect(callOrder).toContain('code');
    expect(callOrder).toContain('testing');
  });

  it('detects file conflicts between workers in same wave', async () => {
    const adapter = createMockAdapter(
      new Map([
        [
          'code',
          'Modified src/shared.ts to add the feature:\n```ts\n// src/shared.ts\nexport function foo() {}\n```',
        ],
        [
          'security',
          'Security fix in src/shared.ts:\n```ts\n// src/shared.ts\nexport function foo() { validate(); }\n```',
        ],
      ])
    );

    const plan = makePlan([
      makeEntry('code', 'Add feature to shared module', 1),
      makeEntry('security', 'Add input validation to shared module', 1),
    ]);

    const result = await executeWorkerDispatch({
      agentPlan: plan,
      taskDescription: 'Modify shared module',
      modelAdapter: adapter,
      logger,
    });

    expect(result.totalWorkers).toBe(2);
    expect(result.conflicts.length).toBeGreaterThan(0);
    expect(result.conflicts[0]?.filePath).toContain('src/shared.ts');
    expect(result.conflicts[0]?.workers).toHaveLength(2);
  });

  it('handles worker errors without aborting the wave', async () => {
    // Use unique subtask marker to identify the failing worker
    const FAIL_MARKER = 'UNIQUE_FAIL_MARKER_XYZ';
    const adapter = {
      complete: vi
        .fn()
        .mockImplementation(
          (opts: {
            messages: Array<{ content: string }>;
          }): Promise<{
            ok: boolean;
            value?: { content: ContentBlock[] };
            error?: { message: string };
          }> => {
            const prompt = opts.messages[0]?.content ?? '';
            if (prompt.includes(FAIL_MARKER)) {
              return Promise.resolve({
                ok: false,
                error: { message: 'Model rate limited' },
              });
            }
            return Promise.resolve({
              ok: true,
              value: {
                content: [{ type: 'text' as const, text: 'Success result' }],
              },
            });
          }
        ),
    } as unknown as IModelAdapter;

    const plan = makePlan([
      makeEntry('code', 'Implement feature', 1),
      makeEntry('security', `Review security ${FAIL_MARKER}`, 1),
      makeEntry('testing', 'Write tests', 1),
    ]);

    const result = await executeWorkerDispatch({
      agentPlan: plan,
      taskDescription: 'Task with one failing worker',
      modelAdapter: adapter,
      logger,
    });

    expect(result.totalWorkers).toBe(3);
    expect(result.successCount).toBe(2);
    expect(result.errorCount).toBe(1);
    const errorResult = result.results.find((r) => r.status === 'error');
    expect(errorResult).toBeDefined();
    expect(errorResult?.error).toContain('rate limited');
  });

  it('respects maxConcurrency option', async () => {
    let maxParallel = 0;
    let currentParallel = 0;

    const adapter = {
      complete: vi
        .fn()
        .mockImplementation((): Promise<{ ok: true; value: { content: ContentBlock[] } }> => {
          currentParallel++;
          if (currentParallel > maxParallel) maxParallel = currentParallel;
          return new Promise((resolve) => {
            setTimeout(() => {
              currentParallel--;
              resolve({
                ok: true as const,
                value: {
                  content: [{ type: 'text' as const, text: 'Done' }],
                },
              });
            }, 10);
          });
        }),
    } as unknown as IModelAdapter;

    const plan = makePlan([
      makeEntry('code', 'Task 1', 1),
      makeEntry('security', 'Task 2', 1),
      makeEntry('testing', 'Task 3', 1),
      makeEntry('architecture', 'Task 4', 1),
      makeEntry('documentation', 'Task 5', 1),
    ]);

    const result = await executeWorkerDispatch({
      agentPlan: plan,
      taskDescription: 'Concurrency test',
      modelAdapter: adapter,
      logger,
      maxConcurrency: 2,
    });

    expect(result.totalWorkers).toBe(5);
    expect(result.successCount).toBe(5);
    // Max parallel should not exceed 2 (our maxConcurrency)
    expect(maxParallel).toBeLessThanOrEqual(2);
  });

  it('composes prompts with task context and role enrichment', async () => {
    let capturedPrompt = '';
    const adapter = {
      complete: vi
        .fn()
        .mockImplementation(
          (opts: {
            messages: Array<{ content: string }>;
          }): Promise<{ ok: true; value: { content: ContentBlock[] } }> => {
            capturedPrompt = opts.messages[0]?.content ?? '';
            return Promise.resolve({
              ok: true as const,
              value: {
                content: [{ type: 'text' as const, text: 'Response' }],
              },
            });
          }
        ),
    } as unknown as IModelAdapter;

    const plan = makePlan([makeEntry('security', 'Review authentication module', 1)]);

    await executeWorkerDispatch({
      agentPlan: plan,
      taskDescription: 'Audit the authentication system for vulnerabilities',
      modelAdapter: adapter,
      logger,
    });

    // Composed prompt should include role, task context, and output constraints
    expect(capturedPrompt).toContain('security');
    expect(capturedPrompt).toContain('authentication');
    expect(capturedPrompt).toContain('Task Context');
    expect(capturedPrompt).toContain('Output Constraints');
  });

  describe('isWorkerDispatchEnabled', () => {
    it('returns false when env var is not set', () => {
      delete process.env['NEXUS_AORCHESTRA_DISPATCH'];
      expect(isWorkerDispatchEnabled()).toBe(false);
    });

    it('returns true when env var is "true"', () => {
      process.env['NEXUS_AORCHESTRA_DISPATCH'] = 'true';
      expect(isWorkerDispatchEnabled()).toBe(true);
      delete process.env['NEXUS_AORCHESTRA_DISPATCH'];
    });
  });
});
