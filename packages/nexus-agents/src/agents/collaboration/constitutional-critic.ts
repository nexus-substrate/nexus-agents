/**
 * nexus-agents/agents - Constitutional AI Critic
 *
 * Implementation of Constitutional AI self-critique protocol that
 * enables agents to evaluate and revise outputs against explicit
 * principles without human labelers.
 *
 * @module agents/collaboration/constitutional-critic
 * (Source: arXiv:2212.08073, Issue #147)
 */

import type { ILogger } from '../../core/index.js';
import { createLogger } from '../../core/index.js';
import type {
  Constitution,
  Principle,
  Violation,
  ViolationSeverity,
  CritiqueResult,
  RevisionIteration,
  RefinementResult,
  ConstitutionalCriticConfig,
} from './constitutional-types.js';
import { DEFAULT_CRITIC_CONFIG } from './constitutional-types.js';
import {
  getDetectionPatterns,
  getLineNumber,
  calculateScore,
  checksPasses,
  generateSummary,
  summarizeChanges,
  matchKeywords,
  applyFix,
  filterViolationsBySeverity,
  type DetectionResult,
} from './constitutional-critic-helpers.js';

/**
 * Options for critique operation.
 */
export interface CritiqueOptions {
  /** Specific principle IDs to check (all if empty) */
  readonly principleIds?: readonly string[];
  /** Minimum confidence threshold for violations */
  readonly minConfidence?: number;
}

/**
 * Options for revision operation.
 */
export interface RevisionOptions {
  /** Focus only on violations above this severity */
  readonly minSeverity?: ViolationSeverity;
  /** Context to help with revision */
  readonly context?: string;
}

/**
 * Options for refinement loop.
 */
export interface RefinementOptions {
  /** Maximum iterations (overrides config) */
  readonly maxIterations?: number;
  /** Stop when score reaches this threshold */
  readonly targetScore?: number;
}

/**
 * Constitutional AI Critic for self-evaluation and revision.
 */
export class ConstitutionalCritic {
  private readonly config: ConstitutionalCriticConfig;
  private readonly logger: ILogger;

  constructor(config: Partial<ConstitutionalCriticConfig> = {}, logger?: ILogger) {
    this.config = { ...DEFAULT_CRITIC_CONFIG, ...config };
    this.logger = logger ?? createLogger({ component: 'ConstitutionalCritic' });
  }

  /**
   * Critiques output against a constitution.
   */
  critique(
    output: string,
    constitution: Constitution,
    options: CritiqueOptions = {}
  ): CritiqueResult {
    const { principleIds, minConfidence = 0.5 } = options;
    const principles = this.filterPrinciples(constitution, principleIds);
    const violations: Violation[] = [];

    for (const principle of principles) {
      const found = this.checkPrinciple(output, principle, minConfidence);
      violations.push(...found);
    }

    const score = calculateScore(violations, principles.length);
    const passesConstitution = checksPasses(violations, this.config.failingSeverities);
    const summary = generateSummary(violations, score, passesConstitution);

    const result: CritiqueResult = {
      constitutionId: constitution.id,
      violations,
      overallScore: score,
      passesConstitution,
      summary,
      timestamp: new Date(),
    };

    this.logCritique(result, constitution.name);
    return result;
  }

  /**
   * Revises output based on critique.
   */
  revise(output: string, critique: CritiqueResult, options: RevisionOptions = {}): string {
    const { minSeverity } = options;

    // Filter violations by severity if specified
    const violationsToFix = minSeverity
      ? filterViolationsBySeverity(critique.violations, minSeverity)
      : critique.violations;

    if (violationsToFix.length === 0) {
      return output;
    }

    // Apply suggested fixes
    let revised = output;
    for (const violation of violationsToFix) {
      revised = applyFix(revised, violation);
    }

    return revised;
  }

  /**
   * Full critique-revise loop until convergence or max iterations.
   */
  refineWithConstitution(
    output: string,
    constitution: Constitution,
    options: RefinementOptions = {}
  ): RefinementResult {
    const startTime = Date.now();
    const maxIterations = options.maxIterations ?? this.config.maxIterations;
    const targetScore = options.targetScore ?? this.config.passingScore;

    const { iterations, currentOutput, converged } = this.runRefinementLoop(
      output,
      constitution,
      maxIterations,
      targetScore
    );

    const finalCritique =
      iterations[iterations.length - 1]?.critique ?? this.critique(currentOutput, constitution);
    const durationMs = Date.now() - startTime;

    const result: RefinementResult = {
      originalOutput: output,
      refinedOutput: currentOutput,
      iterations,
      totalIterations: iterations.length,
      converged,
      finalCritique,
      durationMs,
    };

    this.logRefinement(result, constitution.name);
    return result;
  }

  /**
   * Runs the refinement loop.
   */
  private runRefinementLoop(
    output: string,
    constitution: Constitution,
    maxIterations: number,
    targetScore: number
  ): { iterations: RevisionIteration[]; currentOutput: string; converged: boolean } {
    const iterations: RevisionIteration[] = [];
    let currentOutput = output;
    let converged = false;

    for (let i = 0; i < maxIterations; i++) {
      const critique = this.critique(currentOutput, constitution);
      const iteration = this.createIteration(i, currentOutput, critique, iterations);
      iterations.push(iteration);

      if (this.shouldStopRefinement(critique, targetScore)) {
        converged = true;
        break;
      }

      currentOutput = this.revise(currentOutput, critique);
    }

    return { iterations, currentOutput, converged };
  }

  /**
   * Creates a revision iteration record.
   */
  private createIteration(
    index: number,
    output: string,
    critique: CritiqueResult,
    previousIterations: RevisionIteration[]
  ): RevisionIteration {
    const prevOutput = index > 0 ? (previousIterations[index - 1]?.output ?? '') : undefined;
    return {
      iteration: index,
      output,
      critique,
      ...(prevOutput !== undefined && {
        changesSummary: summarizeChanges(prevOutput, output),
      }),
    };
  }

  /**
   * Checks if refinement should stop.
   */
  private shouldStopRefinement(critique: CritiqueResult, targetScore: number): boolean {
    if (critique.passesConstitution && critique.overallScore >= targetScore) {
      return true;
    }
    return critique.violations.length === 0;
  }

  /**
   * Filters principles by IDs if specified.
   */
  private filterPrinciples(
    constitution: Constitution,
    principleIds?: readonly string[]
  ): readonly Principle[] {
    if (principleIds === undefined || principleIds.length === 0) {
      return constitution.principles;
    }
    return constitution.principles.filter((p) => principleIds.includes(p.id));
  }

  /**
   * Checks a single principle against output.
   */
  private checkPrinciple(output: string, principle: Principle, minConfidence: number): Violation[] {
    const violations: Violation[] = [];

    // Check each example pattern
    for (const example of principle.examples) {
      const detection = this.detectViolation(output, example.violation, principle);
      if (detection !== null && detection.confidence >= minConfidence) {
        violations.push({
          principleId: principle.id,
          principleName: principle.name,
          severity: principle.defaultSeverity,
          ...(detection.location !== undefined && { location: detection.location }),
          explanation: example.explanation ?? principle.description,
          suggestedFix: example.correction,
          confidence: detection.confidence,
        });
      }
    }

    return violations;
  }

  /**
   * Detects a violation pattern in output.
   */
  private detectViolation(
    output: string,
    pattern: string,
    principle: Principle
  ): DetectionResult | null {
    // Pattern-based detection using heuristics
    const patterns = getDetectionPatterns(principle.id);

    for (const regex of patterns) {
      const match = regex.exec(output);
      if (match !== null) {
        const lineNum = getLineNumber(output, match.index);
        return {
          location: `line ${String(lineNum)}`,
          confidence: 0.8,
        };
      }
    }

    // Fuzzy match on violation example keywords
    const keywordRatio = matchKeywords(pattern, output);
    if (keywordRatio > 0.5) {
      return { confidence: keywordRatio * 0.7 };
    }

    return null;
  }

  /**
   * Logs critique result.
   */
  private logCritique(result: CritiqueResult, constitutionName: string): void {
    this.logger.info('Constitutional critique complete', {
      constitution: constitutionName,
      violations: result.violations.length,
      score: result.overallScore.toFixed(1),
      passes: result.passesConstitution,
    });

    if (this.config.verbose) {
      for (const v of result.violations) {
        this.logger.debug('Violation found', {
          principle: v.principleId,
          severity: v.severity,
          location: v.location,
        });
      }
    }
  }

  /**
   * Logs refinement result.
   */
  private logRefinement(result: RefinementResult, constitutionName: string): void {
    this.logger.info('Constitutional refinement complete', {
      constitution: constitutionName,
      iterations: result.totalIterations,
      converged: result.converged,
      finalScore: result.finalCritique.overallScore.toFixed(1),
      durationMs: result.durationMs,
    });
  }

  /**
   * Gets the current configuration.
   */
  getConfig(): ConstitutionalCriticConfig {
    return this.config;
  }
}

/**
 * Creates a Constitutional Critic with optional configuration.
 */
export function createConstitutionalCritic(
  config?: Partial<ConstitutionalCriticConfig>,
  logger?: ILogger
): ConstitutionalCritic {
  return new ConstitutionalCritic(config, logger);
}

/**
 * Quick critique of code against the default constitution.
 */
export function critiqueCode(code: string, constitution: Constitution): CritiqueResult {
  const critic = createConstitutionalCritic();
  return critic.critique(code, constitution);
}
