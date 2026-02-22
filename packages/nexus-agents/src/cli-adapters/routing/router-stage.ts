/**
 * Unified Router Stage Interface
 *
 * Provides a composable pipeline architecture for routing decisions.
 * Each stage can filter, score, or transform the routing context.
 *
 * Per ADR-0005, this consolidates 7 router implementations into
 * a unified stage-based pipeline.
 *
 * @module cli-adapters/routing/router-stage
 * (Source: Issue #574, ADR-0005)
 */

import { z } from 'zod';
import type { Result } from '../../core/result.js';
import type { CliNameLiteral } from '../../config/model-capabilities-types.js';

// ============================================================================
// Types
// ============================================================================

/**
 * CLI adapter names for routing.
 * Derived from canonical source: config/model-capabilities-types.ts CliNameLiteral
 */
export type CliName = CliNameLiteral;

/**
 * Routing context passed through pipeline stages.
 */
export interface RoutingContext {
  /** Original task description */
  readonly task: string;
  /** Task metadata */
  readonly metadata: Record<string, unknown> | undefined;
  /** Available CLI adapters to route to */
  readonly availableClis: readonly CliName[];
  /** Candidate scores accumulated by stages */
  readonly scores: Map<CliName, number>;
  /** Candidates filtered out by stages */
  readonly filtered: Map<CliName, string>;
  /** Signals collected from stages */
  readonly signals: string[];
  /** Stage execution trace */
  readonly trace: StageTrace[];
}

/**
 * Trace entry for a single stage execution.
 */
export interface StageTrace {
  readonly stageName: string;
  readonly durationMs: number;
  readonly action: 'filter' | 'score' | 'transform' | 'skip';
  readonly details: string | undefined;
}

/**
 * Result from a single routing stage.
 */
export interface StageResult {
  /** Updated context (immutable pattern - return new context) */
  readonly context: RoutingContext;
  /** Whether to continue to next stage */
  readonly continuesPipeline: boolean;
  /** Optional early decision (stops pipeline) */
  readonly decision?: RoutingDecision;
}

/**
 * Error from a routing stage.
 */
export interface StageError {
  readonly stage: string;
  readonly code: 'invalid_input' | 'no_candidates' | 'stage_failed' | 'timeout';
  readonly message: string;
  readonly cause: Error | undefined;
}

/**
 * Final routing decision.
 */
export interface RoutingDecision {
  /** Selected CLI adapter */
  readonly selectedCli: CliName;
  /** Confidence score (0-1) */
  readonly confidence: number;
  /** Human-readable reason */
  readonly reason: string;
  /** Alternative candidates in ranked order */
  readonly alternatives: readonly CliName[];
  /** Total routing time in ms */
  readonly routingTimeMs: number;
  /** Execution trace through pipeline */
  readonly trace: readonly StageTrace[];
}

/**
 * Outcome for feedback/calibration.
 */
export interface RoutingOutcome {
  /** The CLI that was selected */
  readonly selectedCli: CliName;
  /** The original task */
  readonly task: string;
  /** Whether the task succeeded */
  readonly success: boolean;
  /** Quality score (0-1) if available */
  readonly qualityScore?: number;
  /** Latency in ms */
  readonly latencyMs?: number;
  /** Tokens used */
  readonly tokensUsed?: number;
}

/**
 * Configuration for a routing stage.
 */
export interface StageConfig {
  /** Whether this stage is enabled */
  readonly enabled: boolean;
  /** Stage priority (lower = earlier in pipeline) */
  readonly priority: number;
  /** Stage-specific configuration */
  readonly options?: Record<string, unknown>;
}

// ============================================================================
// Interfaces
// ============================================================================

/**
 * A single stage in the routing pipeline.
 *
 * Stages can:
 * - Filter out candidates (set filtered map)
 * - Score candidates (update scores map)
 * - Transform context (add signals, metadata)
 * - Make early decisions (return decision in result)
 */
export interface IRouterStage {
  /** Unique stage name */
  readonly name: string;

  /** Stage priority (lower = earlier) */
  readonly priority: number;

  /**
   * Check if this stage can handle the given context.
   * Returning false skips the stage.
   */
  canHandle(ctx: RoutingContext): boolean;

  /**
   * Execute the routing stage.
   * Returns updated context or early decision.
   */
  route(ctx: RoutingContext): Promise<Result<StageResult, StageError>>;

  /**
   * Record outcome for learning/calibration (optional).
   */
  recordOutcome?(outcome: RoutingOutcome): void;

  /**
   * Get stage statistics (optional).
   */
  getStats?(): Record<string, unknown>;
}

/**
 * Composable routing pipeline.
 */
export interface IRoutingPipeline {
  /**
   * Execute the full pipeline.
   */
  execute(
    task: string,
    metadata?: Record<string, unknown>
  ): Promise<Result<RoutingDecision, StageError>>;

  /**
   * Add a stage to the pipeline.
   */
  addStage(stage: IRouterStage): void;

  /**
   * Remove a stage by name.
   */
  removeStage(name: string): boolean;

  /**
   * Get all stages in execution order.
   */
  getStages(): readonly IRouterStage[];

  /**
   * Record outcome for all stages that support feedback.
   */
  recordOutcome(outcome: RoutingOutcome): void;

  /**
   * Get pipeline statistics.
   */
  getStats(): PipelineStats;
}

/**
 * Pipeline execution statistics.
 */
export interface PipelineStats {
  readonly totalRoutings: number;
  readonly averageLatencyMs: number;
  readonly successRate: number;
  readonly stageStats: Record<string, Record<string, unknown>>;
}

// ============================================================================
// Zod Schemas
// ============================================================================

export const CliNameSchema = z.enum(['claude', 'gemini', 'codex']);

export const StageConfigSchema = z.object({
  enabled: z.boolean().default(true),
  priority: z.number().int().min(0).max(100).default(50),
  options: z.record(z.unknown()).optional(),
});

export const RoutingOutcomeSchema = z.object({
  selectedCli: CliNameSchema,
  task: z.string(),
  success: z.boolean(),
  qualityScore: z.number().min(0).max(1).optional(),
  latencyMs: z.number().int().positive().optional(),
  tokensUsed: z.number().int().positive().optional(),
});

// ============================================================================
// Helpers
// ============================================================================

/**
 * Creates an initial routing context.
 */
export function createRoutingContext(
  task: string,
  availableClis: readonly CliName[] = ['claude', 'gemini', 'codex'],
  metadata?: Record<string, unknown>
): RoutingContext {
  return {
    task,
    metadata,
    availableClis,
    scores: new Map(availableClis.map((cli) => [cli, 0])),
    filtered: new Map(),
    signals: [],
    trace: [],
  };
}

/**
 * Creates a stage error.
 */
export function createStageError(
  stage: string,
  code: StageError['code'],
  message: string,
  cause?: Error
): StageError {
  return { stage, code, message, cause };
}

/**
 * Adds a trace entry to the context.
 */
export function addTrace(
  ctx: RoutingContext,
  stageName: string,
  durationMs: number,
  action: StageTrace['action'],
  details?: string
): RoutingContext {
  return {
    ...ctx,
    trace: [...ctx.trace, { stageName, durationMs, action, details }],
  };
}

/**
 * Filters a candidate from the context.
 */
export function filterCandidate(ctx: RoutingContext, cli: CliName, reason: string): RoutingContext {
  const newFiltered = new Map(ctx.filtered);
  newFiltered.set(cli, reason);
  return { ...ctx, filtered: newFiltered };
}

/**
 * Updates a candidate's score in the context.
 */
export function updateScore(ctx: RoutingContext, cli: CliName, scoreDelta: number): RoutingContext {
  const newScores = new Map(ctx.scores);
  newScores.set(cli, (newScores.get(cli) ?? 0) + scoreDelta);
  return { ...ctx, scores: newScores };
}

/**
 * Gets remaining (non-filtered) candidates.
 */
export function getRemainingCandidates(ctx: RoutingContext): CliName[] {
  return ctx.availableClis.filter((cli) => !ctx.filtered.has(cli));
}

/**
 * Selects the best candidate based on scores.
 */
export function selectBestCandidate(
  ctx: RoutingContext
): { cli: CliName; score: number } | undefined {
  const remaining = getRemainingCandidates(ctx);
  const first = remaining[0];
  if (first === undefined) return undefined;

  let bestCli: CliName = first;
  let bestScore = ctx.scores.get(bestCli) ?? 0;

  for (const cli of remaining) {
    const score = ctx.scores.get(cli) ?? 0;
    if (score > bestScore) {
      bestCli = cli;
      bestScore = score;
    }
  }

  return { cli: bestCli, score: bestScore };
}
