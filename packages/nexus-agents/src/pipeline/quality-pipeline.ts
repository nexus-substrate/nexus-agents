/**
 * Quality-Gated Development Pipeline (#1684)
 *
 * Orchestrates the full development workflow:
 *   research → plan → vote → implement → scan → QA → ship
 *
 * Each stage has quality gates. Failed gates return work to the
 * previous stage with feedback. Max iterations prevent infinite loops.
 *
 * @module pipeline/quality-pipeline
 */

import { createLogger } from '../core/index.js';
import type { PipelineStage, QualityGateResult } from '../security/quality-gate-types.js';
import { MAX_GATE_ITERATIONS } from '../security/quality-gate-types.js';
import { runQualityGate } from '../security/quality-gate.js';
import type { GateCheckFn } from '../security/quality-gate.js';

const logger = createLogger({ component: 'quality-pipeline' });

/** Configuration for a pipeline stage. */
export interface StageConfig {
  readonly stage: PipelineStage;
  readonly checks: readonly GateCheckFn[];
  readonly maxIterations?: number;
}

/** Result of executing a single pipeline stage. */
export interface StageExecutionResult {
  readonly stage: PipelineStage;
  readonly gateResult: QualityGateResult;
  readonly passed: boolean;
  readonly iterations: number;
}

/** Result of a full pipeline run. */
export interface PipelineRunResult {
  readonly stages: readonly StageExecutionResult[];
  readonly completed: boolean;
  readonly failedAt: PipelineStage | null;
  readonly totalIterations: number;
}

/**
 * Execute a single stage, re-running it while its quality gate fails.
 *
 * @param config - The stage, its gate, and its iteration cap
 * @param onFeedback - Called on each failed iteration, with feedback text
 * @returns Whether the stage passed, its final gate result, and iterations used
 */
async function executeStage(
  config: StageConfig,
  onFeedback?: (stage: PipelineStage, feedback: string, iteration: number) => Promise<void>
): Promise<{ passed: boolean; gateResult: QualityGateResult; iterations: number }> {
  const maxIter = config.maxIterations ?? MAX_GATE_ITERATIONS;
  let lastResult: QualityGateResult | null = null;

  for (let i = 1; i <= maxIter; i++) {
    const gateResult = await runQualityGate(config.stage, config.checks, i);
    lastResult = gateResult;
    if (gateResult.verdict === 'pass') {
      logger.info('Stage passed', { stage: config.stage, iteration: i });
      return { passed: true, gateResult, iterations: i };
    }
    logger.warn('Stage failed', {
      stage: config.stage,
      iteration: i,
      feedback: gateResult.feedback,
    });
    if (i < maxIter && onFeedback !== undefined) {
      await onFeedback(config.stage, gateResult.feedback, i);
    }
  }
  return { passed: false, gateResult: lastResult!, iterations: maxIter }; // eslint-disable-line @typescript-eslint/no-non-null-assertion -- loop runs ≥1
}

/**
 * Execute a quality-gated pipeline.
 *
 * Runs each stage in order. When a stage's quality gate fails, `onFeedback` is
 * invoked so the caller can fix the issue, then the stage is re-run up to its
 * iteration cap.
 *
 * @param stages - Ordered pipeline stages with their checks
 * @param onFeedback - Called when a stage fails, with feedback text
 * @returns Pipeline run result
 */
export async function runQualityPipeline(
  stages: readonly StageConfig[],
  onFeedback?: (stage: PipelineStage, feedback: string, iteration: number) => Promise<void>
): Promise<PipelineRunResult> {
  const results: StageExecutionResult[] = [];
  let totalIterations = 0;

  for (const config of stages) {
    const exec = await executeStage(config, onFeedback);
    totalIterations += exec.iterations;
    results.push({
      stage: config.stage,
      gateResult: exec.gateResult,
      passed: exec.passed,
      iterations: exec.iterations,
    });
    if (!exec.passed) {
      return { stages: results, completed: false, failedAt: config.stage, totalIterations };
    }
  }
  return { stages: results, completed: true, failedAt: null, totalIterations };
}
