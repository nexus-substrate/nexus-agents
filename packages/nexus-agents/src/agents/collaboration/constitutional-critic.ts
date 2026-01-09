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
 * Severity ordering for comparisons.
 */
const SEVERITY_ORDER: Record<ViolationSeverity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

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

    const score = this.calculateScore(violations, principles.length);
    const passesConstitution = this.checksPasses(violations);
    const summary = this.generateSummary(violations, score, passesConstitution);

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
      ? critique.violations.filter((v) => SEVERITY_ORDER[v.severity] >= SEVERITY_ORDER[minSeverity])
      : critique.violations;

    if (violationsToFix.length === 0) {
      return output;
    }

    // Apply suggested fixes
    let revised = output;
    for (const violation of violationsToFix) {
      revised = this.applyFix(revised, violation);
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
        changesSummary: this.summarizeChanges(prevOutput, output),
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
  ): { location?: string; confidence: number } | null {
    // Pattern-based detection using heuristics
    const patterns = this.getDetectionPatterns(principle.id);

    for (const regex of patterns) {
      const match = regex.exec(output);
      if (match !== null) {
        const lineNum = this.getLineNumber(output, match.index);
        return {
          location: `line ${String(lineNum)}`,
          confidence: 0.8,
        };
      }
    }

    // Fuzzy match on violation example keywords
    const keywords = pattern
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3);
    const outputLower = output.toLowerCase();
    let matchedKeywords = 0;

    for (const keyword of keywords) {
      if (outputLower.includes(keyword)) {
        matchedKeywords++;
      }
    }

    const keywordRatio = keywords.length > 0 ? matchedKeywords / keywords.length : 0;
    if (keywordRatio > 0.5) {
      return { confidence: keywordRatio * 0.7 };
    }

    return null;
  }

  /**
   * Gets detection regex patterns for a principle.
   */
  private getDetectionPatterns(principleId: string): RegExp[] {
    const patterns: Record<string, RegExp[]> = {
      'no-secrets': [
        /(?:api[_-]?key|secret|password|token)\s*[=:]\s*["'][^"']+["']/gi,
        /sk-[a-zA-Z0-9]{20,}/g,
        /\b(?:ghp|gho|ghu|ghs)_[a-zA-Z0-9]{36}\b/g,
      ],
      'input-validation': [/JSON\.parse\([^)]*(?:req|input|user)/gi, /eval\(/gi],
      'error-handling': [/\.then\([^)]*\)(?!.*\.catch)/g],
      'no-console': [/console\.(log|warn|error)\(/g],
      'type-safety': [/:\s*any\b/g, /as\s+\w+(?!.*Schema\.parse)/g],
      'no-eval': [/\beval\s*\(/g, /new\s+Function\s*\(/g],
      'sql-injection': [/`SELECT.*\$\{/gi, /`INSERT.*\$\{/gi, /`UPDATE.*\$\{/gi],
    };

    return patterns[principleId] ?? [];
  }

  /**
   * Gets line number for a position in text.
   */
  private getLineNumber(text: string, position: number): number {
    return text.substring(0, position).split('\n').length;
  }

  /**
   * Calculates overall score based on violations.
   */
  private calculateScore(violations: readonly Violation[], principleCount: number): number {
    if (principleCount === 0) return 10;

    let penalty = 0;
    for (const v of violations) {
      penalty += SEVERITY_ORDER[v.severity] * v.confidence;
    }

    const maxPenalty = principleCount * 4; // Max severity * principle count
    const score = 10 * (1 - penalty / maxPenalty);
    return Math.max(0, Math.min(10, score));
  }

  /**
   * Checks if output passes based on violations.
   */
  private checksPasses(violations: readonly Violation[]): boolean {
    const failingSeverities = new Set(this.config.failingSeverities);
    return !violations.some((v) => failingSeverities.has(v.severity));
  }

  /**
   * Generates critique summary.
   */
  private generateSummary(
    violations: readonly Violation[],
    score: number,
    passes: boolean
  ): string {
    if (violations.length === 0) {
      return 'No violations found. Output adheres to all principles.';
    }

    const critical = violations.filter((v) => v.severity === 'critical').length;
    const high = violations.filter((v) => v.severity === 'high').length;
    const medium = violations.filter((v) => v.severity === 'medium').length;
    const low = violations.filter((v) => v.severity === 'low').length;

    const parts = [`Found ${String(violations.length)} violation(s).`];
    if (critical > 0) parts.push(`Critical: ${String(critical)}`);
    if (high > 0) parts.push(`High: ${String(high)}`);
    if (medium > 0) parts.push(`Medium: ${String(medium)}`);
    if (low > 0) parts.push(`Low: ${String(low)}`);
    parts.push(`Score: ${score.toFixed(1)}/10.`);
    parts.push(passes ? 'Passes constitution.' : 'Fails constitution.');

    return parts.join(' ');
  }

  /**
   * Applies a suggested fix to output.
   */
  private applyFix(output: string, violation: Violation): string {
    // Simple replacement - in real implementation would use AST
    // For now, just add a comment noting the violation
    if (violation.location !== undefined) {
      const lineMatch = /line (\d+)/.exec(violation.location);
      if (lineMatch !== null) {
        const lineNum = parseInt(lineMatch[1] ?? '0', 10);
        const lines = output.split('\n');
        if (lineNum > 0 && lineNum <= lines.length) {
          const comment = `// TODO: ${violation.principleName} - ${violation.suggestedFix}`;
          lines.splice(lineNum - 1, 0, comment);
          return lines.join('\n');
        }
      }
    }
    return output;
  }

  /**
   * Summarizes changes between iterations.
   */
  private summarizeChanges(previous: string, current: string): string {
    const prevLines = previous.split('\n').length;
    const currLines = current.split('\n').length;
    const lineDiff = currLines - prevLines;

    if (lineDiff > 0) {
      return `Added ${String(lineDiff)} line(s) with fix annotations`;
    } else if (lineDiff < 0) {
      return `Removed ${String(Math.abs(lineDiff))} line(s)`;
    }
    return 'Modified existing lines';
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
