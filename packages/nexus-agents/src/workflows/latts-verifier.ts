/**
 * nexus-agents/workflows - LATTS Verifier
 *
 * Verifier implementations for LATTS acceptance criterion.
 *
 * @module workflows/latts-verifier
 * (Source: Issue #153, arXiv:2509.20368)
 */

import type { StepResult } from '../core/index.js';
import type { IVerifier, VerificationResult, VerifierContext } from './latts-types.js';
import { clamp01 } from '../utils/math-utils.js';

// Static patterns for error detection - no user input
const ERROR_PATTERNS: readonly RegExp[] = [
  /error/i,
  /failed/i,
  /exception/i,
  /undefined is not/i,
  /cannot read property/i,
  /null reference/i,
];

const WARNING_PATTERNS: readonly RegExp[] = [/warning/i, /deprecated/i, /todo/i, /fixme/i, /hack/i];

/**
 * Analyze output string for error patterns.
 */
function analyzeOutput(outputStr: string): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const pattern of ERROR_PATTERNS) {
    if (pattern.test(outputStr)) {
      errors.push(`Potential error detected: ${pattern.source}`);
    }
  }

  for (const pattern of WARNING_PATTERNS) {
    if (pattern.test(outputStr)) {
      warnings.push(`Warning pattern detected: ${pattern.source}`);
    }
  }

  return { errors, warnings };
}

/**
 * Calculate quality score based on issues found.
 */
function calculateQualityScore(errorCount: number, warningCount: number): number {
  const baseQuality = 1 - errorCount * 0.3 - warningCount * 0.1;
  return clamp01(baseQuality);
}

/**
 * Verify a failed step result.
 */
function verifyFailedResult(result: StepResult): VerificationResult {
  return {
    accepted: false,
    confidence: 0.95,
    reason: `Step failed: ${result.error ?? 'Unknown error'}`,
    qualityScore: 0,
    issues: [result.error ?? 'Unknown error'],
  };
}

/**
 * Verify a skipped step result.
 */
function verifySkippedResult(): VerificationResult {
  return {
    accepted: true,
    confidence: 1.0,
    reason: 'Step was intentionally skipped',
    qualityScore: 1.0,
  };
}

/**
 * Verify a step with no output.
 */
function verifyNoOutput(): VerificationResult {
  return {
    accepted: false,
    confidence: 0.8,
    reason: 'Step produced no output',
    qualityScore: 0.2,
    issues: ['No output produced'],
  };
}

/**
 * Verify successful step output.
 */
function verifySuccessfulOutput(output: unknown, context: VerifierContext): VerificationResult {
  const outputStr = typeof output === 'string' ? output : JSON.stringify(output);
  const { errors, warnings } = analyzeOutput(outputStr);
  const issues = [...errors, ...warnings];

  const errorCount = errors.length;
  const warningCount = warnings.length;
  const qualityScore = calculateQualityScore(errorCount, warningCount);

  const attemptPenalty = context.previousAttempts.length * 0.05;
  const confidence = Math.max(0.5, 0.9 - attemptPenalty);

  const accepted = errorCount === 0 && qualityScore >= 0.5;

  return {
    accepted,
    confidence,
    reason: accepted
      ? `Output accepted with quality ${qualityScore.toFixed(2)}`
      : `Output rejected due to ${String(errorCount)} errors`,
    qualityScore,
    issues: issues.length > 0 ? issues : undefined,
  };
}

/**
 * Heuristic verifier that uses output analysis to determine acceptance.
 */
export class HeuristicVerifier implements IVerifier {
  verify(result: StepResult, context: VerifierContext): Promise<VerificationResult> {
    if (result.status === 'failed') {
      return Promise.resolve(verifyFailedResult(result));
    }

    if (result.status === 'skipped') {
      return Promise.resolve(verifySkippedResult());
    }

    if (result.output === null || result.output === undefined) {
      return Promise.resolve(verifyNoOutput());
    }

    return Promise.resolve(verifySuccessfulOutput(result.output, context));
  }
}
