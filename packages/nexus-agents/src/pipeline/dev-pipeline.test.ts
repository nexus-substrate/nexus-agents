/**
 * Multi-Agent Development Pipeline Tests (#1684)
 */

import { describe, it, expect, vi } from 'vitest';
import { runDevPipeline } from './dev-pipeline.js';
import type {
  DevPipelineStages,
  PipelineTask,
  VoteResult,
  QaReviewResult,
} from './dev-pipeline.js';

function createMockStages(overrides?: Partial<DevPipelineStages>): DevPipelineStages {
  return {
    research: vi.fn().mockResolvedValue('Research findings: relevant context gathered'),
    plan: vi.fn().mockResolvedValue('Implementation plan: step 1, step 2, step 3'),
    vote: vi.fn().mockResolvedValue({ approved: true, feedback: '', approvalPercentage: 83 }),
    decompose: vi.fn().mockResolvedValue([
      {
        id: 'task-1',
        title: 'Task 1',
        description: 'Implement step 1',
        assignedTo: 'coder',
        status: 'pending',
      },
      {
        id: 'task-2',
        title: 'Task 2',
        description: 'Implement step 2',
        assignedTo: 'coder',
        status: 'pending',
      },
    ] satisfies PipelineTask[]),
    implement: vi.fn().mockResolvedValue('Code implementation complete'),
    qaReview: vi
      .fn()
      .mockResolvedValue({
        verdict: 'pass',
        feedback: 'Looks good',
        issues: [],
      } satisfies QaReviewResult),
    securityScan: vi.fn().mockResolvedValue({ passed: true, feedback: 'No findings' }),
    ...overrides,
  };
}

describe('runDevPipeline', () => {
  it('completes full pipeline when all stages pass', async () => {
    const stages = createMockStages();
    const result = await runDevPipeline('Build feature X', stages);

    expect(result.completed).toBe(true);
    expect(result.voteIterations).toBe(1);
    expect(result.securityPassed).toBe(true);
    expect(result.tasks).toHaveLength(2);
    expect(stages.research).toHaveBeenCalledWith('Build feature X');
    expect(stages.implement).toHaveBeenCalledTimes(2);
    expect(stages.qaReview).toHaveBeenCalledTimes(2);
  });

  it('iterates plan when vote rejects then approves', async () => {
    let callCount = 0;
    const stages = createMockStages({
      vote: vi.fn().mockImplementation((): Promise<VoteResult> => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            approved: false,
            feedback: 'Missing error handling',
            approvalPercentage: 33,
          });
        }
        return Promise.resolve({ approved: true, feedback: '', approvalPercentage: 83 });
      }),
    });

    const result = await runDevPipeline('Build feature X', stages);
    expect(result.voteIterations).toBe(2);
    expect(stages.plan).toHaveBeenCalledTimes(2);
    // Second plan call should receive vote feedback
    const secondCall = vi.mocked(stages.plan).mock.calls[1];
    expect(secondCall).toBeDefined();
    expect(secondCall?.[2]).toBe('Missing error handling');
  });

  it('iterates QA when reviewer rejects then approves', async () => {
    let qaCallCount = 0;
    const stages = createMockStages({
      qaReview: vi.fn().mockImplementation((): Promise<QaReviewResult> => {
        qaCallCount++;
        if (qaCallCount === 1) {
          return Promise.resolve({
            verdict: 'needs_work',
            feedback: 'Missing tests',
            issues: ['No edge case tests'],
          });
        }
        return Promise.resolve({ verdict: 'pass', feedback: 'Fixed', issues: [] });
      }),
      decompose: vi
        .fn()
        .mockResolvedValue([
          {
            id: 'task-1',
            title: 'Task 1',
            description: 'Do it',
            assignedTo: 'coder',
            status: 'pending',
          },
        ] satisfies PipelineTask[]),
    });

    const result = await runDevPipeline('Build feature X', stages);
    expect(result.qaIterations).toBe(2);
    expect(stages.implement).toHaveBeenCalledTimes(2);
  });

  it('fails when security scan blocks', async () => {
    const stages = createMockStages({
      securityScan: vi
        .fn()
        .mockResolvedValue({ passed: false, feedback: 'Critical SQL injection' }),
    });

    const result = await runDevPipeline('Build feature X', stages);
    expect(result.completed).toBe(false);
    expect(result.securityPassed).toBe(false);
  });

  it('proceeds after max vote iterations with last plan', async () => {
    const stages = createMockStages({
      vote: vi
        .fn()
        .mockResolvedValue({
          approved: false,
          feedback: 'Still not right',
          approvalPercentage: 40,
        }),
    });

    const result = await runDevPipeline('Build feature X', stages);
    expect(result.voteIterations).toBe(3);
    // Pipeline continues with the last plan even if vote never approved
    expect(result.tasks).toHaveLength(2);
  });

  it('passes vote feedback back to plan stage', async () => {
    const stages = createMockStages({
      vote: vi
        .fn()
        .mockResolvedValueOnce({
          approved: false,
          feedback: 'Add retry logic',
          approvalPercentage: 33,
        })
        .mockResolvedValueOnce({ approved: true, feedback: '', approvalPercentage: 83 }),
    });

    await runDevPipeline('Build feature X', stages);
    const planCalls = vi.mocked(stages.plan).mock.calls;
    expect(planCalls[0]?.[2]).toBeUndefined(); // First call: no prior feedback
    expect(planCalls[1]?.[2]).toBe('Add retry logic'); // Second call: has feedback
  });
});
