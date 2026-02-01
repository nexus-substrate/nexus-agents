/**
 * nexus-agents/testing/framework - Routing Scorer
 *
 * Evaluates task routing decisions for accuracy and calibration.
 *
 * (Source: cli-project_plan.md v2.1.0, Phase 3)
 */

import type { CliName } from '../../cli-adapters/types.js';
import { clamp01 } from '../../utils/math-utils.js';
import type {
  EvaluationTask,
  RoutingDecisionDetails,
  RoutingScore,
  TaskTestResult,
} from './types.js';

/**
 * Configuration for routing scorer.
 */
export interface RoutingScorerConfig {
  /** Maximum acceptable decision time in ms (default: 100) */
  readonly maxDecisionTimeMs: number;
  /** Weight for preferred CLI match (default: 0.4) */
  readonly preferredMatchWeight: number;
  /** Weight for reasonable choice (default: 0.3) */
  readonly reasonableChoiceWeight: number;
  /** Weight for confidence calibration (default: 0.2) */
  readonly confidenceWeight: number;
  /** Weight for decision time (default: 0.1) */
  readonly decisionTimeWeight: number;
}

/**
 * Default routing scorer configuration.
 */
export const DEFAULT_ROUTING_SCORER_CONFIG: RoutingScorerConfig = {
  maxDecisionTimeMs: 100,
  preferredMatchWeight: 0.4,
  reasonableChoiceWeight: 0.3,
  confidenceWeight: 0.2,
  decisionTimeWeight: 0.1,
};

/**
 * Evaluates routing decisions for accuracy and calibration.
 */
export class RoutingScorer {
  private readonly config: RoutingScorerConfig;

  constructor(config?: Partial<RoutingScorerConfig>) {
    this.config = { ...DEFAULT_ROUTING_SCORER_CONFIG, ...config };
  }

  /**
   * Scores a routing decision for a task.
   * @param task - The evaluation task
   * @param decision - The routing decision made
   * @param actualScore - The actual score achieved (for calibration)
   * @returns Routing score
   */
  score(
    task: EvaluationTask,
    decision: RoutingDecisionDetails,
    actualScore?: number
  ): RoutingScore {
    const matchedPreferred = this.checkPreferredMatch(task, decision.selectedCli);
    const reasonableChoice = this.checkReasonableChoice(task, decision.selectedCli);
    const confidenceCalibration = this.calculateConfidenceCalibration(
      decision.confidence,
      actualScore
    );
    const decisionTimeScore = this.calculateDecisionTimeScore(decision.decisionTimeMs);

    // Calculate overall score
    const overallScore =
      (matchedPreferred ? this.config.preferredMatchWeight : 0) +
      (reasonableChoice ? this.config.reasonableChoiceWeight : 0) +
      confidenceCalibration * this.config.confidenceWeight +
      decisionTimeScore * this.config.decisionTimeWeight;

    const explanation = this.generateExplanation(
      matchedPreferred,
      reasonableChoice,
      confidenceCalibration,
      decisionTimeScore,
      decision
    );

    return {
      matchedPreferred,
      reasonableChoice,
      confidenceCalibration,
      decisionTimeScore,
      overallScore: clamp01(overallScore),
      explanation,
    };
  }

  /**
   * Evaluates routing accuracy across multiple results.
   * @param results - Task test results with routing decisions
   * @returns Overall routing accuracy statistics
   */
  evaluateAccuracy(results: readonly TaskTestResult[]): {
    accuracy: number;
    preferredMatchRate: number;
    reasonableChoiceRate: number;
    averageConfidence: number;
    calibrationError: number;
  } {
    const withRouting = results.filter((r) => r.routingDecision !== undefined);

    if (withRouting.length === 0) {
      return this.createEmptyAccuracyStats();
    }

    const stats = this.aggregateRoutingStats(withRouting);
    const count = withRouting.length;

    return {
      accuracy: stats.preferredMatches / count,
      preferredMatchRate: stats.preferredMatches / count,
      reasonableChoiceRate: stats.reasonableChoices / count,
      averageConfidence: stats.totalConfidence / count,
      calibrationError: stats.totalCalibrationError / count,
    };
  }

  /**
   * Creates empty accuracy statistics for when no routing data exists.
   */
  private createEmptyAccuracyStats(): {
    accuracy: number;
    preferredMatchRate: number;
    reasonableChoiceRate: number;
    averageConfidence: number;
    calibrationError: number;
  } {
    return {
      accuracy: 0,
      preferredMatchRate: 0,
      reasonableChoiceRate: 0,
      averageConfidence: 0,
      calibrationError: 0,
    };
  }

  /**
   * Aggregates routing statistics from multiple test results.
   */
  private aggregateRoutingStats(results: readonly TaskTestResult[]): {
    preferredMatches: number;
    reasonableChoices: number;
    totalConfidence: number;
    totalCalibrationError: number;
  } {
    let preferredMatches = 0;
    let reasonableChoices = 0;
    let totalConfidence = 0;
    let totalCalibrationError = 0;

    for (const result of results) {
      const decision = result.routingDecision;
      if (decision === undefined) {
        continue;
      }

      if (this.checkPreferredMatch(result.task, decision.selectedCli)) {
        preferredMatches++;
      }
      if (this.checkReasonableChoice(result.task, decision.selectedCli)) {
        reasonableChoices++;
      }

      totalConfidence += decision.confidence;
      const actualSuccess = result.success ? 1 : 0;
      totalCalibrationError += Math.abs(decision.confidence - actualSuccess);
    }

    return { preferredMatches, reasonableChoices, totalConfidence, totalCalibrationError };
  }

  /**
   * Checks if the selected CLI matches the task's preferred CLIs.
   */
  private checkPreferredMatch(task: EvaluationTask, selectedCli: CliName): boolean {
    if (task.preferredClis === undefined || task.preferredClis.length === 0) {
      // No preference specified - any choice is acceptable
      return true;
    }
    return task.preferredClis.includes(selectedCli);
  }

  /**
   * Checks if the selected CLI is a reasonable choice for the task.
   * A CLI is reasonable if it's either preferred or in the top alternatives.
   */
  private checkReasonableChoice(task: EvaluationTask, selectedCli: CliName): boolean {
    // If matched preferred, it's definitely reasonable
    if (this.checkPreferredMatch(task, selectedCli)) {
      return true;
    }

    // Use task type heuristics for reasonable CLI choices
    const reasonableByType: Record<string, readonly CliName[]> = {
      architecture: ['claude', 'gemini'],
      code_generation: ['codex', 'claude', 'gemini'],
      code_review: ['claude', 'codex'],
      debugging: ['codex', 'claude'],
      documentation: ['claude', 'gemini'],
      refactoring: ['codex', 'claude'],
      testing: ['codex', 'claude'],
      large_context: ['gemini', 'claude'],
    };

    const reasonableClis = reasonableByType[task.category] ?? ['claude', 'gemini', 'codex'];
    return reasonableClis.includes(selectedCli);
  }

  /**
   * Calculates confidence calibration score.
   * Perfect calibration: high confidence correlates with high actual scores.
   */
  private calculateConfidenceCalibration(confidence: number, actualScore?: number): number {
    if (actualScore === undefined) {
      // No actual score to compare - assume moderate calibration
      return 0.5;
    }

    // Calibration error: how far off was the confidence from the actual score
    const error = Math.abs(confidence - actualScore);

    // Convert error to score (lower error = higher score)
    return 1 - error;
  }

  /**
   * Calculates decision time score.
   * Faster decisions get higher scores.
   */
  private calculateDecisionTimeScore(decisionTimeMs: number): number {
    if (decisionTimeMs <= 0) {
      return 1;
    }

    if (decisionTimeMs >= this.config.maxDecisionTimeMs) {
      return 0;
    }

    // Linear decay from 1 to 0 as time approaches max
    return 1 - decisionTimeMs / this.config.maxDecisionTimeMs;
  }

  /**
   * Generates a human-readable explanation of the routing score.
   */
  private generateExplanation(
    matchedPreferred: boolean,
    reasonableChoice: boolean,
    confidenceCalibration: number,
    decisionTimeScore: number,
    decision: RoutingDecisionDetails
  ): string {
    const parts: string[] = [];

    if (matchedPreferred) {
      parts.push(`Selected ${decision.selectedCli} matches task preference`);
    } else if (reasonableChoice) {
      parts.push(`Selected ${decision.selectedCli} is a reasonable choice`);
    } else {
      parts.push(`Selected ${decision.selectedCli} may not be optimal for this task`);
    }

    if (confidenceCalibration >= 0.8) {
      parts.push('Confidence well-calibrated');
    } else if (confidenceCalibration < 0.5) {
      parts.push('Confidence poorly calibrated');
    }

    if (decisionTimeScore >= 0.8) {
      parts.push(`Fast decision (${String(decision.decisionTimeMs)}ms)`);
    } else if (decisionTimeScore < 0.5) {
      parts.push(`Slow decision (${String(decision.decisionTimeMs)}ms)`);
    }

    return parts.join('. ') + '.';
  }
}

/**
 * Creates a new routing scorer.
 * @param config - Optional configuration
 * @returns RoutingScorer instance
 */
export function createRoutingScorer(config?: Partial<RoutingScorerConfig>): RoutingScorer {
  return new RoutingScorer(config);
}
