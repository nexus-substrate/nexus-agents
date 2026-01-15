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
import { createLogger } from '../../../core/index.js';
import type {
  CheckDefinition,
  CheckResult,
  CheckIssue,
  VerifyConfig,
  VerifyInput,
  VerifyOutput,
  VerifyFeedback,
  VerifyEvent,
  VerifyEventType,
} from './verify-types.js';
import { STANDARD_CHECKS } from './verify-checks.js';

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
    const start = Date.now();
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

    const output = this.computeOutput(checkResults, Date.now() - start, earlyExit);

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
    const start = Date.now();
    const timeout = check.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    try {
      const { stdout, stderr } = await execAsync(check.command, {
        cwd: workDir,
        timeout,
        maxBuffer: 10 * 1024 * 1024,
      });

      const output = stdout + stderr;
      const { passed, score, issues } = this.analyzeOutput(check, output, null);

      return {
        checkId: check.id,
        passed,
        score,
        durationMs: Date.now() - start,
        output: this.truncateOutput(output),
        issues,
      };
    } catch (error) {
      const errorOutput =
        error instanceof Error
          ? ((error as { stdout?: string; stderr?: string }).stdout ?? '')
          : '';
      const errorMessage = error instanceof Error ? error.message : String(error);
      const { passed, score, issues } = this.analyzeOutput(check, errorOutput, errorMessage);

      return {
        checkId: check.id,
        passed,
        severity: 'error',
        score,
        durationMs: Date.now() - start,
        output: this.truncateOutput(errorOutput),
        error: errorMessage,
        issues,
      };
    }
  }

  /**
   * Analyzes check output to determine pass/fail and score.
   */
  private analyzeOutput(
    check: CheckDefinition,
    output: string,
    error: string | null
  ): { passed: boolean; score: number; issues: CheckIssue[] } {
    const issues = this.findFailurePatterns(check, output);
    const hasSuccessMatch = this.hasSuccessPatternMatch(check, output);
    const hasErrors = issues.some((i) => i.severity === 'error');

    const successPatternsEmpty =
      check.successPatterns === undefined || check.successPatterns.length === 0;
    const passed = error === null && !hasErrors && (successPatternsEmpty || hasSuccessMatch);

    const baseScore = passed ? 1.0 : 0.0;
    const issuePenalty = Math.min(issues.length * 0.1, 0.5);
    const score = Math.max(baseScore - issuePenalty, 0);

    return { passed, score, issues };
  }

  /**
   * Finds failure patterns in output.
   */
  private findFailurePatterns(check: CheckDefinition, output: string): CheckIssue[] {
    const issues: CheckIssue[] = [];
    if (check.failurePatterns === undefined) return issues;

    for (const pattern of check.failurePatterns) {
      const regex = new RegExp(pattern, 'gi');
      const matches = output.match(regex);
      if (matches !== null) {
        for (const match of matches) {
          issues.push({ code: check.id, message: match, severity: 'error' });
        }
      }
    }
    return issues;
  }

  /**
   * Checks if any success pattern matches.
   */
  private hasSuccessPatternMatch(check: CheckDefinition, output: string): boolean {
    if (check.successPatterns === undefined || check.successPatterns.length === 0) {
      return false;
    }
    for (const pattern of check.successPatterns) {
      const regex = new RegExp(pattern, 'gi');
      if (regex.test(output)) {
        return true;
      }
    }
    return false;
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
    const { qualityScore, confidence } = this.computeScores(checkResults);
    const requiredPassed = this.allRequiredPassed(checkResults);
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
        failureSummary: this.buildFailureSummary(checkResults),
        recommendations: this.buildRecommendations(checkResults),
      };
    }

    return base;
  }

  /**
   * Computes quality score and confidence.
   */
  private computeScores(checkResults: readonly CheckResult[]): {
    qualityScore: number;
    confidence: number;
  } {
    if (checkResults.length === 0) {
      return { qualityScore: 0, confidence: 0 };
    }

    let totalWeight = 0;
    let weightedScore = 0;

    for (const result of checkResults) {
      const check = this.config.checks.find((c) => c.id === result.checkId);
      const weight = check?.weight ?? 0.1;
      totalWeight += weight;
      weightedScore += result.score * weight;
    }

    const qualityScore = totalWeight > 0 ? weightedScore / totalWeight : 0;
    const executedRatio = checkResults.length / this.config.checks.length;
    const confidence = executedRatio * (1 - checkResults.filter((r) => !r.passed).length * 0.1);

    return { qualityScore, confidence: Math.max(confidence, 0) };
  }

  /**
   * Checks if all required checks passed.
   */
  private allRequiredPassed(checkResults: readonly CheckResult[]): boolean {
    for (const result of checkResults) {
      const check = this.config.checks.find((c) => c.id === result.checkId);
      if (check?.required === true && !result.passed) {
        return false;
      }
    }
    return true;
  }

  /**
   * Builds failure summary.
   */
  private buildFailureSummary(checkResults: readonly CheckResult[]): string {
    const failed = checkResults.filter((r) => !r.passed);
    if (failed.length === 0) return 'Quality threshold not met';

    const names = failed.map((r) => {
      const check = this.config.checks.find((c) => c.id === r.checkId);
      return check?.name ?? r.checkId;
    });

    return `${String(failed.length)} check(s) failed: ${names.join(', ')}`;
  }

  /**
   * Builds recommendations for fixes.
   */
  private buildRecommendations(checkResults: readonly CheckResult[]): string[] {
    const recommendations: string[] = [];

    for (const result of checkResults) {
      if (!result.passed) {
        const check = this.config.checks.find((c) => c.id === result.checkId);
        if (check) {
          recommendations.push(`Fix ${check.name}: Run '${check.command}' and resolve issues`);
        }
        if (result.issues && result.issues.length > 0) {
          const topIssue = result.issues[0];
          if (topIssue) {
            recommendations.push(`Address: ${topIssue.message}`);
          }
        }
      }
    }

    return recommendations;
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

    const filesWithIssues = this.extractFilesFromIssues(output.checkResults);

    const prioritizedFixes = this.prioritizeFixes(failedChecks);

    return {
      summary,
      recommendations,
      filesWithIssues,
      prioritizedFixes,
    };
  }

  /**
   * Extracts files mentioned in check issues.
   */
  private extractFilesFromIssues(checkResults: readonly CheckResult[]): string[] {
    const files = new Set<string>();

    for (const result of checkResults) {
      if (result.issues !== undefined) {
        for (const issue of result.issues) {
          if (issue.file !== undefined && issue.file !== '') {
            files.add(issue.file);
          }
        }
      }
    }

    return Array.from(files);
  }

  /**
   * Prioritizes fixes based on check requirements and severity.
   */
  private prioritizeFixes(failedChecks: readonly CheckResult[]): string[] {
    const prioritized: string[] = [];

    // Required checks first
    for (const result of failedChecks) {
      const check = this.config.checks.find((c) => c.id === result.checkId);
      if (check?.required === true) {
        prioritized.push(`[REQUIRED] Fix ${check.name}`);
      }
    }

    // Then optional checks
    for (const result of failedChecks) {
      const check = this.config.checks.find((c) => c.id === result.checkId);
      if (check?.required === false) {
        prioritized.push(`[OPTIONAL] Fix ${check.name}`);
      }
    }

    return prioritized;
  }

  // ==========================================================================
  // Utilities
  // ==========================================================================

  /**
   * Truncates output to reasonable length.
   */
  private truncateOutput(output: string, maxLength: number = 5000): string {
    if (output.length <= maxLength) return output;
    return output.slice(0, maxLength) + '\n... (truncated)';
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
    const event: VerifyEvent = { type, timestamp: new Date(), data };
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
