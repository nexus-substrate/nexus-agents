/**
 * Puppeteer Orchestrator Helpers
 *
 * Helper functions for the Puppeteer orchestrator.
 *
 * @module agents/orchestration/puppeteer-helpers
 * (Source: Issue #335, arXiv:2505.19591)
 */

import { randomUUID } from 'node:crypto';
import { DEFAULT_COST_PER_1K_TOKENS, tokensToCostUsd } from './puppeteer-config-types.js';
import type { Task, TaskResult } from '../../core/index.js';
import { getTimeProvider } from '../../core/index.js';
import type {
  PuppeteerState,
  PuppeteerStepResult,
  PuppeteerResult,
  PuppeteerMetrics,
  EmergentPatterns,
  PuppeteerTerminationReason,
  AgentStepOutput,
  AgentDistribution,
} from './puppeteer-types.js';
import { calculateCompactionScore } from './pattern-tracker.js';

// =============================================================================
// Session ID Generation
// =============================================================================

/**
 * Generate a unique session ID.
 */
export function generateSessionId(): string {
  return `puppeteer-${randomUUID().slice(0, 8)}`;
}

// =============================================================================
// Reward Computation
// =============================================================================

/**
 * Configuration for reward computation.
 */
export interface RewardConfig {
  /** Weight for efficiency (negative for high cost/time) */
  readonly efficiencyWeight: number;
  /** Weight for progress */
  readonly progressWeight: number;
  /** Maximum cost for normalization */
  readonly maxCost: number;
  /** Maximum time in ms for normalization */
  readonly maxTime: number;
  /** Cost rate in USD per 1,000 tokens for the efficiency penalty (#5171). */
  readonly costPer1KTokens: number;
}

/** Default reward configuration. */
export const DEFAULT_REWARD_CONFIG: RewardConfig = {
  efficiencyWeight: 0.1,
  progressWeight: 0.5,
  maxCost: 1.0,
  maxTime: 300000,
  costPer1KTokens: DEFAULT_COST_PER_1K_TOKENS,
};

/**
 * Compute reward for a single step.
 */
export function computeStepReward(
  output: AgentStepOutput,
  progressDelta: number,
  config: RewardConfig = DEFAULT_REWARD_CONFIG
): number | null {
  // #4766: the cost penalty is `tokensUsed * rate`, so a step whose adapter
  // reported nothing paid ZERO and outscored one that reported honestly — the
  // reward preferred the step it knew least about. There is no defensible
  // per-step substitute (a mean or a worst-case would invent a number for
  // THIS step), so an unmeasured step is excluded from the trajectory the
  // learner fits. Decided by a 7-voter panel, option B.
  //
  // A MEASURED zero is still scored: absence and a real zero are different.
  if (output.tokensMeasured === false) return null;

  // Progress reward
  const progressReward = progressDelta * config.progressWeight;

  // Efficiency penalty (higher cost/time = lower reward)
  const costPenalty = tokensToCostUsd(output.tokensUsed, config.costPer1KTokens) / config.maxCost;
  const timePenalty = output.durationMs / config.maxTime;
  const efficiencyPenalty = (costPenalty + timePenalty) * config.efficiencyWeight;

  return progressReward - efficiencyPenalty;
}

/**
 * Compute final reward for task completion.
 */
export function computeFinalReward(
  success: boolean,
  totalSteps: number,
  totalCost: number,
  totalTime: number,
  config: RewardConfig = DEFAULT_REWARD_CONFIG
): number {
  // Completion reward
  const completionReward = success ? 1.0 : 0.0;

  // Efficiency bonus for completing in fewer steps/lower cost
  const stepEfficiency = Math.max(0, 1 - totalSteps / 10) * 0.2;
  const costEfficiency = Math.max(0, 1 - totalCost / config.maxCost) * 0.1;
  const timeEfficiency = Math.max(0, 1 - totalTime / config.maxTime) * 0.1;

  return completionReward + stepEfficiency + costEfficiency + timeEfficiency;
}

// =============================================================================
// Termination Detection
// =============================================================================

/**
 * Check if the output indicates task completion.
 */
export function detectTaskCompletion(output: AgentStepOutput): boolean {
  const outputStr = formatOutputString(output.output);
  const completionPatterns = [
    /\btask\s+complete\b/i,
    /\bfinished\b/i,
    /\bdone\b/i,
    /\bverified\s+successfully\b/i,
    /\ball\s+requirements\s+met\b/i,
  ];

  return completionPatterns.some((pattern) => pattern.test(outputStr));
}

/**
 * Check for convergence (output not changing significantly).
 */
export function detectConvergence(
  outputs: readonly AgentStepOutput[],
  threshold: number = 0.9
): boolean {
  if (outputs.length < 3) return false;

  const recent = outputs.slice(-3);
  const strings = recent.map((o) => formatOutputString(o.output));

  // Simple similarity check
  const lastTwo = strings.slice(-2);
  if (lastTwo.length !== 2) return false;

  const first = lastTwo[0];
  const second = lastTwo[1];
  if (first === undefined || second === undefined) return false;

  const similarity = computeStringSimilarity(first, second);
  return similarity >= threshold;
}

/**
 * Compute string similarity (Jaccard-like).
 */
function computeStringSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/));
  const wordsB = new Set(b.toLowerCase().split(/\s+/));

  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++;
  }

  const union = wordsA.size + wordsB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * Format output to string.
 */
export function formatOutputString(output: unknown): string {
  if (typeof output === 'string') return output;
  if (output === null || output === undefined) return '';
  return JSON.stringify(output);
}

// =============================================================================
// Metrics Computation
// =============================================================================

/**
 * Compute orchestration metrics from trajectory.
 */
export function computeMetrics(
  trajectory: readonly PuppeteerStepResult[],
  emergentPatterns: EmergentPatterns,
  success: boolean
): PuppeteerMetrics {
  if (trajectory.length === 0) {
    return {
      avgReward: 0,
      scoredSteps: 0,
      taskCompletionRate: success ? 1 : 0,
      efficiencyScore: 0,
      compactionScore: 0,
      cyclicalityScore: 0,
    };
  }

  // Average over SCORED steps only. A step excluded for unmeasured usage
  // (#4766) has no reward to average, and counting it as 0 would reintroduce
  // the same distortion at the trajectory level. `scoredSteps` reports the
  // coverage so the mean is not read as covering the whole trajectory.
  const scored = trajectory.filter(
    (step): step is PuppeteerStepResult & { reward: number } => step.reward !== null
  );
  const avgReward =
    scored.length > 0 ? scored.reduce((sum, step) => sum + step.reward, 0) / scored.length : 0;

  // Efficiency score (lower is better: fewer steps, less cost)
  const totalTokens = trajectory.reduce((sum, s) => sum + s.agentOutput.tokensUsed, 0);
  const totalTime = trajectory.reduce((sum, s) => sum + s.agentOutput.durationMs, 0);
  const efficiencyScore = totalTokens / 10000 + totalTime / 300000 + trajectory.length / 10;

  // Compaction score from hub agents
  const compactionScore = calculateCompactionScore(emergentPatterns.hubAgents);

  return {
    avgReward: Math.round(avgReward * 1000) / 1000,
    scoredSteps: scored.length,
    taskCompletionRate: success ? 1 : 0,
    efficiencyScore: Math.round(efficiencyScore * 1000) / 1000,
    compactionScore: Math.round(compactionScore * 100) / 100,
    cyclicalityScore: emergentPatterns.cyclicalityScore,
  };
}

// =============================================================================
// Result Building
// =============================================================================

/** Trailing scalars for {@link buildPuppeteerResult}, grouped to keep the arity sane. */
export interface BuildResultOptions {
  readonly sessionId: string;
  readonly startTime: number;
  /** USD per 1,000 tokens; defaults to {@link DEFAULT_COST_PER_1K_TOKENS} (#5171). */
  readonly costPer1KTokens?: number;
}

/**
 * Build the final Puppeteer result.
 */
export function buildPuppeteerResult(
  trajectory: readonly PuppeteerStepResult[],
  emergentPatterns: EmergentPatterns,
  terminationReason: PuppeteerTerminationReason,
  options: BuildResultOptions
): PuppeteerResult {
  const { sessionId, startTime, costPer1KTokens = DEFAULT_COST_PER_1K_TOKENS } = options;
  const success = terminationReason === 'task_complete';
  const totalDurationMs = getTimeProvider().now() - startTime;

  // Get final output
  const lastStep = trajectory[trajectory.length - 1];
  const output = lastStep?.agentOutput.output ?? null;

  // Compute totals
  const totalTokens = trajectory.reduce((sum, s) => sum + s.agentOutput.tokensUsed, 0);
  const totalCost = tokensToCostUsd(totalTokens, costPer1KTokens);

  // Compute metrics
  const metrics = computeMetrics(trajectory, emergentPatterns, success);

  return {
    success,
    output,
    trajectory,
    totalSteps: trajectory.length,
    totalDurationMs,
    totalTokens,
    totalCost,
    emergentPatterns,
    metrics,
    terminationReason,
    sessionId,
  };
}

// =============================================================================
// Agent Output Building
// =============================================================================

/**
 * Build agent step output from task result.
 */
export function buildAgentStepOutput(
  step: number,
  agentId: string,
  result: TaskResult
): AgentStepOutput {
  return {
    step,
    agentId,
    output: result.output,
    durationMs: result.metadata.durationMs,
    tokensUsed: result.metadata.tokensUsed,
    ...(result.metadata.tokensMeasured === undefined
      ? {}
      : { tokensMeasured: result.metadata.tokensMeasured }),
    model: result.metadata.model,
  };
}

// =============================================================================
// Task Building
// =============================================================================

/**
 * Build task for an agent based on current state.
 */
export function buildAgentTask(originalTask: Task, state: PuppeteerState, context: string): Task {
  const task: Task = {
    id: `${originalTask.id}-step-${String(state.step)}`,
    description: `${originalTask.description}\n\nContext:\n${context}`,
    context: {
      ...originalTask.context,
      metadata: {
        ...originalTask.context.metadata,
        puppeteerStep: state.step,
        puppeteerSessionId: state.sessionId,
      },
    },
  };

  if (originalTask.constraints !== undefined) {
    return { ...task, constraints: originalTask.constraints };
  }

  if (originalTask.priority !== undefined) {
    return { ...task, priority: originalTask.priority };
  }

  return task;
}

// =============================================================================
// Step Result Building
// =============================================================================

/**
 * Options for building a step result.
 */
export interface BuildStepResultOptions {
  readonly selectedAgent: string;
  readonly distribution: AgentDistribution;
  readonly agentOutput: AgentStepOutput;
  readonly newState: PuppeteerState;
  readonly previousProgress: number;
  readonly shouldTerminate: boolean;
  readonly terminationReason?: PuppeteerTerminationReason;
}

/**
 * Build step result from execution.
 */
export function buildStepResult(options: BuildStepResultOptions): PuppeteerStepResult {
  const {
    selectedAgent,
    distribution,
    agentOutput,
    newState,
    previousProgress,
    shouldTerminate,
    terminationReason,
  } = options;
  const progressDelta = newState.metadata.progress - previousProgress;
  const reward = computeStepReward(agentOutput, progressDelta);

  const base: PuppeteerStepResult = {
    selectedAgent,
    distribution,
    agentOutput,
    newState,
    reward,
    shouldTerminate,
  };

  if (terminationReason !== undefined) {
    return { ...base, terminationReason };
  }

  return base;
}
