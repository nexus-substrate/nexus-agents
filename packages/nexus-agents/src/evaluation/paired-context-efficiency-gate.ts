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

interface ArmAccumulator {
  reportedTasks: number;
  missingUsageTasks: number;
  validatedSuccesses: number;
  partialArtifacts: number;
  failedTasks: number;
  unmeasuredTasks: number;
  totalObservedAttempts: number;
  reportedAttempts: number;
  missingUsageAttempts: number;
  totalObservedTokens: number;
  totalEstimatedContextSourceTokens: number;
  allInputTokens: number[];
  allOutputTokens: number[];
  allTotalTokens: number[];
  allWallTimes: number[];
}

function createArmAccumulator(): ArmAccumulator {
  return {
    reportedTasks: 0,
    missingUsageTasks: 0,
    validatedSuccesses: 0,
    partialArtifacts: 0,
    failedTasks: 0,
    unmeasuredTasks: 0,
    totalObservedAttempts: 0,
    reportedAttempts: 0,
    missingUsageAttempts: 0,
    totalObservedTokens: 0,
    totalEstimatedContextSourceTokens: 0,
    allInputTokens: [],
    allOutputTokens: [],
    allTotalTokens: [],
    allWallTimes: [],
  };
}

function accumulateTrialAttempts(trial: CohortTrial, acc: ArmAccumulator): void {
  let trialReported = trial.attempts.length > 0;
  let trialTokens = 0;

  for (const att of trial.attempts) {
    acc.totalObservedAttempts++;
    acc.allWallTimes.push(att.wallTimeMs);
    if (att.usageReported && att.totalTokens !== undefined) {
      acc.reportedAttempts++;
      trialTokens += att.totalTokens;
      if (att.inputTokens !== undefined) acc.allInputTokens.push(att.inputTokens);
      if (att.outputTokens !== undefined) acc.allOutputTokens.push(att.outputTokens);
      acc.allTotalTokens.push(att.totalTokens);
    } else {
      acc.missingUsageAttempts++;
      trialReported = false;
    }
  }

  if (trialReported) {
    acc.reportedTasks++;
    acc.totalObservedTokens += trialTokens;
  } else {
    acc.missingUsageTasks++;
  }
}

function accumulateTrialQa(qa: QaEvaluation, acc: ArmAccumulator): void {
  if (qa.status === 'validated_success' && qa.checksRun > 0) {
    acc.validatedSuccesses++;
    return;
  }
  if (qa.status === 'partial_artifact') {
    acc.partialArtifacts++;
    acc.unmeasuredTasks++;
    return;
  }
  if (qa.status === 'unmeasured' || (qa.status === 'validated_success' && qa.checksRun === 0)) {
    acc.unmeasuredTasks++;
    return;
  }
  acc.failedTasks++;
}

function evaluateArm(trials: CohortTrial[]): ArmEvaluationSummary {
  const totalTasks = trials.length;
  const acc = createArmAccumulator();

  for (const trial of trials) {
    acc.totalEstimatedContextSourceTokens += trial.contextSourceTokens ?? 0;
    accumulateTrialAttempts(trial, acc);
    accumulateTrialQa(trial.qa, acc);
  }

  const measurementCompleteness =
    acc.totalObservedAttempts > 0 ? acc.reportedAttempts / acc.totalObservedAttempts : 0;
  const successRate = totalTasks > 0 ? acc.validatedSuccesses / totalTasks : 0;
  const [wilsonLower, wilsonUpper] = wilsonScoreInterval(acc.validatedSuccesses, totalTasks);
  const tokensPerValidatedSuccess =
    acc.validatedSuccesses > 0 ? acc.totalObservedTokens / acc.validatedSuccesses : null;

  return {
    totalTasks,
    reportedTasks: acc.reportedTasks,
    missingUsageTasks: acc.missingUsageTasks,
    validatedSuccesses: acc.validatedSuccesses,
    partialArtifacts: acc.partialArtifacts,
    failedTasks: acc.failedTasks,
    unmeasuredTasks: acc.unmeasuredTasks,
    successRate,
    successRateWilsonLower: wilsonLower,
    successRateWilsonUpper: wilsonUpper,
    totalObservedAttempts: acc.totalObservedAttempts,
    reportedAttempts: acc.reportedAttempts,
    missingUsageAttempts: acc.missingUsageAttempts,
    measurementCompleteness,
    totalObservedTokens: acc.totalObservedTokens,
    totalEstimatedContextSourceTokens: acc.totalEstimatedContextSourceTokens,
    tokensPerSuccessMeasurement: tokensPerValidatedSuccess ?? 'unmeasured',
    tokensPerValidatedSuccess,
    inputTokensPercentiles: computePercentiles(acc.allInputTokens),
    outputTokensPercentiles: computePercentiles(acc.allOutputTokens),
    totalTokensPercentiles: computePercentiles(acc.allTotalTokens),
    wallTimePercentilesMs: computePercentiles(acc.allWallTimes),
  };
}

function hasConstantModelAndRouting(tasks: PairedTask[]): boolean {
  return tasks.every(
    (t) =>
      t.baseline.model === t.candidate.model && t.baseline.routingArm === t.candidate.routingArm
  );
}

interface MeasurabilityCheckInput {
  tasksCount: number;
  sizePassed: boolean;
  constancyPassed: boolean;
  completenessPassed: boolean;
  baseline: ArmEvaluationSummary;
  candidate: ArmEvaluationSummary;
}

function isCohortMeasurable(input: MeasurabilityCheckInput): boolean {
  const baseSuccessOk =
    input.baseline.validatedSuccesses > 0 && input.baseline.tokensPerValidatedSuccess !== null;
  const candSuccessOk =
    input.candidate.validatedSuccesses > 0 && input.candidate.tokensPerValidatedSuccess !== null;
  return (
    input.tasksCount > 0 &&
    input.sizePassed &&
    input.constancyPassed &&
    input.completenessPassed &&
    baseSuccessOk &&
    candSuccessOk
  );
}

function buildMeasuredResult(
  baseline: ArmEvaluationSummary,
  candidate: ArmEvaluationSummary,
  noninferiorityMargin: number,
  checks: GateCheck[]
): PairedEfficiencyResult {
  const baseTokens = baseline.tokensPerValidatedSuccess ?? 1;
  const candTokens = candidate.tokensPerValidatedSuccess ?? 1;
  const lowerTokens = candTokens < baseTokens;
  const successDiff = candidate.successRate - baseline.successRate;
  const noninferior = successDiff >= -noninferiorityMargin;

  checks.push(
    {
      name: 'lower_tokens_per_success',
      passed: lowerTokens,
      message: `Candidate tokens/success (${candTokens.toFixed(1)}) vs baseline (${baseTokens.toFixed(1)})`,
    },
    {
      name: 'noninferior_success',
      passed: noninferior,
      message: `Candidate success rate ${candidate.successRate.toFixed(2)} vs baseline ${baseline.successRate.toFixed(2)} (diff: ${successDiff.toFixed(2)})`,
    }
  );

  return {
    verdict: lowerTokens && noninferior ? 'default_on' : 'retain_flag',
    baseline,
    candidate,
    tokensPerSuccessRatio: candTokens / baseTokens,
    successRateDifference: successDiff,
    checks,
  };
}

export function evaluatePairedContextEfficiency(
  tasks: PairedTask[],
  options: EvaluationOptions = {}
): PairedEfficiencyResult {
  const minTasks = options.minTasks ?? 30;
  const minCompleteness = options.minMeasurementCompleteness ?? 0.95;
  const noninferiorityMargin = options.noninferiorityMargin ?? 0.05;
  const sizePassed = tasks.length >= minTasks;
  const constancyPassed = hasConstantModelAndRouting(tasks);
  const baseline = evaluateArm(tasks.map((t) => t.baseline));
  const candidate = evaluateArm(tasks.map((t) => t.candidate));
  const completenessPassed =
    baseline.measurementCompleteness >= minCompleteness &&
    candidate.measurementCompleteness >= minCompleteness;
  const constancyMsg = constancyPassed
    ? 'All tasks have constant model and routing across baseline and candidate'
    : 'Model or routing arm mismatch detected across pairs';
  const completenessMsg = `Measurement completeness baseline: ${baseline.measurementCompleteness.toFixed(2)}, candidate: ${candidate.measurementCompleteness.toFixed(2)}`;
  const checks: GateCheck[] = [
    {
      name: 'cohort_size',
      passed: sizePassed,
      message: `Cohort size ${String(tasks.length)} meets minimum ${String(minTasks)}`,
    },
    { name: 'constant_model_and_routing', passed: constancyPassed, message: constancyMsg },
    { name: 'measurement_completeness', passed: completenessPassed, message: completenessMsg },
  ];
  const measurable = isCohortMeasurable({
    tasksCount: tasks.length,
    sizePassed,
    constancyPassed,
    completenessPassed,
    baseline,
    candidate,
  });
  if (!measurable) {
    return {
      verdict: 'unmeasured',
      baseline,
      candidate,
      tokensPerSuccessRatio: null,
      successRateDifference: null,
      checks,
    };
  }
  return buildMeasuredResult(baseline, candidate, noninferiorityMargin, checks);
}

function buildGeneratedTrial(
  id: string,
  arm: 'baseline' | 'candidate',
  offset: number
): CohortTrial {
  const isBaseline = arm === 'baseline';
  return {
    taskId: id,
    arm,
    model: 'claude-sonnet-4',
    routingArm: 'claude',
    attempts: [
      {
        attemptId: `${id}-${isBaseline ? 'b' : 'c'}-1`,
        inputTokens: isBaseline ? 1000 + (offset % 200) : 700 + (offset % 150),
        outputTokens: isBaseline ? 200 + (offset % 50) : 150 + (offset % 40),
        totalTokens: isBaseline ? 1200 + (offset % 250) : 850 + (offset % 190),
        wallTimeMs: isBaseline ? 1500 + (offset % 300) : 1200 + (offset % 200),
        usageReported: true,
      },
    ],
    contextSourceTokens: isBaseline ? 150 : 200,
    qa: { status: 'validated_success', checksRun: 3, details: 'Passed checks' },
  };
}

export function generatePairedTaskSet(count: number = 30, seed: number = 123): PairedTask[] {
  const categories = ['code_generation', 'refactoring', 'debugging', 'doc_generation'];
  return Array.from({ length: count }, (_, i) => {
    const id = `task-${String(i + 1)}`;
    const category = categories[i % categories.length] ?? 'code_generation';
    return {
      taskId: id,
      category,
      description: `Generated task ${id} for evaluation`,
      baseline: buildGeneratedTrial(id, 'baseline', seed + i),
      candidate: buildGeneratedTrial(id, 'candidate', seed + i),
    };
  });
}

export function randomizeExecutionOrder(
  tasks: PairedTask[],
  seed: number = 42
): RandomizedOrderPair[] {
  return tasks.map((t, idx) => {
    const val = Math.sin(seed + idx) * 10000;
    const first: 'baseline' | 'candidate' = val - Math.floor(val) > 0.5 ? 'baseline' : 'candidate';
    return { taskId: t.taskId, first };
  });
}

function formatArmSection(label: string, arm: ArmEvaluationSummary): string[] {
  const tokensStr =
    arm.tokensPerValidatedSuccess !== null ? arm.tokensPerValidatedSuccess.toFixed(1) : 'N/A';
  const p50 = String(arm.wallTimePercentilesMs.p50);
  const p95 = String(arm.wallTimePercentilesMs.p95);
  return [
    `--- ${label} ---`,
    `Total Tasks: ${String(arm.totalTasks)}`,
    `Validated Successes: ${String(arm.validatedSuccesses)}`,
    `Success Rate: ${(arm.successRate * 100).toFixed(1)}%`,
    `Tokens / Validated Success: ${tokensStr}`,
    `Latency p50 / p95: ${p50}ms / ${p95}ms`,
  ];
}

export function formatGateReport(result: PairedEfficiencyResult): string {
  return [
    '=== Paired Context-Efficiency Evaluation Gate ===',
    `Verdict: ${result.verdict.toUpperCase()}`,
    '',
    ...formatArmSection('Baseline', result.baseline),
    '',
    ...formatArmSection('Candidate', result.candidate),
    '',
    '--- Checks ---',
    ...result.checks.map((c) => `[${c.passed ? 'PASS' : 'FAIL'}] ${c.name}: ${c.message}`),
  ].join('\n');
}
