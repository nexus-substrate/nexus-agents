/**
 * Paired Context-Efficiency Evaluation Gate (#6823).
 * // @export-no-consumer-yet — see #6823
 *
 * Implements paired baseline/candidate cohort evaluation with:
 * - Constant model and routing arm enforcement
 * - Independent artifact QA (refusing vacuous checksRun === 0, handling partial_artifact)
 * - Attempt aggregation (input/output/total tokens, retries, missing usage handling without zero imputation)
 * - Percentiles (p50, p95 for tokens and latency)
 * - Success rate confidence intervals (Wilson score)
 * - Decision logic: default_on vs retain_flag vs unmeasured
 * - Predeclared task set generation and deterministic randomization
 * - Auditable report formatting
 *
 * @module evaluation/paired-context-efficiency-gate
 */

export interface TrialAttempt {
  attemptId: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  wallTimeMs: number;
  usageReported: boolean;
}

export interface QaEvaluation {
  status: 'validated_success' | 'failed' | 'partial_artifact' | 'unmeasured';
  checksRun: number;
  details: string;
}

export interface CohortTrial {
  taskId: string;
  arm: 'baseline' | 'candidate';
  model: string;
  routingArm: string;
  attempts: TrialAttempt[];
  contextSourceTokens?: number;
  qa: QaEvaluation;
}

export interface PairedTask {
  taskId: string;
  category: string;
  description: string;
  baseline: CohortTrial;
  candidate: CohortTrial;
}

export interface EvaluationOptions {
  minTasks?: number;
  minMeasurementCompleteness?: number;
  noninferiorityMargin?: number;
}

export interface PercentileSummary {
  p50: number;
  p95: number;
}

export interface ArmEvaluationSummary {
  totalTasks: number;
  reportedTasks: number;
  missingUsageTasks: number;
  validatedSuccesses: number;
  partialArtifacts: number;
  failedTasks: number;
  unmeasuredTasks: number;
  successRate: number;
  successRateWilsonLower: number;
  successRateWilsonUpper: number;
  totalObservedAttempts: number;
  reportedAttempts: number;
  missingUsageAttempts: number;
  measurementCompleteness: number;
  totalObservedTokens: number;
  totalEstimatedContextSourceTokens: number;
  tokensPerSuccessMeasurement: number | 'unmeasured';
  tokensPerValidatedSuccess: number | null;
  inputTokensPercentiles: PercentileSummary;
  outputTokensPercentiles: PercentileSummary;
  totalTokensPercentiles: PercentileSummary;
  wallTimePercentilesMs: PercentileSummary;
}

export interface GateCheck {
  name: string;
  passed: boolean;
  message: string;
}

export interface PairedEfficiencyResult {
  verdict: 'default_on' | 'retain_flag' | 'unmeasured';
  baseline: ArmEvaluationSummary;
  candidate: ArmEvaluationSummary;
  tokensPerSuccessRatio: number | null;
  successRateDifference: number | null;
  checks: GateCheck[];
}

export interface RandomizedOrderPair {
  taskId: string;
  first: 'baseline' | 'candidate';
}

function computePercentiles(values: number[]): PercentileSummary {
  if (values.length === 0) {
    return { p50: 0, p95: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const p50Idx = Math.floor(sorted.length * 0.5);
  const p95Idx = Math.floor(sorted.length * 0.95);
  return {
    p50: sorted[Math.min(p50Idx, sorted.length - 1)] ?? 0,
    p95: sorted[Math.min(p95Idx, sorted.length - 1)] ?? 0,
  };
}

function wilsonScoreInterval(successes: number, total: number, z = 1.96): [number, number] {
  if (total === 0) return [0, 0];
  const p = successes / total;
  const denom = 1 + (z * z) / total;
  const center = (p + (z * z) / (2 * total)) / denom;
  const spread = (z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))) / denom;
  return [Math.max(0, center - spread), Math.min(1, center + spread)];
}

function evaluateArm(trials: CohortTrial[]): ArmEvaluationSummary {
  const totalTasks = trials.length;
  let reportedTasks = 0;
  let missingUsageTasks = 0;
  let validatedSuccesses = 0;
  let partialArtifacts = 0;
  let failedTasks = 0;
  let unmeasuredTasks = 0;

  let totalObservedAttempts = 0;
  let reportedAttempts = 0;
  let missingUsageAttempts = 0;
  let totalObservedTokens = 0;
  let totalEstimatedContextSourceTokens = 0;

  const allInputTokens: number[] = [];
  const allOutputTokens: number[] = [];
  const allTotalTokens: number[] = [];
  const allWallTimes: number[] = [];

  for (const trial of trials) {
    totalEstimatedContextSourceTokens += trial.contextSourceTokens ?? 0;
    let trialReported = true;
    let trialTokens = 0;

    for (const att of trial.attempts) {
      totalObservedAttempts++;
      if (att.usageReported && att.totalTokens !== undefined) {
        reportedAttempts++;
        trialTokens += att.totalTokens;
        if (att.inputTokens !== undefined) allInputTokens.push(att.inputTokens);
        if (att.outputTokens !== undefined) allOutputTokens.push(att.outputTokens);
        allTotalTokens.push(att.totalTokens);
      } else {
        missingUsageAttempts++;
        trialReported = false;
      }
      allWallTimes.push(att.wallTimeMs);
    }

    if (trialReported && trial.attempts.length > 0) {
      reportedTasks++;
      totalObservedTokens += trialTokens;
    } else {
      missingUsageTasks++;
    }

    // QA evaluation: refuse validated_success if checksRun === 0 (vacuous)
    const isSuccess =
      trial.qa.status === 'validated_success' && trial.qa.checksRun > 0;
    if (isSuccess) {
      validatedSuccesses++;
    } else if (trial.qa.status === 'partial_artifact') {
      partialArtifacts++;
      unmeasuredTasks++;
    } else if (trial.qa.status === 'validated_success' && trial.qa.checksRun === 0) {
      unmeasuredTasks++;
    } else if (trial.qa.status === 'unmeasured') {
      unmeasuredTasks++;
    } else {
      failedTasks++;
    }
  }

  const measurementCompleteness =
    totalObservedAttempts > 0 ? reportedAttempts / totalObservedAttempts : 0;
  const successRate = totalTasks > 0 ? validatedSuccesses / totalTasks : 0;
  const [wilsonLower, wilsonUpper] = wilsonScoreInterval(validatedSuccesses, totalTasks);

  const tokensPerValidatedSuccess =
    validatedSuccesses > 0 ? totalObservedTokens / validatedSuccesses : null;
  const tokensPerSuccessMeasurement =
    tokensPerValidatedSuccess !== null ? tokensPerValidatedSuccess : 'unmeasured';

  return {
    totalTasks,
    reportedTasks,
    missingUsageTasks,
    validatedSuccesses,
    partialArtifacts,
    failedTasks,
    unmeasuredTasks,
    successRate,
    successRateWilsonLower: wilsonLower,
    successRateWilsonUpper: wilsonUpper,
    totalObservedAttempts,
    reportedAttempts,
    missingUsageAttempts,
    measurementCompleteness,
    totalObservedTokens,
    totalEstimatedContextSourceTokens,
    tokensPerSuccessMeasurement,
    tokensPerValidatedSuccess,
    inputTokensPercentiles: computePercentiles(allInputTokens),
    outputTokensPercentiles: computePercentiles(allOutputTokens),
    totalTokensPercentiles: computePercentiles(allTotalTokens),
    wallTimePercentilesMs: computePercentiles(allWallTimes),
  };
}

export function evaluatePairedContextEfficiency(
  tasks: PairedTask[],
  options: EvaluationOptions = {},
): PairedEfficiencyResult {
  const minTasks = options.minTasks ?? 30;
  const minCompleteness = options.minMeasurementCompleteness ?? 0.95;
  const noninferiorityMargin = options.noninferiorityMargin ?? 0.05;

  const checks: GateCheck[] = [];

  const sizePassed = tasks.length >= minTasks;
  checks.push({
    name: 'cohort_size',
    passed: sizePassed,
    message: `Cohort size ${tasks.length} meets minimum ${minTasks}`,
  });

  const baselineTrials = tasks.map((t) => t.baseline);
  const candidateTrials = tasks.map((t) => t.candidate);

  // Check constant model and routing arm
  let constancyPassed = true;
  for (const t of tasks) {
    if (
      t.baseline.model !== t.candidate.model ||
      t.baseline.routingArm !== t.candidate.routingArm
    ) {
      constancyPassed = false;
      break;
    }
  }
  checks.push({
    name: 'constant_model_and_routing',
    passed: constancyPassed,
    message: constancyPassed
      ? 'All tasks have constant model and routing across baseline and candidate'
      : 'Model or routing arm mismatch detected across pairs',
  });

  const baseline = evaluateArm(baselineTrials);
  const candidate = evaluateArm(candidateTrials);

  const baselineCompletenessPassed = baseline.measurementCompleteness >= minCompleteness;
  const candidateCompletenessPassed = candidate.measurementCompleteness >= minCompleteness;
  checks.push({
    name: 'measurement_completeness',
    passed: baselineCompletenessPassed && candidateCompletenessPassed,
    message: `Measurement completeness baseline: ${baseline.measurementCompleteness.toFixed(2)}, candidate: ${candidate.measurementCompleteness.toFixed(2)}`,
  });

  if (
    !sizePassed ||
    !constancyPassed ||
    !baselineCompletenessPassed ||
    !candidateCompletenessPassed ||
    tasks.length === 0 ||
    baseline.validatedSuccesses === 0 ||
    candidate.validatedSuccesses === 0 ||
    baseline.tokensPerValidatedSuccess === null ||
    candidate.tokensPerValidatedSuccess === null
  ) {
    return {
      verdict: 'unmeasured',
      baseline,
      candidate,
      tokensPerSuccessRatio: null,
      successRateDifference: null,
      checks,
    };
  }

  const lowerTokens =
    candidate.tokensPerValidatedSuccess < baseline.tokensPerValidatedSuccess;
  checks.push({
    name: 'lower_tokens_per_success',
    passed: lowerTokens,
    message: `Candidate tokens/success (${candidate.tokensPerValidatedSuccess.toFixed(1)}) vs baseline (${baseline.tokensPerValidatedSuccess.toFixed(1)})`,
  });

  const successDiff = candidate.successRate - baseline.successRate;
  const noninferior = successDiff >= -noninferiorityMargin;
  checks.push({
    name: 'noninferior_success',
    passed: noninferior,
    message: `Candidate success rate ${candidate.successRate.toFixed(2)} vs baseline ${baseline.successRate.toFixed(2)} (diff: ${successDiff.toFixed(2)})`,
  });

  const tokensRatio = candidate.tokensPerValidatedSuccess / baseline.tokensPerValidatedSuccess;

  let verdict: 'default_on' | 'retain_flag' | 'unmeasured' = 'retain_flag';
  if (lowerTokens && noninferior) {
    verdict = 'default_on';
  }

  return {
    verdict,
    baseline,
    candidate,
    tokensPerSuccessRatio: tokensRatio,
    successRateDifference: successDiff,
    checks,
  };
}

export function generatePairedTaskSet(count: number = 30, seed: number = 123): PairedTask[] {
  const tasks: PairedTask[] = [];
  const categories = ['code_generation', 'refactoring', 'debugging', 'doc_generation'];
  for (let i = 0; i < count; i++) {
    const id = `task-${String(i + 1)}`;
    const category = categories[i % categories.length] ?? 'code_generation';
    const model = 'claude-sonnet-4';
    const routingArm = 'claude';
    tasks.push({
      taskId: id,
      category,
      description: `Generated task ${id} for evaluation`,
      baseline: {
        taskId: id,
        arm: 'baseline',
        model,
        routingArm,
        attempts: [
          {
            attemptId: `${id}-b-1`,
            inputTokens: 1000 + (seed + i) % 200,
            outputTokens: 200 + (seed + i) % 50,
            totalTokens: 1200 + (seed + i) % 250,
            wallTimeMs: 1500 + (seed + i) % 300,
            usageReported: true,
          },
        ],
        contextSourceTokens: 150,
        qa: { status: 'validated_success', checksRun: 3, details: 'Passed checks' },
      },
      candidate: {
        taskId: id,
        arm: 'candidate',
        model,
        routingArm,
        attempts: [
          {
            attemptId: `${id}-c-1`,
            inputTokens: 700 + (seed + i) % 150,
            outputTokens: 150 + (seed + i) % 40,
            totalTokens: 850 + (seed + i) % 190,
            wallTimeMs: 1200 + (seed + i) % 200,
            usageReported: true,
          },
        ],
        contextSourceTokens: 200,
        qa: { status: 'validated_success', checksRun: 3, details: 'Passed checks' },
      },
    });
  }
  return tasks;
}

export function randomizeExecutionOrder(
  tasks: PairedTask[],
  seed: number = 42,
): RandomizedOrderPair[] {
  return tasks.map((t, idx) => {
    const val = Math.sin(seed + idx) * 10000;
    const first: 'baseline' | 'candidate' = val - Math.floor(val) > 0.5 ? 'baseline' : 'candidate';
    return { taskId: t.taskId, first };
  });
}

export function formatGateReport(result: PairedEfficiencyResult): string {
  const lines: string[] = [
    '=== Paired Context-Efficiency Evaluation Gate ===',
    `Verdict: ${result.verdict.toUpperCase()}`,
    '',
    '--- Baseline ---',
    `Total Tasks: ${result.baseline.totalTasks}`,
    `Validated Successes: ${result.baseline.validatedSuccesses}`,
    `Success Rate: ${(result.baseline.successRate * 100).toFixed(1)}%`,
    `Tokens / Validated Success: ${result.baseline.tokensPerValidatedSuccess !== null ? result.baseline.tokensPerValidatedSuccess.toFixed(1) : 'N/A'}`,
    `Latency p50 / p95: ${result.baseline.wallTimePercentilesMs.p50}ms / ${result.baseline.wallTimePercentilesMs.p95}ms`,
    '',
    '--- Candidate ---',
    `Total Tasks: ${result.candidate.totalTasks}`,
    `Validated Successes: ${result.candidate.validatedSuccesses}`,
    `Success Rate: ${(result.candidate.successRate * 100).toFixed(1)}%`,
    `Tokens / Validated Success: ${result.candidate.tokensPerValidatedSuccess !== null ? result.candidate.tokensPerValidatedSuccess.toFixed(1) : 'N/A'}`,
    `Latency p50 / p95: ${result.candidate.wallTimePercentilesMs.p50}ms / ${result.candidate.wallTimePercentilesMs.p95}ms`,
    '',
    '--- Checks ---',
    ...result.checks.map((c) => `[${c.passed ? 'PASS' : 'FAIL'}] ${c.name}: ${c.message}`),
  ];
  return lines.join('\n');
}
