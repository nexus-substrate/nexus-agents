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
import type { IHindsightBeliefMemory } from '../context/belief-memory-interface.js';
import type { HindsightRecord } from '../context/belief-hindsight-types.js';
import { ok, err } from '../core/result.js';
import { MemoryError } from '../context/memory-backend-types.js';

/**
 * Build a minimal IHindsightBeliefMemory stub. Only the read methods used by the
 * plan-stage recall path are wired; everything else throws if touched so a test
 * that accidentally depends on an unstubbed method fails loudly.
 */
function createBeliefMemoryStub(
  overrides: Partial<IHindsightBeliefMemory>
): IHindsightBeliefMemory {
  const notImplemented = (name: string) => (): never => {
    throw new Error(`belief-memory stub: ${name} not implemented`);
  };
  const base = {
    retain: notImplemented('retain'),
    retainBatch: notImplemented('retainBatch'),
    recall: notImplemented('recall'),
    query: notImplemented('query'),
    recallBySubject: notImplemented('recallBySubject'),
    recallCurrent: notImplemented('recallCurrent'),
    recallHistory: notImplemented('recallHistory'),
    revise: notImplemented('revise'),
    supersede: notImplemented('supersede'),
    applyHindsight: vi.fn().mockResolvedValue(ok([])),
    reinforce: vi.fn().mockResolvedValue(ok(undefined)),
    weaken: vi.fn().mockResolvedValue(ok(undefined)),
    createCounterfactual: notImplemented('createCounterfactual'),
    validateCounterfactual: notImplemented('validateCounterfactual'),
    getCounterfactuals: notImplemented('getCounterfactuals'),
    getUpdateHistory: notImplemented('getUpdateHistory'),
    getHindsightRecords: vi.fn().mockResolvedValue(ok([])),
    getStats: notImplemented('getStats'),
    pruneSuperseded: notImplemented('pruneSuperseded'),
  } as unknown as IHindsightBeliefMemory;
  return { ...base, ...overrides };
}

function makeHindsightRecord(over: Partial<HindsightRecord>): HindsightRecord {
  return {
    hindsightId: 'h-1',
    taskId: 'task',
    priorBeliefs: [],
    expectedOutcome: 'Pipeline completes with all gates passed',
    actualOutcome: 'Incomplete: 3 vote iterations, 0 QA iterations',
    outcomeMatched: false,
    correctedBeliefs: [],
    newBeliefs: [],
    lessons: ['Pipeline did not complete — review plan approach'],
    createdAt: new Date('2026-05-01T00:00:00Z'),
    ...over,
  };
}

function createMockStages(overrides?: Partial<DevPipelineStages>): DevPipelineStages {
  return {
    research: vi.fn().mockResolvedValue('Research findings: relevant context gathered'),
    plan: vi.fn().mockResolvedValue('Implementation plan: step 1, step 2, step 3'),
    vote: vi.fn().mockResolvedValue({ kind: 'approved', approvalPercentage: 83 }),
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
    qaReview: vi.fn().mockResolvedValue({
      verdict: 'pass',
      feedback: 'Looks good',
      issues: [],
    } satisfies QaReviewResult),
    securityScan: vi.fn().mockResolvedValue({ passed: true, feedback: 'No findings' }),
    qualityGate: vi.fn().mockResolvedValue({ passed: true, feedback: 'All checks passed.' }),
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
    // #3258: vote() must receive the research context (not decide blind).
    expect(stages.vote).toHaveBeenCalledWith(
      expect.any(String),
      'Research findings: relevant context gathered'
    );
  });

  it('iterates plan when vote rejects then approves', async () => {
    let callCount = 0;
    const stages = createMockStages({
      vote: vi.fn().mockImplementation((): Promise<VoteResult> => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            kind: 'rejected',
            feedback: 'Missing error handling',
            approvalPercentage: 33,
          });
        }
        return Promise.resolve({ kind: 'approved', approvalPercentage: 83 });
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
      decompose: vi.fn().mockResolvedValue([
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
      vote: vi.fn().mockResolvedValue({
        kind: 'rejected',
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
          kind: 'rejected',
          feedback: 'Add retry logic',
          approvalPercentage: 33,
        })
        .mockResolvedValueOnce({ kind: 'approved', approvalPercentage: 83 }),
    });

    await runDevPipeline('Build feature X', stages);
    const planCalls = vi.mocked(stages.plan).mock.calls;
    expect(planCalls[0]?.[2]).toBeUndefined(); // First call: no prior feedback
    expect(planCalls[1]?.[2]).toBe('Add retry logic'); // Second call: has feedback
  });

  it('stops after plan+vote in dryRun mode (#1717)', async () => {
    const stages = createMockStages();
    const result = await runDevPipeline('Build feature X', stages, { dryRun: true });

    expect(result.completed).toBe(false);
    expect(result.plan).toBeDefined();
    expect(result.tasks).toHaveLength(0);
    expect(result.qaIterations).toBe(0);
    expect(result.securityPassed).toBe(false);
    // Should NOT have called decompose, implement, qa, or security
    expect(stages.decompose).not.toHaveBeenCalled();
    expect(stages.implement).not.toHaveBeenCalled();
    expect(stages.qaReview).not.toHaveBeenCalled();
    expect(stages.securityScan).not.toHaveBeenCalled();
  });

  it('returns tasks for external implementation in harness mode (#1704)', async () => {
    const stages = createMockStages();
    const result = await runDevPipeline('Build feature X', stages, { mode: 'harness' });

    expect(result.completed).toBe(false);
    expect(result.plan).toBeDefined();
    // Harness mode includes decomposed tasks but no implementations
    expect(result.tasks).toHaveLength(2);
    expect(result.tasks[0]?.status).toBe('pending');
    expect(result.qaIterations).toBe(0);
    // decompose SHOULD have been called, but implement/qa/security should NOT
    expect(stages.decompose).toHaveBeenCalled();
    expect(stages.implement).not.toHaveBeenCalled();
    expect(stages.qaReview).not.toHaveBeenCalled();
    expect(stages.securityScan).not.toHaveBeenCalled();
  });
});

describe('runDevPipeline — prior-hindsight recall into plan (#3257)', () => {
  it('injects formatted prior beliefs into the plan + vote context when beliefMemory recalls records', async () => {
    const task = 'Build feature X';
    const records = [
      makeHindsightRecord({
        actualOutcome: 'Incomplete: 3 vote iterations, 0 QA iterations',
        lessons: ['Pipeline did not complete — review plan approach for: Build feature X'],
      }),
    ];
    const getHindsightRecords = vi.fn().mockResolvedValue(ok(records));
    const beliefMemory = createBeliefMemoryStub({ getHindsightRecords });
    const stages = createMockStages();

    await runDevPipeline(task, stages, { beliefMemory });

    // The recall is keyed on the task-stable id the write side uses.
    expect(getHindsightRecords).toHaveBeenCalledWith(task.slice(0, 40));

    // Plan stage receives a clearly-labeled prior-belief block in its research context.
    const planResearch = vi.mocked(stages.plan).mock.calls[0]?.[1] ?? '';
    expect(planResearch).toContain('Prior beliefs from past outcomes');
    expect(planResearch).toContain('review plan approach');
    // Original research still present.
    expect(planResearch).toContain('Research findings: relevant context gathered');

    // Vote stage also sees the same context (informed voting).
    const voteResearch = vi.mocked(stages.vote).mock.calls[0]?.[1] ?? '';
    expect(voteResearch).toContain('Prior beliefs from past outcomes');
  });

  it('leaves the plan context unchanged when no beliefMemory is supplied', async () => {
    const stages = createMockStages();
    await runDevPipeline('Build feature X', stages);

    const planResearch = vi.mocked(stages.plan).mock.calls[0]?.[1] ?? '';
    expect(planResearch).toBe('Research findings: relevant context gathered');
    expect(planResearch).not.toContain('Prior beliefs');
  });

  it('leaves the plan context unchanged when recall returns no records', async () => {
    const beliefMemory = createBeliefMemoryStub({
      getHindsightRecords: vi.fn().mockResolvedValue(ok([])),
    });
    const stages = createMockStages();
    await runDevPipeline('Build feature X', stages, { beliefMemory });

    const planResearch = vi.mocked(stages.plan).mock.calls[0]?.[1] ?? '';
    expect(planResearch).toBe('Research findings: relevant context gathered');
  });

  it('is fire-safe: a throwing recall does not break the plan step', async () => {
    const beliefMemory = createBeliefMemoryStub({
      getHindsightRecords: vi.fn().mockRejectedValue(new Error('store offline')),
    });
    const stages = createMockStages();

    const result = await runDevPipeline('Build feature X', stages, { beliefMemory });

    // Pipeline still completes; plan got the plain research with no belief block.
    expect(result.completed).toBe(true);
    const planResearch = vi.mocked(stages.plan).mock.calls[0]?.[1] ?? '';
    expect(planResearch).toBe('Research findings: relevant context gathered');
  });

  it('is fire-safe: a recall returning an err Result injects no block', async () => {
    const beliefMemory = createBeliefMemoryStub({
      getHindsightRecords: vi.fn().mockResolvedValue(err(new MemoryError('boom'))),
    });
    const stages = createMockStages();
    await runDevPipeline('Build feature X', stages, { beliefMemory });

    const planResearch = vi.mocked(stages.plan).mock.calls[0]?.[1] ?? '';
    expect(planResearch).toBe('Research findings: relevant context gathered');
  });
});

describe('runDevPipeline — quality gate (#3356)', () => {
  it("does NOT run the quality gate when mode is 'off' (default)", async () => {
    const stages = createMockStages();
    const result = await runDevPipeline('Build feature X', stages);

    expect(stages.qualityGate).not.toHaveBeenCalled();
    // Off must not affect ship outcome — security still gates as before.
    expect(result.completed).toBe(true);
    expect(result.securityPassed).toBe(true);
  });

  it("does NOT run the quality gate when explicitly 'off'", async () => {
    const stages = createMockStages({
      qualityGate: vi.fn().mockResolvedValue({ passed: false, feedback: 'tsc failed' }),
    });
    const result = await runDevPipeline('Build feature X', stages, { qualityGate: 'off' });

    expect(stages.qualityGate).not.toHaveBeenCalled();
    expect(result.completed).toBe(true);
  });

  it("runs the gate but does NOT fail the pipeline on a red gate in 'advisory' mode", async () => {
    const stages = createMockStages({
      qualityGate: vi.fn().mockResolvedValue({ passed: false, feedback: '2 check(s) failed' }),
    });
    const result = await runDevPipeline('Build feature X', stages, { qualityGate: 'advisory' });

    expect(stages.qualityGate).toHaveBeenCalledTimes(1);
    // Advisory: red gate recorded but does not block — security still runs and passes.
    expect(stages.securityScan).toHaveBeenCalledTimes(1);
    expect(result.completed).toBe(true);
    expect(result.securityPassed).toBe(true);
  });

  it("runs the gate and ships when it passes in 'advisory' mode", async () => {
    const stages = createMockStages();
    const result = await runDevPipeline('Build feature X', stages, { qualityGate: 'advisory' });

    expect(stages.qualityGate).toHaveBeenCalledTimes(1);
    expect(result.completed).toBe(true);
  });

  it("fails the phase on a red gate in 'blocking' mode and skips security", async () => {
    const stages = createMockStages({
      qualityGate: vi.fn().mockResolvedValue({ passed: false, feedback: 'lint failed' }),
    });
    const result = await runDevPipeline('Build feature X', stages, { qualityGate: 'blocking' });

    expect(stages.qualityGate).toHaveBeenCalledTimes(1);
    // Blocking red gate short-circuits before the security scan, like a security block.
    expect(stages.securityScan).not.toHaveBeenCalled();
    expect(result.completed).toBe(false);
    expect(result.securityPassed).toBe(false);
    // Implementations still happened before the gate.
    expect(result.tasks).toHaveLength(2);
  });

  it("proceeds to ship on a green gate in 'blocking' mode", async () => {
    const stages = createMockStages();
    const result = await runDevPipeline('Build feature X', stages, { qualityGate: 'blocking' });

    expect(stages.qualityGate).toHaveBeenCalledTimes(1);
    expect(stages.securityScan).toHaveBeenCalledTimes(1);
    expect(result.completed).toBe(true);
  });

  it("skips the gate gracefully when stages.qualityGate is absent even if mode is 'blocking'", async () => {
    const stages = createMockStages();
    delete stages.qualityGate;
    const result = await runDevPipeline('Build feature X', stages, { qualityGate: 'blocking' });

    // No gate supplied → skipped → does not block ship.
    expect(stages.securityScan).toHaveBeenCalledTimes(1);
    expect(result.completed).toBe(true);
  });
});
