/**
 * QA Verification Engine
 *
 * Orchestrates quality checks before issue closure with multi-metric
 * scoring, configurable checks, and feedback generation.
 *
 * (Source: Issue #277 - QA cycle before issue closure)
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import type { ILogger } from '../../../core/index.js';
import { createLogger, getTimeProvider } from '../../../core/index.js';
import type {
  CheckDefinition,
  CheckResult,
  VerifyConfig,
  VerifyInput,
  VerifyOutput,
  VerifyFeedback,
  VerifyEvent,
  VerifyEventType,
} from './verify-types.js';
import { STANDARD_CHECKS } from './verify-checks.js';
import {
  analyzeCheckOutput,
  computeScores,
  allRequiredPassed,
  buildFailureSummary,
  buildRecommendations,
  extractFilesFromIssues,
  prioritizeFixes,
  truncateOutput,
} from './verify-engine-helpers.js';

const execAsync = promisify(exec);

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_PASS_THRESHOLD = 0.8;
const DEFAULT_TIMEOUT_MS = 120000;

// ============================================================================
// Interface
// ============================================================================

/**
 * Interface for verification engines.
 */
export interface IVerifyEngine {
  verify(input: VerifyInput): Promise<VerifyOutput>;
  generateFeedback(output: VerifyOutput): VerifyFeedback;
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Verification engine that runs quality checks.
 */
export class VerifyEngine implements IVerifyEngine {
  private readonly logger: ILogger;
  private readonly config: Required<VerifyConfig>;
  private readonly eventListeners: Array<(event: VerifyEvent) => void>;

  constructor(config: Partial<VerifyConfig> = {}) {
    this.logger = createLogger({ component: 'verify-engine' });
    this.config = {
      checks: config.checks ?? STANDARD_CHECKS,
      stopOnFirstFailure: config.stopOnFirstFailure ?? false,
      passThreshold: config.passThreshold ?? DEFAULT_PASS_THRESHOLD,
      generateFeedback: config.generateFeedback ?? true,
      maxIterations: config.maxIterations ?? 1,
    };
    this.eventListeners = [];
  }

  // ==========================================================================
  // Main Verification
  // ==========================================================================

  /**
   * Runs all configured verification checks.
   */
  async verify(input: VerifyInput): Promise<VerifyOutput> {
    const start = getTimeProvider().now();
    this.emit('verify.started', { workDir: input.workDir, checkCount: this.config.checks.length });
    this.logger.info('Starting verification', {
      workDir: input.workDir,
      checkCount: this.config.checks.length,
    });

    const checkResults: CheckResult[] = [];
    let earlyExit = false;

    for (const check of this.config.checks) {
      this.emit('verify.check_started', { checkId: check.id, checkName: check.name });

      const result = await this.executeCheck(check, input.workDir);
      checkResults.push(result);

      this.emit('verify.check_completed', {
        checkId: check.id,
        passed: result.passed,
        score: result.score,
      });
      this.logger.info('Check completed', {
        checkId: check.id,
        passed: result.passed,
        score: result.score,
      });

      if (!result.passed && check.required && this.config.stopOnFirstFailure) {
        earlyExit = true;
        break;
      }
    }

    const output = this.computeOutput(checkResults, getTimeProvider().now() - start, earlyExit);

    if (this.config.generateFeedback && output.verdict === 'fail') {
      const feedback = this.generateFeedback(output);
      this.emit('verify.feedback_generated', { summary: feedback.summary });
    }

    this.emit('verify.completed', { verdict: output.verdict, qualityScore: output.qualityScore });
    this.logger.info('Verification complete', {
      verdict: output.verdict,
      qualityScore: output.qualityScore,
    });

    return output;
  }

  // ==========================================================================
  // Check Execution
  // ==========================================================================

  /**
   * Executes a single check.
   */
  private async executeCheck(check: CheckDefinition, workDir: string): Promise<CheckResult> {
    const start = getTimeProvider().now();
    const timeout = check.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    try {
      const { stdout, stderr } = await execAsync(check.command, {
        cwd: workDir,
        timeout,
        maxBuffer: 10 * 1024 * 1024,
      });

      const output = stdout + stderr;
      const { passed, score, issues } = analyzeCheckOutput(check, output, null);

      return {
        checkId: check.id,
        passed,
        score,
        durationMs: getTimeProvider().now() - start,
        output: truncateOutput(output),
        issues,
      };
    } catch (error) {
      const errorOutput =
        error instanceof Error
          ? ((error as { stdout?: string; stderr?: string }).stdout ?? '')
          : '';
      const errorMessage = error instanceof Error ? error.message : String(error);
      const { passed, score, issues } = analyzeCheckOutput(check, errorOutput, errorMessage);

      return {
        checkId: check.id,
        passed,
        severity: 'error',
        score,
        durationMs: getTimeProvider().now() - start,
        output: truncateOutput(errorOutput),
        error: errorMessage,
        issues,
      };
    }
  }

  // ==========================================================================
  // Output Computation
  // ==========================================================================

  /**
   * Computes final verification output.
   */
  private computeOutput(
    checkResults: readonly CheckResult[],
    durationMs: number,
    earlyExit: boolean
  ): VerifyOutput {
    const { qualityScore, confidence } = computeScores(checkResults, this.config.checks);
    const requiredPassed = allRequiredPassed(checkResults, this.config.checks);
    const meetsThreshold = qualityScore >= this.config.passThreshold;

    const verdict: 'pass' | 'fail' = requiredPassed && meetsThreshold ? 'pass' : 'fail';

    // Build base output without optional properties
    const base: Omit<VerifyOutput, 'failureSummary' | 'recommendations' | 'iterations'> = {
      verdict,
      qualityScore,
      confidence: earlyExit ? confidence * 0.5 : confidence,
      checkResults,
      durationMs,
    };

    // Build optional properties conditionally to satisfy exactOptionalPropertyTypes
    if (verdict === 'fail') {
      return {
        ...base,
        failureSummary: buildFailureSummary(checkResults, this.config.checks),
        recommendations: buildRecommendations(checkResults, this.config.checks),
      };
    }

    return base;
  }

  // ==========================================================================
  // Feedback Generation
  // ==========================================================================

  /**
   * Generates detailed feedback for refinement.
   */
  generateFeedback(output: VerifyOutput): VerifyFeedback {
    const failedChecks = output.checkResults.filter((r) => !r.passed);

    const summary = output.failureSummary ?? 'Verification failed';
    const recommendations = output.recommendations ?? [];
    const filesWithIssues = extractFilesFromIssues(output.checkResults);
    const prioritizedFixes = prioritizeFixes(failedChecks, this.config.checks);

    return {
      summary,
      recommendations,
      filesWithIssues,
      prioritizedFixes,
    };
  }

  // ==========================================================================
  // Events
  // ==========================================================================

  /**
   * Subscribes to verification events.
   */
  onEvent(listener: (event: VerifyEvent) => void): () => void {
    this.eventListeners.push(listener);
    return () => {
      const idx = this.eventListeners.indexOf(listener);
      if (idx >= 0) this.eventListeners.splice(idx, 1);
    };
  }

  /**
   * Emits an event to all listeners.
   */
  private emit(type: VerifyEventType, data: Record<string, unknown>): void {
    const event: VerifyEvent = { type, timestamp: new Date(getTimeProvider().now()), data };
    for (const listener of this.eventListeners) {
      listener(event);
    }
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Creates a verification engine with the given config.
 */
export function createVerifyEngine(config?: Partial<VerifyConfig>): VerifyEngine {
  return new VerifyEngine(config);
}
