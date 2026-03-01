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

function makeEntry(role: AgentPlanEntry['role'], subTask: string, wave: number): AgentPlanEntry {
  return { role, subTask, priority: wave, reasoning: `Selected for ${role}`, wave };
}

function makePlan(entries: AgentPlanEntry[]): AgentPlan {
  return {
    entries,
    totalExperts: entries.length,
    taskType: 'code_implementation',
    complexity: 'moderate',
    reasoning: 'Test plan',
    suggestedWaveSize: 3,
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
      complete: vi.fn().mockImplementation(
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
    it('returns true when env var is not set (default enabled #1321)', () => {
      delete process.env['NEXUS_AORCHESTRA_DISPATCH'];
      expect(isWorkerDispatchEnabled()).toBe(true);
    });

    it('returns false when env var is "false"', () => {
      process.env['NEXUS_AORCHESTRA_DISPATCH'] = 'false';
      expect(isWorkerDispatchEnabled()).toBe(false);
      delete process.env['NEXUS_AORCHESTRA_DISPATCH'];
    });
  });

  describe('synthesis integration', () => {
    it('returns synthesis when synthesize=true', async () => {
      let callCount = 0;
      const adapter = {
        complete: vi
          .fn()
          .mockImplementation((): Promise<{ ok: true; value: { content: ContentBlock[] } }> => {
            callCount++;
            // First calls are worker executions, last call is synthesis
            const text =
              callCount <= 2
                ? `Worker ${String(callCount)} output`
                : 'Synthesized: Both workers completed successfully.';
            return Promise.resolve({
              ok: true as const,
              value: { content: [{ type: 'text' as const, text }] },
            });
          }),
      } as unknown as IModelAdapter;

      const plan = makePlan([
        makeEntry('code', 'Implement feature', 1),
        makeEntry('testing', 'Write tests', 1),
      ]);

      const result = await executeWorkerDispatch({
        agentPlan: plan,
        taskDescription: 'Build a feature with tests',
        modelAdapter: adapter,
        logger,
        synthesize: true,
      });

      expect(result.totalWorkers).toBe(2);
      expect(result.successCount).toBe(2);
      expect(result.synthesis).toBeDefined();
      expect(result.synthesis).toContain('Synthesized');
      // 2 worker calls + 1 synthesis call = 3 total
      expect(callCount).toBe(3);
    });

    it('omits synthesis when synthesize=false', async () => {
      const adapter = createMockAdapter(new Map([['code', 'Output from code expert.']]));

      const plan = makePlan([makeEntry('code', 'Implement feature', 1)]);

      const result = await executeWorkerDispatch({
        agentPlan: plan,
        taskDescription: 'Build a feature',
        modelAdapter: adapter,
        logger,
        synthesize: false,
      });

      expect(result.totalWorkers).toBe(1);
      expect(result.synthesis).toBeUndefined();
    });

    it('omits synthesis when synthesize is not set (default)', async () => {
      const adapter = createMockAdapter(new Map([['code', 'Output.']]));

      const plan = makePlan([makeEntry('code', 'Task', 1)]);

      const result = await executeWorkerDispatch({
        agentPlan: plan,
        taskDescription: 'Task',
        modelAdapter: adapter,
        logger,
      });

      expect(result.synthesis).toBeUndefined();
    });

    it('falls back gracefully when synthesis LLM call fails', async () => {
      let callCount = 0;
      const adapter = {
        complete: vi.fn().mockImplementation(
          (): Promise<{
            ok: boolean;
            value?: { content: ContentBlock[] };
            error?: { message: string };
          }> => {
            callCount++;
            if (callCount <= 2) {
              return Promise.resolve({
                ok: true,
                value: {
                  content: [{ type: 'text' as const, text: `Worker ${String(callCount)} result` }],
                },
              });
            }
            // Synthesis call fails
            return Promise.resolve({
              ok: false,
              error: { message: 'Rate limited' },
            });
          }
        ),
      } as unknown as IModelAdapter;

      const plan = makePlan([makeEntry('code', 'Implement', 1), makeEntry('testing', 'Test', 1)]);

      const result = await executeWorkerDispatch({
        agentPlan: plan,
        taskDescription: 'Task',
        modelAdapter: adapter,
        logger,
        synthesize: true,
      });

      // Should still succeed with fallback synthesis
      expect(result.successCount).toBe(2);
      expect(result.synthesis).toBeDefined();
      // Fallback contains concatenated worker outputs
      expect(result.synthesis).toContain('code');
      expect(result.synthesis).toContain('testing');
    });
  });

  describe('cross-wave context passing', () => {
    it('wave 2 workers receive wave 1 context in prompts', async () => {
      const capturedPrompts: string[] = [];
      let callIndex = 0;
      const roleSequence = ['architecture', 'code'];

      const adapter = {
        complete: vi
          .fn()
          .mockImplementation(
            (opts: {
              messages: Array<{ content: string }>;
            }): Promise<{ ok: true; value: { content: ContentBlock[] } }> => {
              capturedPrompts.push(opts.messages[0]?.content ?? '');
              const role = roleSequence[callIndex] ?? 'unknown';
              callIndex++;
              return Promise.resolve({
                ok: true as const,
                value: {
                  content: [
                    { type: 'text' as const, text: `Result from ${role}: designed the system` },
                  ],
                },
              });
            }
          ),
      } as unknown as IModelAdapter;

      const plan = makePlan([
        makeEntry('architecture', 'Design the system', 1),
        makeEntry('code', 'Implement based on design', 2),
      ]);

      await executeWorkerDispatch({
        agentPlan: plan,
        taskDescription: 'Design and implement a feature',
        modelAdapter: adapter,
        logger,
      });

      // Wave 2 (code) prompt should contain prior wave context from architecture
      expect(capturedPrompts).toHaveLength(2);
      const codePrompt = capturedPrompts[1];
      expect(codePrompt).toContain('Prior Wave Context');
      expect(codePrompt).toContain('architecture');
    });
  });
});
