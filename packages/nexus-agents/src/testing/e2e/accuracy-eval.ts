/**
 * nexus-agents/testing/e2e - AccuracyEval
 *
 * Layer 2 testing: AI-driven quality evaluation for workflow outputs.
 * Uses evaluator agent to assess quality against thresholds.
 *
 * @module testing/e2e/accuracy-eval
 * (Source: Issue #281, Consensus Vote 5-0)
 */

import { logger } from '../../core/logger.js';
import { computeTokenCost } from '../../learning/token-cost-core.js';
import { getTimeProvider } from '../../core/index.js';
import { clampScore } from '../../utils/math-utils.js';
import type {
  IAccuracyEval,
  AccuracyEvalConfig,
  AccuracyEvalResult,
  EvaluationFeedback,
} from './types.js';
import { WORKFLOW_QUALITY_THRESHOLDS } from './types.js';

/**
 * Nominal blended rate for harness cost estimates, USD per 1M tokens.
 *
 * Was an inline `0.003` per 1K. Not a vendor rate for any particular model —
 * this evaluator has no model in scope — so it is a rough order-of-magnitude
 * figure for comparing runs, NOT money. Named so a reader can see that.
 */
const NOMINAL_BLENDED_RATE_PER_1M = 3;

/**
 * Quality evaluator interface for judging workflow outputs.
 */
export interface IQualityEvaluator {
  /**
   * Evaluate workflow output quality.
   * @returns Score from 0-10 with reasoning
   */
  evaluate(params: {
    workflowOutput: string;
    expectedOutput: string;
    guidelines?: string;
  }): Promise<{
    score: number;
    reasoning: string;
    issues: string[];
    strengths: string[];
    tokensUsed: number;
  }>;
}

/**
 * Default quality evaluator using structured prompts.
 * In production, this would use an LLM evaluator model.
 */
export class DefaultQualityEvaluator implements IQualityEvaluator {
  evaluate(params: {
    workflowOutput: string;
    expectedOutput: string;
    guidelines?: string;
  }): Promise<{
    score: number;
    reasoning: string;
    issues: string[];
    strengths: string[];
    tokensUsed: number;
  }> {
    const result = this.computeEvaluation(params);
    return Promise.resolve(result);
  }

  private computeEvaluation(params: { workflowOutput: string; expectedOutput: string }): {
    score: number;
    reasoning: string;
    issues: string[];
    strengths: string[];
    tokensUsed: number;
  } {
    const output = params.workflowOutput.toLowerCase();
    const expected = params.expectedOutput.toLowerCase();
    const issues: string[] = [];
    const strengths: string[] = [];

    const matchRatio = this.computeMatchRatio(expected, output);
    let score = this.computeBaseScore(matchRatio, issues, strengths);
    score = this.applyModifiers(output, score, issues, strengths);
    score = clampScore(score);

    const matchPercent = String(Math.round(matchRatio * 100));
    const charCount = String(output.length);

    return {
      score,
      reasoning: `Heuristic evaluation: ${matchPercent}% keyword match, ${charCount} chars`,
      issues,
      strengths,
      tokensUsed: Math.ceil((output.length + expected.length) / 4),
    };
  }

  private computeMatchRatio(expected: string, output: string): number {
    const expectedWords = expected.split(/\s+/).filter((w) => w.length > 3);
    const matchedWords = expectedWords.filter((w) => output.includes(w));
    return expectedWords.length > 0 ? matchedWords.length / expectedWords.length : 0;
  }

  private computeBaseScore(matchRatio: number, issues: string[], strengths: string[]): number {
    let score = 5;
    if (matchRatio > 0.8) {
      score += 3;
      strengths.push('Output contains most expected content');
    } else if (matchRatio > 0.5) {
      score += 1.5;
      strengths.push('Output contains some expected content');
    } else {
      score -= 1;
      issues.push('Output missing significant expected content');
    }
    return score;
  }

  private applyModifiers(
    output: string,
    score: number,
    issues: string[],
    strengths: string[]
  ): number {
    let s = score;
    if (output.includes('{') && output.includes('}')) {
      s += 0.5;
      strengths.push('Output appears structured');
    }
    if (output.length > 100) {
      s += 0.5;
      strengths.push('Output has sufficient detail');
    } else {
      issues.push('Output may lack detail');
    }
    if (output.includes('error') || output.includes('failed')) {
      s -= 2;
      issues.push('Output contains error indicators');
    }
    return s;
  }
}

/**
 * AccuracyEval for Layer 2 testing.
 * Evaluates workflow output quality using AI-driven assessment.
 */
export class AccuracyEval implements IAccuracyEval {
  private readonly evaluator: IQualityEvaluator;
  private readonly log = logger.child({ component: 'AccuracyEval' });

  constructor(evaluator: IQualityEvaluator = new DefaultQualityEvaluator()) {
    this.evaluator = evaluator;
  }

  /**
   * Run an accuracy evaluation.
   */
  async evaluate(config: AccuracyEvalConfig): Promise<AccuracyEvalResult> {
    const startTime = getTimeProvider().now();
    this.logEvalStart(config);

    const { feedback, scores, totalTokens } = await this.runEvaluationRounds(config);
    return this.buildResult(config, startTime, feedback, scores, totalTokens);
  }

  private logEvalStart(config: AccuracyEvalConfig): void {
    this.log.info('Starting accuracy evaluation', {
      name: config.name,
      workflow: config.workflow,
      numRuns: config.numRuns,
      threshold: config.qualityThreshold,
    });
  }

  private async runEvaluationRounds(config: AccuracyEvalConfig): Promise<{
    feedback: EvaluationFeedback[];
    scores: number[];
    totalTokens: number;
  }> {
    const feedback: EvaluationFeedback[] = [];
    const scores: number[] = [];
    let totalTokens = 0;

    for (let i = 0; i < config.numRuns; i++) {
      const result = await this.runSingleEvaluation(config, i);
      scores.push(result.score);
      totalTokens += result.tokensUsed;
      feedback.push(result.feedback);
    }

    return { feedback, scores, totalTokens };
  }

  private async runSingleEvaluation(
    config: AccuracyEvalConfig,
    runIndex: number
  ): Promise<{ score: number; tokensUsed: number; feedback: EvaluationFeedback }> {
    try {
      const workflowOutput = await this.simulateWorkflowExecution(config);
      const evalParams: { workflowOutput: string; expectedOutput: string; guidelines?: string } = {
        workflowOutput,
        expectedOutput: config.expectedOutput,
      };
      if (config.guidelines !== undefined) {
        evalParams.guidelines = config.guidelines;
      }
      const evalResult = await this.evaluator.evaluate(evalParams);

      this.log.debug('Evaluation run completed', { runIndex, score: evalResult.score });

      return {
        score: evalResult.score,
        tokensUsed: evalResult.tokensUsed,
        feedback: {
          runIndex,
          score: evalResult.score,
          reasoning: evalResult.reasoning,
          issues: evalResult.issues,
          strengths: evalResult.strengths,
        },
      };
    } catch (error) {
      this.log.error(
        'Evaluation run failed',
        error instanceof Error ? error : new Error(String(error)),
        { runIndex }
      );

      return {
        score: 0,
        tokensUsed: 0,
        feedback: {
          runIndex,
          score: 0,
          reasoning: 'Evaluation failed',
          issues: [error instanceof Error ? error.message : 'Unknown error'],
          strengths: [],
        },
      };
    }
  }

  private buildResult(
    config: AccuracyEvalConfig,
    startTime: number,
    feedback: EvaluationFeedback[],
    scores: number[],
    totalTokens: number
  ): AccuracyEvalResult {
    const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const passed = avgScore >= config.qualityThreshold;
    const durationMs = getTimeProvider().now() - startTime;
    // NOMINAL, not a billed figure: this harness has no model in scope, so
    // there is no registry rate to resolve and no input/output split to price
    // (#5122 path 11). The blended component says exactly that — folding the
    // total into `input` would have been arithmetically identical and
    // semantically false.
    const estimatedCostUsd = computeTokenCost(
      { input: 0, output: 0, blended: totalTokens },
      { inputPer1M: 0, outputPer1M: 0, blendedPer1M: NOMINAL_BLENDED_RATE_PER_1M }
    ).costUsd;

    this.log.info('Accuracy evaluation completed', {
      name: config.name,
      avgScore,
      passed,
      durationMs,
    });

    return {
      name: config.name,
      avgScore,
      scores,
      passed,
      threshold: config.qualityThreshold,
      feedback,
      totalTokens,
      totalCostUsd: estimatedCostUsd,
      durationMs,
    };
  }

  /**
   * Record evaluation result to feedback integration.
   */
  recordFeedback(result: AccuracyEvalResult, routingId?: string): void {
    this.log.info('Recording evaluation feedback', {
      name: result.name,
      avgScore: result.avgScore,
      passed: result.passed,
      routingId,
    });

    // In a real implementation, this would call:
    // feedbackIntegration.recordOutcome(routingId, {
    //   success: result.passed,
    //   qualityScore: result.avgScore / 10,
    //   evaluationMethod: 'accuracy-eval'
    // });
  }

  /**
   * Simulate workflow execution (for testing).
   * In production, this would actually run the workflow.
   */
  private async simulateWorkflowExecution(config: AccuracyEvalConfig): Promise<string> {
    // Simulate processing time
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Return mock output based on workflow type
    const mockOutputs: Record<string, string> = {
      'code-review': JSON.stringify({
        analysis: {
          codeStructure: 'Good organization with clear separation of concerns',
          namingConventions: 'Follows TypeScript naming conventions',
          complexity: 'Low cyclomatic complexity',
        },
        security: {
          vulnerabilities: [],
          recommendations: ['Add input validation', 'Use parameterized queries'],
        },
        summary: 'Code is well-structured with minor improvements suggested',
      }),
      'bug-fix': JSON.stringify({
        diagnosis: 'Root cause identified in line 42',
        fix: 'Changed comparison operator from == to ===',
        verification: 'All tests pass after fix',
      }),
      'feature-implementation': JSON.stringify({
        implementation: 'Feature implemented in 3 files',
        tests: 'Added 5 unit tests',
        documentation: 'Updated API docs',
      }),
    };

    return (
      mockOutputs[config.workflow] ??
      JSON.stringify({
        status: 'completed',
        inputs: config.input,
        output: 'Mock workflow output',
      })
    );
  }

  /**
   * Get the quality threshold for a workflow type.
   */
  static getThreshold(workflowType: string): number {
    return WORKFLOW_QUALITY_THRESHOLDS[workflowType] ?? 7.0;
  }
}

/**
 * Factory function to create an AccuracyEval instance.
 */
export function createAccuracyEval(evaluator?: IQualityEvaluator): IAccuracyEval {
  return new AccuracyEval(evaluator);
}
