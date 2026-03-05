/**
 * KNN Routing Stage
 *
 * Scores candidates using K-Nearest Neighbors over historical routing
 * experience patterns from RoutingMemory. For each candidate CLI,
 * retrieves similar past tasks and weights by success rate.
 *
 * @module cli-adapters/routing/stages/knn-routing-stage
 * (Source: arXiv:2507.05370 — KNN-based model routing)
 */

import type { Result } from '../../../core/result.js';
import type { ILogger } from '../../../core/index.js';
import { ok, createLogger, getTimeProvider } from '../../../core/index.js';
import type {
  IRouterStage,
  RoutingContext,
  StageResult,
  StageError,
  RoutingOutcome,
  CliName,
} from '../router-stage.js';
import { addTrace, updateScore, getRemainingCandidates } from '../router-stage.js';
import type { IRoutingMemory, ExperiencePattern } from '../../../context/routing-memory.js';

// ============================================================================
// Configuration
// ============================================================================

/** Number of nearest neighbors to consider. */
const DEFAULT_K = 5;

/** Weight applied to KNN scores in overall routing. */
const DEFAULT_KNN_WEIGHT = 0.3;

/** Minimum experience patterns needed to produce a score. */
const MIN_PATTERNS = 2;

/**
 * Task type keywords for similarity matching.
 * Maps task content keywords to canonical workflow types.
 */
const WORKFLOW_KEYWORDS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['coding', ['code', 'implement', 'function', 'class', 'refactor']],
  ['review', ['review', 'audit', 'check', 'inspect']],
  ['testing', ['test', 'spec', 'coverage', 'assert']],
  ['documentation', ['document', 'explain', 'describe', 'readme']],
  ['debugging', ['debug', 'fix', 'bug', 'error', 'issue']],
  ['research', ['research', 'investigate', 'explore', 'analyze']],
  ['planning', ['plan', 'design', 'architect', 'strategy']],
  ['security', ['security', 'vulnerability', 'threat', 'pentest']],
];

/**
 * Configuration for the KNN routing stage.
 */
export interface KnnRoutingConfig {
  /** Number of nearest neighbors to use */
  readonly k: number;
  /** Weight for KNN scoring in overall score */
  readonly knnWeight: number;
  /** Enable debug logging */
  readonly debug: boolean;
}

const DEFAULT_CONFIG: KnnRoutingConfig = {
  k: DEFAULT_K,
  knnWeight: DEFAULT_KNN_WEIGHT,
  debug: false,
};

// ============================================================================
// Distance calculation
// ============================================================================

/**
 * Computes cosine similarity between two keyword-frequency vectors.
 * Returns 0-1 where 1 = identical.
 */
export function cosineSimilarity(
  a: ReadonlyMap<string, number>,
  b: ReadonlyMap<string, number>
): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (const [key, valA] of a) {
    normA += valA * valA;
    const valB = b.get(key) ?? 0;
    dotProduct += valA * valB;
  }
  for (const [, valB] of b) {
    normB += valB * valB;
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dotProduct / denom : 0;
}

/**
 * Extracts a keyword-frequency vector from task content.
 */
export function extractKeywordVector(content: string): Map<string, number> {
  const lower = content.toLowerCase();
  const vec = new Map<string, number>();

  for (const [workflow, keywords] of WORKFLOW_KEYWORDS) {
    let count = 0;
    for (const kw of keywords) {
      if (lower.includes(kw)) count++;
    }
    if (count > 0) vec.set(workflow, count);
  }

  return vec;
}

// ============================================================================
// Stage Implementation
// ============================================================================

/**
 * KNN Routing Stage for experience-based routing.
 * Runs after capability match (priority 38) to add experience-based scoring.
 */
export class KnnRoutingStage implements IRouterStage {
  readonly name = 'knn-routing';
  readonly priority = 38; // After capability-match(35), before zero(40)

  private readonly config: KnnRoutingConfig;
  private readonly logger: ILogger;
  private readonly memory: IRoutingMemory;
  private routingsCount = 0;
  private matchCount = 0;

  constructor(memory: IRoutingMemory, config: Partial<KnnRoutingConfig> = {}, logger?: ILogger) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.memory = memory;
    this.logger = logger ?? createLogger({ component: 'KnnRoutingStage' });
  }

  canHandle(ctx: RoutingContext): boolean {
    return getRemainingCandidates(ctx).length > 0;
  }

  route(ctx: RoutingContext): Promise<Result<StageResult, StageError>> {
    const time = getTimeProvider();
    const startTime = time.now();
    const remaining = getRemainingCandidates(ctx);
    this.routingsCount++;

    const taskVector = extractKeywordVector(ctx.task);
    const workflows = this.inferWorkflows(ctx.task);
    const knnScores = this.computeKnnScores(remaining, workflows, taskVector);

    let updatedCtx = ctx;
    for (const [cli, score] of knnScores) {
      updatedCtx = updateScore(updatedCtx, cli, score * this.config.knnWeight);
    }

    const signals = [...ctx.signals];
    if (knnScores.size > 0) {
      this.matchCount++;
      signals.push('knn:experience-matched');
    } else {
      signals.push('knn:cold-start');
    }

    const durationMs = time.now() - startTime;
    const finalCtx = addTrace(
      updatedCtx,
      this.name,
      durationMs,
      'score',
      `Workflows: ${workflows.join(',')}, matches: ${String(knnScores.size)}`
    );

    this.logger.debug('KNN routing complete', {
      workflows,
      knnScores: [...knnScores].map(([c, s]) => `${c}:${s.toFixed(3)}`),
    });

    return Promise.resolve(ok({ context: { ...finalCtx, signals }, continuesPipeline: true }));
  }

  recordOutcome(outcome: RoutingOutcome): void {
    this.logger.debug('KNN outcome recorded', {
      cli: outcome.selectedCli,
      success: outcome.success,
    });
  }

  getStats(): Record<string, unknown> {
    return {
      routingsCount: this.routingsCount,
      matchCount: this.matchCount,
      hitRate: this.routingsCount > 0 ? this.matchCount / this.routingsCount : 0,
      config: { k: this.config.k, knnWeight: this.config.knnWeight },
    };
  }

  /**
   * Infer workflow types from task content for experience lookup.
   */
  private inferWorkflows(content: string): string[] {
    const lower = content.toLowerCase();
    const matches: string[] = [];

    for (const [workflow, keywords] of WORKFLOW_KEYWORDS) {
      if (keywords.some((kw) => lower.includes(kw))) {
        matches.push(workflow);
      }
    }

    return matches.length > 0 ? matches : ['general'];
  }

  /**
   * Compute KNN scores for candidate CLIs based on experience patterns.
   */
  private computeKnnScores(
    candidates: readonly CliName[],
    workflows: readonly string[],
    taskVector: ReadonlyMap<string, number>
  ): Map<CliName, number> {
    const scores = new Map<CliName, number>();
    const allPatterns = this.gatherPatterns(workflows);

    if (allPatterns.length < MIN_PATTERNS) return scores;

    // Compute similarity + rank patterns
    const ranked = this.rankBySimilarity(allPatterns, taskVector);
    const topK = ranked.slice(0, this.config.k);

    // Aggregate scores per CLI from top-K
    for (const cli of candidates) {
      const cliPatterns = topK.filter((p) => p.pattern.modelSequence.includes(cli));
      if (cliPatterns.length === 0) continue;

      const weightedScore = cliPatterns.reduce(
        (sum, p) => sum + p.similarity * p.pattern.successRate,
        0
      );
      const totalWeight = cliPatterns.reduce((sum, p) => sum + p.similarity, 0);
      if (totalWeight > 0) {
        scores.set(cli, weightedScore / totalWeight);
      }
    }

    return scores;
  }

  /** Gather experience patterns from memory across workflows. */
  private gatherPatterns(workflows: readonly string[]): ExperiencePattern[] {
    const patterns: ExperiencePattern[] = [];
    for (const wf of workflows) {
      patterns.push(...this.memory.getExperiencePatterns(wf));
    }
    return patterns;
  }

  /** Rank patterns by cosine similarity to the task vector. */
  private rankBySimilarity(
    patterns: readonly ExperiencePattern[],
    taskVector: ReadonlyMap<string, number>
  ): Array<{ pattern: ExperiencePattern; similarity: number }> {
    return patterns
      .map((pattern) => {
        const patternVector = new Map<string, number>();
        patternVector.set(pattern.workflow, 1);
        return { pattern, similarity: cosineSimilarity(taskVector, patternVector) };
      })
      .sort((a, b) => b.similarity - a.similarity);
  }
}

/**
 * Creates a KNN routing stage.
 */
export function createKnnRoutingStage(
  memory: IRoutingMemory,
  config?: Partial<KnnRoutingConfig>,
  logger?: ILogger
): KnnRoutingStage {
  return new KnnRoutingStage(memory, config, logger);
}
