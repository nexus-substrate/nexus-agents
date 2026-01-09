/**
 * nexus-agents/workflows - LATTS Controller
 *
 * Controller implementations for LATTS decision making.
 *
 * @module workflows/latts-controller
 * (Source: Issue #153, arXiv:2509.20368)
 */

import type {
  ILattsController,
  VerificationResult,
  LattsDecision,
  DecisionContext,
  LattsConfig,
  LattsHistoryEntry,
} from './latts-types.js';
import { DEFAULT_LATTS_CONFIG, LattsConfigSchema } from './latts-types.js';

/**
 * Find the best attempt from history based on quality metrics.
 */
function findBestAttempt(history: readonly LattsHistoryEntry[]): LattsHistoryEntry | null {
  if (history.length === 0) return null;

  return history.reduce((best, current) => {
    const currentScore = calculateAttemptScore(current);
    const bestScore = calculateAttemptScore(best);
    return currentScore > bestScore ? current : best;
  });
}

/**
 * Calculate a score for an attempt based on verification metrics.
 */
function calculateAttemptScore(entry: LattsHistoryEntry): number {
  const v = entry.verification;
  const acceptedBonus = v.accepted ? 0.5 : 0;
  const qualityScore = v.qualityScore ?? 0;
  const confidence = v.confidence;
  return acceptedBonus + qualityScore * 0.3 + confidence * 0.2;
}

/**
 * Check if recent failures have similar issues (indicating a pattern).
 */
function hasSimilarIssues(entries: readonly LattsHistoryEntry[]): boolean {
  if (entries.length < 2) return false;

  const issueSets = entries.map((e) => new Set(e.verification.issues ?? []));
  const firstIssues = issueSets[0];
  if (firstIssues === undefined || firstIssues.size === 0) return false;

  for (let i = 1; i < issueSets.length; i++) {
    const issues = issueSets[i];
    if (issues === undefined) continue;

    let overlap = 0;
    for (const issue of firstIssues) {
      if (issues.has(issue)) overlap++;
    }

    if (overlap / firstIssues.size >= 0.5) return true;
  }

  return false;
}

/**
 * Generate adjustments based on verification issues.
 */
function generateAdjustments(verification: VerificationResult): Record<string, unknown> {
  const adjustments: Record<string, unknown> = {};

  if (verification.issues !== undefined && verification.issues.length > 0) {
    adjustments['focusAreas'] = verification.issues;
  }

  if (verification.qualityScore !== undefined && verification.qualityScore < 0.5) {
    adjustments['increaseDetail'] = true;
  }

  return adjustments;
}

/**
 * Adaptive controller that makes LATTS decisions based on verification and history.
 */
export class AdaptiveLattsController implements ILattsController {
  private readonly config: LattsConfig;

  constructor(config: Partial<LattsConfig> = {}) {
    this.config = LattsConfigSchema.parse({ ...DEFAULT_LATTS_CONFIG, ...config });
  }

  decide(
    verification: VerificationResult,
    history: readonly LattsHistoryEntry[],
    context: DecisionContext
  ): LattsDecision {
    // Early stop if very high confidence
    if (this.isHighConfidenceAcceptance(verification)) {
      return { type: 'accept', reason: this.formatAcceptReason(verification) };
    }

    // Accept if meets thresholds
    if (this.meetsAcceptanceThreshold(verification)) {
      return { type: 'accept', reason: this.formatAcceptReason(verification) };
    }

    // Check if we've exhausted attempts
    if (context.currentAttempt >= this.config.maxAttemptsPerStep) {
      return this.handleExhaustedAttempts(verification, history, context);
    }

    // Check time budget
    if (context.elapsedMs >= context.maxTimeMs * 0.9) {
      return this.handleTimeBudgetExceeded(history);
    }

    // Analyze failure patterns to decide next action
    return this.analyzeAndDecide(verification, history, context);
  }

  private isHighConfidenceAcceptance(verification: VerificationResult): boolean {
    return verification.accepted && verification.confidence >= this.config.earlyStopThreshold;
  }

  private formatAcceptReason(verification: VerificationResult): string {
    const quality = (verification.qualityScore ?? 0).toFixed(2);
    return `confidence=${verification.confidence.toFixed(2)}, quality=${quality}`;
  }

  private meetsAcceptanceThreshold(verification: VerificationResult): boolean {
    if (!verification.accepted) return false;
    if (verification.confidence < this.config.acceptanceThreshold) return false;
    if (verification.qualityScore !== undefined) {
      return verification.qualityScore >= this.config.qualityThreshold;
    }
    return true;
  }

  private handleExhaustedAttempts(
    verification: VerificationResult,
    history: readonly LattsHistoryEntry[],
    context: DecisionContext
  ): LattsDecision {
    // Try backtracking if allowed and available
    if (this.config.allowBacktrack && context.backtrackableSteps.length > 0) {
      const target = this.findBacktrackTarget(history, context);
      if (target !== null) {
        return { type: 'backtrack', reason: 'Max attempts reached', toStepId: target };
      }
    }

    // Try restart if allowed
    if (this.config.allowRestart && context.currentAttempt < context.maxAttempts / 2) {
      return { type: 'restart', reason: 'Max step attempts reached, restarting workflow' };
    }

    // Accept best effort
    const best = findBestAttempt(history);
    return { type: 'stop', reason: 'Max attempts exhausted', output: best?.result.output };
  }

  private handleTimeBudgetExceeded(history: readonly LattsHistoryEntry[]): LattsDecision {
    const best = findBestAttempt(history);
    return { type: 'stop', reason: 'Time budget nearly exhausted', output: best?.result.output };
  }

  private analyzeAndDecide(
    verification: VerificationResult,
    history: readonly LattsHistoryEntry[],
    context: DecisionContext
  ): LattsDecision {
    const recentFailures = history.slice(-3).filter((h) => !h.verification.accepted);

    if (recentFailures.length >= 3 && hasSimilarIssues(recentFailures)) {
      return this.handleRepeatedSimilarFailures(context);
    }

    // Default: resample with adjustments
    return {
      type: 'resample',
      reason: verification.reason,
      adjustments: generateAdjustments(verification),
    };
  }

  private handleRepeatedSimilarFailures(context: DecisionContext): LattsDecision {
    if (this.config.allowBacktrack && context.backtrackableSteps.length > 0) {
      const target = context.backtrackableSteps[0];
      if (target !== undefined) {
        return { type: 'backtrack', reason: 'Repeated similar failures', toStepId: target };
      }
    }

    if (this.config.allowRestart) {
      return { type: 'restart', reason: 'Repeated similar failures, restarting' };
    }

    return { type: 'resample', reason: 'Continuing despite repeated failures' };
  }

  private findBacktrackTarget(
    history: readonly LattsHistoryEntry[],
    context: DecisionContext
  ): string | null {
    for (const stepId of context.backtrackableSteps) {
      const stepHistory = history.filter(
        (h) => h.result.stepId === stepId && h.verification.accepted
      );
      if (stepHistory.length > 0) return stepId;
    }
    return context.backtrackableSteps[0] ?? null;
  }
}
