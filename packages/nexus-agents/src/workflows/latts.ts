/**
 * nexus-agents/workflows - LATTS Implementation
 *
 * Implements Locally Adaptive Test-Time Scaling (LATTS) for dynamic
 * compute allocation with verifier-based acceptance criterion.
 *
 * @module workflows/latts
 * (Source: Issue #153, arXiv:2509.20368)
 */

import type { StepResult } from '../core/index.js';
import { createLogger, getTimeProvider } from '../core/index.js';
import type {
  IVerifier,
  ILattsController,
  VerificationResult,
  VerifierContext,
  LattsDecision,
  DecisionContext,
  LattsConfig,
  LattsHistoryEntry,
  LattsExecutionResult,
  LattsStats,
} from './latts-types.js';
import { DEFAULT_LATTS_CONFIG, LattsConfigSchema } from './latts-types.js';
import { HeuristicVerifier } from './latts-verifier.js';
import { AdaptiveLattsController } from './latts-controller.js';

// Re-export types and implementations
export type {
  IVerifier,
  ILattsController,
  VerificationResult,
  VerifierContext,
  LattsDecision,
  DecisionContext,
  LattsConfig,
  LattsHistoryEntry,
  LattsExecutionResult,
  LattsStats,
} from './latts-types.js';
export { DEFAULT_LATTS_CONFIG } from './latts-types.js';
export { HeuristicVerifier } from './latts-verifier.js';
export { AdaptiveLattsController } from './latts-controller.js';

const logger = createLogger({ component: 'LATTS' });

/** Context passed to attempt execution. */
interface AttemptContext {
  stepId: string;
  taskDescription: string;
  stepResults: ReadonlyMap<string, StepResult>;
  history: LattsHistoryEntry[];
  backtrackableSteps: readonly string[];
  startTime: number;
}

/**
 * Discriminated union for attempt outcomes (Issue #539).
 * When shouldReturn is true, result is available.
 * When shouldReturn is false (retry case), result is not needed.
 */
type AttemptOutcome =
  | { entry: LattsHistoryEntry; shouldReturn: true; result: LattsExecutionResult }
  | { entry: LattsHistoryEntry; shouldReturn: false };

/**
 * LATTS executor that wraps step execution with adaptive compute scaling.
 */
export class LattsExecutor {
  private readonly config: LattsConfig;
  private readonly verifier: IVerifier;
  private readonly controller: ILattsController;
  private stats = this.createEmptyStats();

  constructor(
    config: Partial<LattsConfig> = {},
    verifier?: IVerifier,
    controller?: ILattsController
  ) {
    this.config = LattsConfigSchema.parse({ ...DEFAULT_LATTS_CONFIG, ...config });
    this.verifier = verifier ?? new HeuristicVerifier();
    this.controller = controller ?? new AdaptiveLattsController(config);

    logger.info('LATTS executor initialized', {
      maxAttemptsPerStep: this.config.maxAttemptsPerStep,
      maxTotalAttempts: this.config.maxTotalAttempts,
      acceptanceThreshold: this.config.acceptanceThreshold,
    });
  }

  private createEmptyStats(): {
    totalExecutions: number;
    successfulExecutions: number;
    totalAttempts: number;
    backtrackCount: number;
    restartCount: number;
    earlyStopCount: number;
    qualityScoreSum: number;
    qualityScoreCount: number;
  } {
    return {
      totalExecutions: 0,
      successfulExecutions: 0,
      totalAttempts: 0,
      backtrackCount: 0,
      restartCount: 0,
      earlyStopCount: 0,
      qualityScoreSum: 0,
      qualityScoreCount: 0,
    };
  }

  /**
   * Execute a step with LATTS adaptive scaling.
   */
  async execute(
    executeStep: () => Promise<StepResult>,
    stepId: string,
    taskDescription: string,
    stepResults: ReadonlyMap<string, StepResult>,
    backtrackableSteps: readonly string[] = []
  ): Promise<LattsExecutionResult> {
    const time = getTimeProvider();
    const startTime = time.now();
    const history: LattsHistoryEntry[] = [];
    let totalAttemptsUsed = 0;

    this.stats.totalExecutions++;

    const ctx: AttemptContext = {
      stepId,
      taskDescription,
      stepResults,
      history,
      backtrackableSteps,
      startTime,
    };

    while (totalAttemptsUsed < this.config.maxTotalAttempts) {
      if (this.isTimeBudgetExceeded(startTime)) break;

      const attemptResult = await this.executeAttempt(executeStep, ctx);

      history.push(attemptResult.entry);
      totalAttemptsUsed++;
      this.stats.totalAttempts++;

      if (attemptResult.shouldReturn) {
        return attemptResult.result;
      }
    }

    return this.createFinalResult(history, totalAttemptsUsed, startTime);
  }

  private isTimeBudgetExceeded(startTime: number): boolean {
    return getTimeProvider().now() - startTime >= this.config.maxTimeMs;
  }

  private async executeAttempt(
    executeStep: () => Promise<StepResult>,
    ctx: AttemptContext
  ): Promise<AttemptOutcome> {
    const attemptStart = getTimeProvider().now();
    const result = await executeStep();

    const verification = await this.verifyResult(result, ctx);
    const decision = this.makeDecision(verification, ctx);

    const entry = this.createHistoryEntry(result, verification, decision, ctx, attemptStart);
    this.logAttempt(ctx.stepId, ctx.history.length + 1, verification, decision);
    this.handleDecisionSideEffects(decision, ctx.stepId);

    if (decision.type === 'accept' || decision.type === 'stop') {
      return {
        entry,
        shouldReturn: true,
        result: this.createAcceptedResult(result, verification, ctx.history, entry, ctx.startTime),
      };
    }

    return { entry, shouldReturn: false };
  }

  private async verifyResult(result: StepResult, ctx: AttemptContext): Promise<VerificationResult> {
    const verifierContext: VerifierContext = {
      stepId: ctx.stepId,
      taskDescription: ctx.taskDescription,
      previousAttempts: ctx.history,
      stepResults: ctx.stepResults,
      totalAttempts: ctx.history.length + 1,
    };

    const verification = await this.verifier.verify(result, verifierContext);
    this.updateQualityStats(verification);
    return verification;
  }

  private makeDecision(verification: VerificationResult, ctx: AttemptContext): LattsDecision {
    const decisionContext: DecisionContext = {
      stepId: ctx.stepId,
      maxAttempts: this.config.maxTotalAttempts,
      currentAttempt: ctx.history.length + 1,
      backtrackableSteps: ctx.backtrackableSteps,
      allowRestart: this.config.allowRestart,
      elapsedMs: getTimeProvider().now() - ctx.startTime,
      maxTimeMs: this.config.maxTimeMs,
    };

    return this.controller.decide(verification, ctx.history, decisionContext);
  }

  private createHistoryEntry(
    result: StepResult,
    verification: VerificationResult,
    decision: LattsDecision,
    ctx: AttemptContext,
    attemptStart: number
  ): LattsHistoryEntry {
    return {
      attempt: ctx.history.length + 1,
      result,
      verification,
      decision,
      durationMs: getTimeProvider().now() - attemptStart,
    };
  }

  private updateQualityStats(verification: VerificationResult): void {
    if (verification.qualityScore !== undefined) {
      this.stats.qualityScoreSum += verification.qualityScore;
      this.stats.qualityScoreCount++;
    }
  }

  private logAttempt(
    stepId: string,
    attempt: number,
    verification: VerificationResult,
    decision: LattsDecision
  ): void {
    logger.debug('LATTS attempt completed', {
      stepId,
      attempt,
      accepted: verification.accepted,
      decision: decision.type,
    });
  }

  private handleDecisionSideEffects(decision: LattsDecision, stepId: string): void {
    if (decision.type === 'accept' && decision.reason.includes('confidence')) {
      this.stats.earlyStopCount++;
    }
    if (decision.type === 'backtrack') {
      this.stats.backtrackCount++;
      logger.info('LATTS backtracking', { stepId, toStepId: decision.toStepId });
    }
    if (decision.type === 'restart') {
      this.stats.restartCount++;
      logger.info('LATTS restarting', { stepId });
    }
  }

  private createAcceptedResult(
    result: StepResult,
    verification: VerificationResult,
    history: LattsHistoryEntry[],
    entry: LattsHistoryEntry,
    startTime: number
  ): LattsExecutionResult {
    const allHistory = [...history, entry];
    const isEarlyStop = verification.confidence >= this.config.earlyStopThreshold;
    if (verification.accepted) this.stats.successfulExecutions++;

    return {
      result,
      verification,
      history: allHistory,
      totalAttempts: allHistory.length,
      totalDurationMs: getTimeProvider().now() - startTime,
      earlyStop: isEarlyStop,
      success: verification.accepted,
    };
  }

  private createFinalResult(
    history: LattsHistoryEntry[],
    totalAttempts: number,
    startTime: number
  ): LattsExecutionResult {
    const lastEntry = history[history.length - 1];
    if (lastEntry === undefined) {
      throw new Error('No history entries after execution');
    }

    return {
      result: lastEntry.result,
      verification: lastEntry.verification,
      history,
      totalAttempts,
      totalDurationMs: getTimeProvider().now() - startTime,
      earlyStop: false,
      success: lastEntry.verification.accepted,
    };
  }

  /**
   * Get LATTS performance statistics.
   */
  getStats(): LattsStats {
    const s = this.stats;
    const successRate = s.totalExecutions > 0 ? s.successfulExecutions / s.totalExecutions : 0;
    const avgAttempts = s.totalExecutions > 0 ? s.totalAttempts / s.totalExecutions : 0;
    const avgQuality = s.qualityScoreCount > 0 ? s.qualityScoreSum / s.qualityScoreCount : 0;

    return {
      totalExecutions: s.totalExecutions,
      successfulExecutions: s.successfulExecutions,
      avgAttemptsPerStep: avgAttempts,
      avgAttemptsForSuccess: successRate > 0 ? avgAttempts / successRate : 0,
      backtrackRate: s.totalExecutions > 0 ? s.backtrackCount / s.totalExecutions : 0,
      restartRate: s.totalExecutions > 0 ? s.restartCount / s.totalExecutions : 0,
      earlyStopRate: s.successfulExecutions > 0 ? s.earlyStopCount / s.successfulExecutions : 0,
      avgQualityScore: avgQuality,
    };
  }

  /**
   * Reset statistics.
   */
  resetStats(): void {
    this.stats = this.createEmptyStats();
  }
}

/**
 * Create a LATTS executor instance.
 */
export function createLattsExecutor(
  config?: Partial<LattsConfig>,
  verifier?: IVerifier,
  controller?: ILattsController
): LattsExecutor {
  return new LattsExecutor(config, verifier, controller);
}
