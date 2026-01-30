/**
 * Quality-Constrained Model Router
 *
 * Implements quality-constrained routing from RouteLLM paper (arXiv:2406.18510).
 * Routes tasks to the cheapest model that meets quality requirements.
 *
 * Key metrics from paper:
 * - 2x cost reduction while maintaining quality
 * - Sub-150ms routing latency
 *
 * @module adapters/quality-router
 * (Source: Issue #128, arXiv:2406.18510)
 */

import type { Task, ILogger, Result, TaskType } from '../core/index.js';
import { ok, err, AgentError, createLogger, getTimeProvider } from '../core/index.js';
import type {
  ICliAdapter,
  CliTask,
  CliResponse,
  CliError,
  CliName,
  CapabilityProfile,
} from '../cli-adapters/types.js';
import { TaskComplexityEstimator, type ComplexityEstimate } from './complexity-estimator.js';

// Re-export complexity types
export type {
  ComplexityLevel,
  ComplexityEstimate,
  ComplexityFactors,
} from './complexity-estimator.js';
export { TaskComplexityEstimator, createComplexityEstimator } from './complexity-estimator.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Quality estimate for an adapter on a task.
 */
export interface QualityEstimate {
  readonly score: number;
  readonly confidence: number;
  readonly estimatedCostUsd: number;
  readonly estimatedLatencyMs: number;
  readonly capabilityMatch: number;
}

/**
 * Routing decision with full reasoning.
 */
export interface RoutingDecision {
  readonly selectedCli: CliName;
  readonly reason: string;
  readonly qualityEstimate: QualityEstimate;
  readonly alternatives: readonly AdapterCandidate[];
  readonly complexity: ComplexityEstimate;
  readonly routingLatencyMs: number;
}

/**
 * Candidate adapter with quality estimate.
 */
export interface AdapterCandidate {
  readonly cli: CliName;
  readonly quality: QualityEstimate;
  readonly rejectionReason?: string;
}

/**
 * Quality router configuration.
 */
export interface QualityRouterConfig {
  readonly minQuality?: number;
  readonly maxCostUsd?: number;
  readonly maxLatencyMs?: number;
  readonly logger?: ILogger;
  readonly costModel?: CostModel;
  readonly latencyModel?: LatencyModel;
}

/**
 * Cost model for adapter cost estimation.
 */
export interface CostModel {
  readonly claude: { inputPerMillion: number; outputPerMillion: number };
  readonly gemini: { inputPerMillion: number; outputPerMillion: number };
  readonly codex: { inputPerMillion: number; outputPerMillion: number };
}

/**
 * Latency model for adapter latency estimation.
 * Issue #529: Make latency parameters configurable.
 */
export interface LatencyModel {
  readonly claude: { baseMs: number; tokensPerSecond: number };
  readonly gemini: { baseMs: number; tokensPerSecond: number };
  readonly codex: { baseMs: number; tokensPerSecond: number };
}

/**
 * Execution result with quality metrics.
 */
export interface QualityRoutedResult {
  readonly response: CliResponse;
  readonly routing: RoutingDecision;
  readonly actualCostUsd: number | undefined;
  readonly actualLatencyMs: number;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_COST_MODEL: CostModel = {
  claude: { inputPerMillion: 3.0, outputPerMillion: 15.0 },
  gemini: { inputPerMillion: 0.075, outputPerMillion: 0.3 },
  codex: { inputPerMillion: 2.0, outputPerMillion: 8.0 },
} as const;

/** Default latency model (Issue #529) */
const DEFAULT_LATENCY_MODEL: LatencyModel = {
  claude: { baseMs: 500, tokensPerSecond: 80 },
  gemini: { baseMs: 400, tokensPerSecond: 100 },
  codex: { baseMs: 300, tokensPerSecond: 120 },
} as const;

// ============================================================================
// Quality Router
// ============================================================================

/** Default configuration values. */
const QUALITY_DEFAULTS = {
  minQuality: 0.7,
  maxCostUsd: Infinity,
  maxLatencyMs: Infinity,
  costModel: DEFAULT_COST_MODEL,
  latencyModel: DEFAULT_LATENCY_MODEL,
} as const;

type ResolvedConfig = {
  minQuality: number;
  maxCostUsd: number;
  maxLatencyMs: number;
  costModel: CostModel;
  latencyModel: LatencyModel;
  logger: ILogger;
};

function resolveQualityConfig(config: QualityRouterConfig | undefined): ResolvedConfig {
  const base = { ...QUALITY_DEFAULTS, logger: createLogger({ component: 'quality-router' }) };
  if (!config) return base;
  return {
    minQuality: config.minQuality ?? base.minQuality,
    maxCostUsd: config.maxCostUsd ?? base.maxCostUsd,
    maxLatencyMs: config.maxLatencyMs ?? base.maxLatencyMs,
    costModel: config.costModel ?? base.costModel,
    latencyModel: config.latencyModel ?? base.latencyModel,
    logger: config.logger ?? base.logger,
  };
}

/**
 * Quality-Constrained Router.
 * Routes tasks to the cheapest model that meets quality requirements.
 */
export class QualityRouter {
  private readonly minQuality: number;
  private readonly maxCostUsd: number;
  private readonly maxLatencyMs: number;
  private readonly costModel: CostModel;
  private readonly latencyModel: LatencyModel;
  private readonly log: ILogger;
  private readonly complexityEstimator: TaskComplexityEstimator;
  private readonly adapters = new Map<CliName, ICliAdapter>();

  constructor(config?: QualityRouterConfig) {
    const resolved = resolveQualityConfig(config);
    this.minQuality = resolved.minQuality;
    this.maxCostUsd = resolved.maxCostUsd;
    this.maxLatencyMs = resolved.maxLatencyMs;
    this.costModel = resolved.costModel;
    this.latencyModel = resolved.latencyModel;
    this.log = resolved.logger;
    this.complexityEstimator = new TaskComplexityEstimator(this.log);
  }

  registerAdapter(adapter: ICliAdapter): void {
    this.adapters.set(adapter.name, adapter);
    this.log.info('Adapter registered', { name: adapter.name });
  }

  route(task: Task): Result<RoutingDecision, AgentError> {
    const startTime = getTimeProvider().now();
    if (this.adapters.size === 0) {
      return err(new AgentError('No adapters registered'));
    }

    const complexity = this.complexityEstimator.estimate(task);
    const candidates = this.evaluateCandidates(task, complexity);
    const selected = this.selectBestCandidate(candidates);

    if (selected === null) {
      return err(new AgentError('No suitable adapter found'));
    }

    return ok(
      this.buildDecision(selected, candidates, complexity, getTimeProvider().now() - startTime)
    );
  }

  async execute(task: Task): Promise<Result<QualityRoutedResult, AgentError | CliError>> {
    const routeResult = this.route(task);
    if (!routeResult.ok) return err(routeResult.error);

    const decision = routeResult.value;
    const adapter = this.adapters.get(decision.selectedCli);
    if (!adapter) return err(new AgentError(`Adapter not found: ${decision.selectedCli}`));

    const cliTask = this.buildCliTask(task);
    const startTime = getTimeProvider().now();
    const execResult = await adapter.execute(cliTask);
    const actualLatencyMs = getTimeProvider().now() - startTime;

    if (!execResult.ok) return err(execResult.error);

    return ok({
      response: execResult.value,
      routing: decision,
      actualCostUsd: execResult.value.costUsd,
      actualLatencyMs,
    });
  }

  private evaluateCandidates(task: Task, complexity: ComplexityEstimate): AdapterCandidate[] {
    const candidates: AdapterCandidate[] = [];
    for (const [cli, adapter] of this.adapters) {
      const quality = this.estimateQuality(task, cli, adapter.capabilities, complexity);
      candidates.push({ cli, quality });
    }
    return candidates;
  }

  private selectBestCandidate(candidates: AdapterCandidate[]): AdapterCandidate | null {
    candidates.sort((a, b) => a.quality.estimatedCostUsd - b.quality.estimatedCostUsd);

    for (const candidate of candidates) {
      if (this.meetsConstraints(candidate.quality)) return candidate;
      (candidate as { rejectionReason?: string }).rejectionReason = this.getRejectionReason(
        candidate.quality
      );
    }

    candidates.sort((a, b) => b.quality.score - a.quality.score);
    const fallback = candidates[0];
    if (fallback) {
      this.log.warn('No adapter meets constraints, using highest quality', {
        selected: fallback.cli,
        quality: fallback.quality.score,
      });
      return fallback;
    }
    return null;
  }

  private buildDecision(
    selected: AdapterCandidate,
    candidates: AdapterCandidate[],
    complexity: ComplexityEstimate,
    routingLatencyMs: number
  ): RoutingDecision {
    const decision: RoutingDecision = {
      selectedCli: selected.cli,
      reason: this.buildReason(selected, complexity),
      qualityEstimate: selected.quality,
      alternatives: candidates.filter((c) => c.cli !== selected.cli),
      complexity,
      routingLatencyMs,
    };

    this.log.info('Routing decision', {
      selected: decision.selectedCli,
      quality: selected.quality.score.toFixed(2),
      cost: selected.quality.estimatedCostUsd.toFixed(4),
      complexity: complexity.level,
      latencyMs: routingLatencyMs,
    });

    return decision;
  }

  private buildCliTask(task: Task): CliTask {
    const systemPrompt = task.context.metadata?.['systemPrompt'];
    return {
      content: task.description,
      ...(typeof systemPrompt === 'string' ? { systemPrompt } : {}),
    };
  }

  private estimateQuality(
    task: Task,
    cli: CliName,
    capabilities: CapabilityProfile,
    complexity: ComplexityEstimate
  ): QualityEstimate {
    const capabilityMatch = this.computeCapabilityMatch(complexity, capabilities);
    const complexityPenalty = complexity.score * 0.2;
    const taskTypeBonus = this.getTaskTypeBonus(cli, complexity.taskType);
    const score = Math.max(0, Math.min(1, capabilityMatch - complexityPenalty + taskTypeBonus));

    const estimatedTokens = this.estimateTokens(task);
    const costs = this.costModel[cli];
    const estimatedCostUsd =
      (estimatedTokens.input * costs.inputPerMillion +
        estimatedTokens.output * costs.outputPerMillion) /
      1_000_000;
    const estimatedLatencyMs = this.estimateLatency(cli, estimatedTokens.output);
    const confidence = Math.min(
      1,
      0.5 + complexity.taskTypeConfidence * 0.3 + capabilityMatch * 0.2
    );

    return { score, confidence, estimatedCostUsd, estimatedLatencyMs, capabilityMatch };
  }

  private computeCapabilityMatch(
    complexity: ComplexityEstimate,
    capabilities: CapabilityProfile
  ): number {
    const weights = this.getCapabilityWeights(complexity);
    const n = {
      r: capabilities.reasoning / 10,
      c: capabilities.codeGeneration / 10,
      s: capabilities.speed / 10,
      co: capabilities.cost / 10,
    };
    return (
      n.r * weights.reasoning +
      n.c * weights.codeGeneration +
      n.s * weights.speed +
      n.co * weights.cost
    );
  }

  private getCapabilityWeights(complexity: ComplexityEstimate): {
    reasoning: number;
    codeGeneration: number;
    speed: number;
    cost: number;
  } {
    if (complexity.taskType === 'reasoning')
      return { reasoning: 0.5, codeGeneration: 0.2, speed: 0.1, cost: 0.2 };
    if (complexity.factors.toolFactor > 0.5)
      return { reasoning: 0.2, codeGeneration: 0.5, speed: 0.1, cost: 0.2 };
    if (complexity.level === 'simple')
      return { reasoning: 0.2, codeGeneration: 0.2, speed: 0.3, cost: 0.3 };
    return { reasoning: 0.35, codeGeneration: 0.35, speed: 0.1, cost: 0.2 };
  }

  private getTaskTypeBonus(cli: CliName, taskType: TaskType): number {
    if (taskType === 'reasoning') return cli === 'claude' ? 0.15 : cli === 'codex' ? 0.1 : 0.05;
    if (taskType === 'knowledge') return cli === 'gemini' ? 0.1 : 0.05;
    return 0;
  }

  private estimateTokens(task: Task): { input: number; output: number } {
    const content = task.description + JSON.stringify(task.context.history ?? []);
    const inputTokens = Math.ceil(content.length / 4);
    return { input: inputTokens, output: Math.ceil(inputTokens * 1.5) };
  }

  private estimateLatency(cli: CliName, outputTokens: number): number {
    const model = this.latencyModel[cli];
    return model.baseMs + (outputTokens / model.tokensPerSecond) * 1000;
  }

  private meetsConstraints(quality: QualityEstimate): boolean {
    return (
      quality.score >= this.minQuality &&
      quality.estimatedCostUsd <= this.maxCostUsd &&
      quality.estimatedLatencyMs <= this.maxLatencyMs
    );
  }

  private getRejectionReason(quality: QualityEstimate): string {
    const reasons: string[] = [];
    if (quality.score < this.minQuality)
      reasons.push(`quality ${quality.score.toFixed(2)} < ${String(this.minQuality)}`);
    if (quality.estimatedCostUsd > this.maxCostUsd)
      reasons.push(`cost $${quality.estimatedCostUsd.toFixed(4)} > $${String(this.maxCostUsd)}`);
    if (quality.estimatedLatencyMs > this.maxLatencyMs)
      reasons.push(
        `latency ${String(quality.estimatedLatencyMs)}ms > ${String(this.maxLatencyMs)}ms`
      );
    return reasons.join(', ');
  }

  private buildReason(selected: AdapterCandidate, complexity: ComplexityEstimate): string {
    const c = complexity;
    const q = selected.quality;
    return `Task complexity: ${c.level} (${String(Math.round(c.score * 100))}%); Task type: ${c.taskType}; Quality: ${String(Math.round(q.score * 100))}%; Cost: $${q.estimatedCostUsd.toFixed(4)}`;
  }
}

/**
 * Creates a quality router with default configuration.
 */
export function createQualityRouter(config?: QualityRouterConfig): QualityRouter {
  return new QualityRouter(config);
}
