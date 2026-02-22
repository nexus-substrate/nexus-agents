/**
 * Capability Match Stage
 *
 * Scores candidates based on capability profile matching to task requirements.
 * Uses weighted multi-criteria scoring based on task type.
 *
 * @module cli-adapters/routing/stages/capability-match-stage
 * (Source: ADR-0005, arXiv:2508.21141 - PILOT pattern)
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

// ============================================================================
// Configuration
// ============================================================================

/**
 * Task type categories for capability matching.
 */
type TaskType = 'reasoning' | 'code' | 'creative' | 'general';

/**
 * Capability dimensions for scoring.
 */
interface CapabilityProfile {
  readonly reasoning: number; // 0-10
  readonly codeGeneration: number; // 0-10
  readonly speed: number; // 0-10
  readonly costEfficiency: number; // 0-10
}

/**
 * Capability weights by dimension.
 */
interface CapabilityWeights {
  readonly reasoning: number;
  readonly codeGeneration: number;
  readonly speed: number;
  readonly costEfficiency: number;
}

/**
 * CLI capability profiles (0-10 scale).
 */
const CLI_CAPABILITIES: Record<CliName, CapabilityProfile> = {
  claude: { reasoning: 10, codeGeneration: 8, speed: 5, costEfficiency: 3 },
  gemini: { reasoning: 7, codeGeneration: 7, speed: 9, costEfficiency: 9 },
  codex: { reasoning: 6, codeGeneration: 10, speed: 8, costEfficiency: 7 },
  opencode: { reasoning: 7, codeGeneration: 8, speed: 7, costEfficiency: 6 },
};

/**
 * Task type indicators for classification.
 */
const TASK_TYPE_INDICATORS: Record<TaskType, string[]> = {
  reasoning: ['analyze', 'explain', 'why', 'reason', 'think', 'consider', 'evaluate', 'compare'],
  code: ['implement', 'code', 'function', 'class', 'bug', 'fix', 'refactor', 'test', 'debug'],
  creative: ['write', 'create', 'design', 'generate', 'story', 'content', 'draft'],
  general: ['help', 'what', 'how', 'show', 'list', 'find', 'search'],
};

/**
 * Configuration for the capability match stage.
 */
export interface CapabilityMatchConfig {
  /** Weight for capability scoring in overall score */
  readonly capabilityWeight: number;
  /** Bonus for task-type specialization */
  readonly specializationBonus: number;
  /** Enable debug logging */
  readonly debug: boolean;
}

const DEFAULT_CONFIG: CapabilityMatchConfig = {
  capabilityWeight: 0.4,
  specializationBonus: 0.15,
  debug: false,
};

// ============================================================================
// Stage Implementation
// ============================================================================

/**
 * Capability Match Stage for task-aware routing.
 * Runs after confidence (priority 35) to add capability-based scoring.
 */
export class CapabilityMatchStage implements IRouterStage {
  readonly name = 'capability-match';
  readonly priority = 35; // After confidence, before zero

  private readonly config: CapabilityMatchConfig;
  private readonly logger: ILogger;
  private routingsCount = 0;
  private taskTypeDistribution: Record<TaskType, number> = {
    reasoning: 0,
    code: 0,
    creative: 0,
    general: 0,
  };

  constructor(config: Partial<CapabilityMatchConfig> = {}, logger?: ILogger) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger ?? createLogger({ component: 'CapabilityMatchStage' });
  }

  canHandle(ctx: RoutingContext): boolean {
    return getRemainingCandidates(ctx).length > 0;
  }

  route(ctx: RoutingContext): Promise<Result<StageResult, StageError>> {
    const time = getTimeProvider();
    const startTime = time.now();
    const remaining = getRemainingCandidates(ctx);

    this.routingsCount++;

    const taskType = this.classifyTaskType(ctx.task);
    this.taskTypeDistribution[taskType]++;

    const weights = this.getCapabilityWeights(taskType);
    let updatedCtx = ctx;
    const scores: Array<{ cli: CliName; score: number; dominant: string }> = [];

    for (const cli of remaining) {
      const { score, dominant } = this.calculateCapabilityMatch(cli, weights, taskType);
      scores.push({ cli, score, dominant });
      updatedCtx = updateScore(updatedCtx, cli, score * this.config.capabilityWeight);
    }

    const signals = this.buildSignals(ctx.signals, taskType, scores);
    const durationMs = time.now() - startTime;

    const finalCtx = addTrace(
      updatedCtx,
      this.name,
      durationMs,
      'score',
      `TaskType: ${taskType}, candidates: ${String(remaining.length)}`
    );

    this.logger.debug('Capability match complete', {
      taskType,
      scores: scores.map((s) => `${s.cli}:${s.score.toFixed(2)}(${s.dominant})`),
    });

    return Promise.resolve(ok({ context: { ...finalCtx, signals }, continuesPipeline: true }));
  }

  recordOutcome(outcome: RoutingOutcome): void {
    this.logger.debug('Capability outcome recorded', {
      cli: outcome.selectedCli,
      success: outcome.success,
      qualityScore: outcome.qualityScore,
    });
  }

  getStats(): Record<string, unknown> {
    return {
      routingsCount: this.routingsCount,
      taskTypeDistribution: { ...this.taskTypeDistribution },
      config: {
        capabilityWeight: this.config.capabilityWeight,
        specializationBonus: this.config.specializationBonus,
      },
    };
  }

  /**
   * Classify task type from content.
   */
  private classifyTaskType(task: string): TaskType {
    const content = task.toLowerCase();
    const counts: Record<TaskType, number> = { reasoning: 0, code: 0, creative: 0, general: 0 };

    for (const [type, indicators] of Object.entries(TASK_TYPE_INDICATORS)) {
      counts[type as TaskType] = indicators.filter((i) => content.includes(i)).length;
    }

    const maxCount = Math.max(...Object.values(counts));
    if (maxCount === 0) return 'general';

    const entries = Object.entries(counts) as Array<[TaskType, number]>;
    const sorted = entries.sort((a, b) => b[1] - a[1]);
    return sorted[0]?.[0] ?? 'general';
  }

  /**
   * Get capability weights based on task type.
   */
  private getCapabilityWeights(taskType: TaskType): CapabilityWeights {
    switch (taskType) {
      case 'reasoning':
        return { reasoning: 0.5, codeGeneration: 0.2, speed: 0.1, costEfficiency: 0.2 };
      case 'code':
        return { reasoning: 0.2, codeGeneration: 0.5, speed: 0.1, costEfficiency: 0.2 };
      case 'creative':
        return { reasoning: 0.3, codeGeneration: 0.1, speed: 0.2, costEfficiency: 0.4 };
      case 'general':
        return { reasoning: 0.25, codeGeneration: 0.25, speed: 0.25, costEfficiency: 0.25 };
    }
  }

  /**
   * Calculate capability match score for a CLI.
   */
  private calculateCapabilityMatch(
    cli: CliName,
    weights: CapabilityWeights,
    taskType: TaskType
  ): { score: number; dominant: string } {
    const caps = CLI_CAPABILITIES[cli];

    // Normalize capabilities to 0-1 scale
    const normalized = {
      reasoning: caps.reasoning / 10,
      codeGeneration: caps.codeGeneration / 10,
      speed: caps.speed / 10,
      costEfficiency: caps.costEfficiency / 10,
    };

    // Calculate weighted score
    let score =
      normalized.reasoning * weights.reasoning +
      normalized.codeGeneration * weights.codeGeneration +
      normalized.speed * weights.speed +
      normalized.costEfficiency * weights.costEfficiency;

    // Add specialization bonus
    if (taskType === 'reasoning' && cli === 'claude') {
      score += this.config.specializationBonus;
    } else if (taskType === 'code' && cli === 'codex') {
      score += this.config.specializationBonus;
    }

    // Find dominant capability
    const capEntries = Object.entries(normalized);
    const sorted = capEntries.sort((a, b) => b[1] - a[1]);
    const dominant = sorted[0]?.[0] ?? 'balanced';

    return { score: Math.min(1, score), dominant };
  }

  /**
   * Build routing signals for the context.
   */
  private buildSignals(
    existing: string[],
    taskType: TaskType,
    scores: Array<{ cli: CliName; score: number; dominant: string }>
  ): string[] {
    const signals = [...existing];

    signals.push(`capability:task-${taskType}`);

    const best = [...scores].sort((a, b) => b.score - a.score)[0];
    if (best !== undefined) {
      signals.push(`capability:best-${best.cli}`);
      signals.push(`capability:dominant-${best.dominant}`);
    }

    return signals;
  }
}

/**
 * Creates a capability match stage.
 */
export function createCapabilityMatchStage(
  config?: Partial<CapabilityMatchConfig>,
  logger?: ILogger
): CapabilityMatchStage {
  return new CapabilityMatchStage(config, logger);
}
