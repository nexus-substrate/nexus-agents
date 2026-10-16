/**
 * Tests for the paired context-efficiency evaluation gate (#6823).
 *
 * Validates:
 * - Predeclared paired baseline/candidate task sets with constant model/routing
 * - Total tokens across observed attempts per independently validated success
 * - p50/p95 input/output tokens and wall time percentiles
 * - Success rate with Wilson score confidence intervals
 * - Explicit 'unmeasured' handling for empty cohorts, empty successes, and missing usage
 * - Rejection of silent zero cost on missing usage or empty checks
 * - Partial artifact classification and retry accounting
 * - Default-on vs retain-flag decision criteria
 *
 * @module evaluation/paired-context-efficiency-gate.test
 */

import { describe, it, expect } from 'vitest';
import {
  evaluatePairedContextEfficiency,
  generatePairedTaskSet,
  randomizeExecutionOrder,
  formatGateReport,
  type PairedTask,
  type CohortTrial,
  type TrialAttempt,
  type QaEvaluation,
} from './paired-context-efficiency-gate.js';

function makeAttempt(overrides: Partial<TrialAttempt> = {}): TrialAttempt {
  return {
    attemptId: 'att-1',
    inputTokens: 1000,
    outputTokens: 200,
    totalTokens: 1200,
    wallTimeMs: 1500,
    usageReported: true,
    ...overrides,
  };
}

function makeQa(overrides: Partial<QaEvaluation> = {}): QaEvaluation {
  return {
    status: 'validated_success',
    checksRun: 3,
    details: 'All QA assertions passed',
    ...overrides,
  };
}

function makeTrial(
  arm: 'baseline' | 'candidate',
  overrides: Partial<CohortTrial> = {}
): CohortTrial {
  return {
    taskId: 'task-1',
    arm,
    model: 'claude-sonnet-4',
    routingArm: 'claude',
    attempts: [makeAttempt()],
    contextSourceTokens: 150,
    qa: makeQa(),
    ...overrides,
  };
}

function makePairedTask(id: string, overrides: Partial<PairedTask> = {}): PairedTask {
  return {
    taskId: id,
    category: 'code_generation',
    description: `Task ${id}`,
    baseline: makeTrial('baseline', { taskId: id }),
    candidate: makeTrial('candidate', { taskId: id }),
    ...overrides,
  };
}

function makeCohort(
  count: number,
  modifier?: (task: PairedTask, index: number) => PairedTask
): PairedTask[] {
  const tasks: PairedTask[] = [];
  for (let i = 0; i < count; i++) {
    const task = makePairedTask(`task-${String(i)}`);
    tasks.push(modifier !== undefined ? modifier(task, i) : task);
  }
  return tasks;
}

describe('paired-context-efficiency-gate', () => {
  describe('Name the empty case: empty cohorts and empty successes', () => {
    it('returns unmeasured verdict when given an empty task cohort', () => {
      const result = evaluatePairedContextEfficiency([]);
      expect(result.verdict).toBe('unmeasured');
      expect(result.baseline.totalTasks).toBe(0);
      expect(result.candidate.totalTasks).toBe(0);
      expect(result.baseline.tokensPerSuccessMeasurement).toBe('unmeasured');
      expect(result.baseline.tokensPerValidatedSuccess).toBeNull();
      expect(result.candidate.tokensPerSuccessMeasurement).toBe('unmeasured');
      expect(result.candidate.tokensPerValidatedSuccess).toBeNull();
      expect(result.tokensPerSuccessRatio).toBeNull();
      expect(result.successRateDifference).toBeNull();
    });

    it('names the empty-success case unmeasured when no task succeeds', () => {
      const tasks = makeCohort(30, (t) => ({
        ...t,
        baseline: { ...t.baseline, qa: makeQa({ status: 'failed', checksRun: 2 }) },
        candidate: { ...t.candidate, qa: makeQa({ status: 'failed', checksRun: 2 }) },
      }));

      const result = evaluatePairedContextEfficiency(tasks);
      expect(result.verdict).toBe('unmeasured');
      expect(result.baseline.validatedSuccesses).toBe(0);
      expect(result.candidate.validatedSuccesses).toBe(0);
      expect(result.baseline.tokensPerSuccessMeasurement).toBe('unmeasured');
      expect(result.baseline.tokensPerValidatedSuccess).toBeNull();
      expect(result.candidate.tokensPerSuccessMeasurement).toBe('unmeasured');
      expect(result.candidate.tokensPerValidatedSuccess).toBeNull();
    });

    it('returns unmeasured if cohort size is below declared minimum', () => {
      const tasks = makeCohort(10);
      const result = evaluatePairedContextEfficiency(tasks, { minTasks: 30 });
      expect(result.verdict).toBe('unmeasured');
      const sizeCheck = result.checks.find((c) => c.name === 'cohort_size');
      expect(sizeCheck?.passed).toBe(false);
    });
  });

  describe('Model and routing constancy', () => {
    it('fails closed with unmeasured if model or routing arm differs across pair', () => {
      const tasks = makeCohort(30, (t, i) => {
        if (i === 5) {
          return {
            ...t,
            candidate: { ...t.candidate, model: 'different-model' },
          };
        }
        return t;
      });

      const result = evaluatePairedContextEfficiency(tasks);
      expect(result.verdict).toBe('unmeasured');
      const constancyCheck = result.checks.find((c) => c.name === 'constant_model_and_routing');
      expect(constancyCheck?.passed).toBe(false);
    });
  });

  describe('Independent QA of actual artifacts', () => {
    it('refuses to count success when qa checksRun is zero (vacuous QA)', () => {
      const tasks = makeCohort(30, (t, i) => {
        if (i === 0) {
          return {
            ...t,
            candidate: {
              ...t.candidate,
              qa: { status: 'validated_success', checksRun: 0, details: 'no checks' },
            },
          };
        }
        return t;
      });

      const result = evaluatePairedContextEfficiency(tasks);
      expect(result.candidate.validatedSuccesses).toBe(29);
      expect(result.candidate.unmeasuredTasks).toBe(1);
    });

    it('treats partial_artifact as not validated success', () => {
      const tasks = makeCohort(30, (t, i) => {
        if (i < 5) {
          return {
            ...t,
            candidate: {
              ...t.candidate,
              qa: makeQa({ status: 'partial_artifact', checksRun: 2 }),
            },
          };
        }
        return t;
      });

      const result = evaluatePairedContextEfficiency(tasks);
      expect(result.candidate.partialArtifacts).toBe(5);
      expect(result.candidate.validatedSuccesses).toBe(25);
    });
  });

  describe('Attempt usage, retry, and missing usage accounting', () => {
    it('accumulates tokens from all attempts across retries', () => {
      const tasks = makeCohort(30, (t, i) => {
        if (i === 0) {
          return {
            ...t,
            baseline: {
              ...t.baseline,
              attempts: [
                makeAttempt({
                  attemptId: 'att-1-1',
                  inputTokens: 500,
                  outputTokens: 100,
                  totalTokens: 600,
                }),
                makeAttempt({
                  attemptId: 'att-1-2',
                  inputTokens: 700,
                  outputTokens: 150,
                  totalTokens: 850,
                }),
              ],
            },
          };
        }
        return t;
      });

      const result = evaluatePairedContextEfficiency(tasks);
      expect(result.baseline.totalObservedAttempts).toBe(31);
      // Task 0 contributed 600 + 850 = 1450 tokens. Tasks 1..29 contributed 29 * 1200 = 34800. Total = 36250.
      expect(result.baseline.totalObservedTokens).toBe(36250);
    });

    it('does not infer zero cost when usage is missing', () => {
      const tasks = makeCohort(30, (t, i) => {
        if (i < 10) {
          return {
            ...t,
            candidate: {
              ...t.candidate,
              attempts: [
                {
                  attemptId: 'att-1',
                  wallTimeMs: 1500,
                  usageReported: false,
                },
              ],
            },
          };
        }
        return t;
      });

      const result = evaluatePairedContextEfficiency(tasks, { minMeasurementCompleteness: 0.95 });
      expect(result.candidate.missingUsageAttempts).toBe(10);
      expect(result.candidate.reportedAttempts).toBe(20);
      expect(result.candidate.measurementCompleteness).toBeCloseTo(20 / 30, 2);
      expect(result.verdict).toBe('unmeasured');
      const completenessCheck = result.checks.find((c) => c.name === 'measurement_completeness');
      expect(completenessCheck?.passed).toBe(false);
    });

    it('keeps estimated context-source tokens separate from invocation tokens', () => {
      const tasks = makeCohort(30, (t) => ({
        ...t,
        baseline: { ...t.baseline, contextSourceTokens: 250 },
        candidate: { ...t.candidate, contextSourceTokens: 400 },
      }));

      const result = evaluatePairedContextEfficiency(tasks);
      expect(result.baseline.totalEstimatedContextSourceTokens).toBe(30 * 250);
      expect(result.candidate.totalEstimatedContextSourceTokens).toBe(30 * 400);
      // Invocations total tokens unaffected
      expect(result.baseline.totalObservedTokens).toBe(30 * 1200);
      expect(result.candidate.totalObservedTokens).toBe(30 * 1200);
    });
  });

  describe('Percentiles calculation: input/output tokens and latency', () => {
    it('computes accurate p50 and p95 distributions', () => {
      const latencies = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
      const tasks = makeCohort(30, (t, i) => {
        const ms = latencies[i % latencies.length]!;
        return {
          ...t,
          baseline: {
            ...t.baseline,
            attempts: [makeAttempt({ wallTimeMs: ms, inputTokens: ms * 2, outputTokens: ms })],
          },
        };
      });

      const result = evaluatePairedContextEfficiency(tasks);
      expect(result.baseline.wallTimePercentilesMs.p50).toBeGreaterThanOrEqual(500);
      expect(result.baseline.wallTimePercentilesMs.p95).toBeGreaterThan(900);
      expect(result.baseline.inputTokensPercentiles.p50).toBeGreaterThanOrEqual(1000);
    });
  });

  describe('Decision gate: default-on vs retain-flag', () => {
    it('returns default_on when lower tokens per success and noninferior success pass', () => {
      const tasks = makeCohort(30, (t, i) => {
        // Baseline: 1200 tokens per task, 27 successes out of 30
        const baselineSuccess = i < 27;
        // Candidate: 800 tokens per task (33% reduction), 28 successes out of 30
        const candidateSuccess = i < 28;
        return {
          ...t,
          baseline: {
            ...t.baseline,
            attempts: [makeAttempt({ totalTokens: 1200, inputTokens: 1000, outputTokens: 200 })],
            qa: makeQa({ status: baselineSuccess ? 'validated_success' : 'failed' }),
          },
          candidate: {
            ...t.candidate,
            attempts: [makeAttempt({ totalTokens: 800, inputTokens: 650, outputTokens: 150 })],
            qa: makeQa({ status: candidateSuccess ? 'validated_success' : 'failed' }),
          },
        };
      });

      const result = evaluatePairedContextEfficiency(tasks);
      expect(result.verdict).toBe('default_on');
      expect(result.candidate.tokensPerValidatedSuccess).toBeLessThan(
        result.baseline.tokensPerValidatedSuccess!
      );
      expect(result.candidate.successRate).toBeGreaterThanOrEqual(result.baseline.successRate);
    });

    it('returns retain_flag when candidate uses more tokens per success', () => {
      const tasks = makeCohort(30, (t) => ({
        ...t,
        baseline: {
          ...t.baseline,
          attempts: [makeAttempt({ totalTokens: 1000 })],
          qa: makeQa({ status: 'validated_success' }),
        },
        candidate: {
          ...t.candidate,
          attempts: [makeAttempt({ totalTokens: 1500 })],
          qa: makeQa({ status: 'validated_success' }),
        },
      }));

      const result = evaluatePairedContextEfficiency(tasks);
      expect(result.verdict).toBe('retain_flag');
      const tokenCheck = result.checks.find((c) => c.name === 'lower_tokens_per_success');
      expect(tokenCheck?.passed).toBe(false);
    });

    it('returns retain_flag when candidate success rate is inferior beyond margin', () => {
      const tasks = makeCohort(30, (t, i) => {
        // Baseline: 30 successes (100%)
        // Candidate: 20 successes (66.7%), below noninferiority threshold
        const candidateSuccess = i < 20;
        return {
          ...t,
          baseline: {
            ...t.baseline,
            attempts: [makeAttempt({ totalTokens: 1000 })],
            qa: makeQa({ status: 'validated_success' }),
          },
          candidate: {
            ...t.candidate,
            attempts: [makeAttempt({ totalTokens: 600 })], // Cheaper, but worse quality
            qa: makeQa({ status: candidateSuccess ? 'validated_success' : 'failed' }),
          },
        };
      });

      const result = evaluatePairedContextEfficiency(tasks, { noninferiorityMargin: 0.05 });
      expect(result.verdict).toBe('retain_flag');
      const noninferiorCheck = result.checks.find((c) => c.name === 'noninferior_success');
      expect(noninferiorCheck?.passed).toBe(false);
    });
  });

  describe('Predeclared task set generation and execution randomization', () => {
    it('generates a fixed predeclared set of 30-50 tasks with matching model/routing', () => {
      const taskSet = generatePairedTaskSet(35, 42);
      expect(taskSet.length).toBe(35);
      for (const task of taskSet) {
        expect(task.baseline.model).toBe(task.candidate.model);
        expect(task.baseline.routingArm).toBe(task.candidate.routingArm);
      }
    });

    it('randomizes execution order deterministically with seed', () => {
      const taskSet = generatePairedTaskSet(30, 42);
      const orderA = randomizeExecutionOrder(taskSet, 999);
      const orderB = randomizeExecutionOrder(taskSet, 999);
      expect(orderA).toEqual(orderB);

      // Verify both baseline-first and candidate-first are represented
      const baselineFirstCount = orderA.filter((o) => o.first === 'baseline').length;
      expect(baselineFirstCount).toBeGreaterThan(5);
      expect(baselineFirstCount).toBeLessThan(25);
    });
  });

  describe('formatGateReport', () => {
    it('formats a human-readable and auditable report', () => {
      const tasks = makeCohort(30);
      const result = evaluatePairedContextEfficiency(tasks);
      const formatted = formatGateReport(result);
      expect(formatted).toContain('Paired Context-Efficiency Evaluation Gate');
      expect(formatted).toContain('Verdict:');
      expect(formatted).toContain('Tokens / Validated Success:');
      expect(formatted).toContain('Latency p50 / p95:');
    });
  });
});
