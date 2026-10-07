/**
 * Per-expert context-budget observer (#2031, child of #1574).
 *
 * Non-blocking telemetry wrapper: after an expert call completes, read
 * tokensUsed from the result metadata, compare against the model's
 * context window, and emit a `context_warning` log entry when the
 * utilization ratio crosses a configurable threshold.
 *
 * Default threshold: 0.85 (85% of context window used). Operators can
 * override via `NEXUS_CONTEXT_WARN_THRESHOLD` env var.
 *
 * Runs AFTER `expert.execute(task)` returns — it cannot influence the
 * call itself. The observer is purely informational; downstream SWE-
 * bench work uses this telemetry to size tasks to fit fresh context
 * windows.
 *
 * @module mcp/tools/expert-context-observer
 */

import type { ILogger } from '../../core/index.js';
import { getModelContextWindow } from '../../config/model-config-helpers.js';
import type { ModelId } from '../../config/model-capabilities-types.js';

/** Default utilization threshold for emitting a context warning. */
export const DEFAULT_CONTEXT_WARN_THRESHOLD = 0.85;

/** Env-var name for overriding the default threshold. */
const CONTEXT_WARN_THRESHOLD_ENV = 'NEXUS_CONTEXT_WARN_THRESHOLD';

/**
 * Resolve the utilization threshold from environment or default.
 *
 * Invalid values (non-numeric, <= 0, > 1) silently fall back to the
 * default — this is a telemetry layer and must not fail startup on a
 * misconfiguration.
 */
export function resolveContextWarnThreshold(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env[CONTEXT_WARN_THRESHOLD_ENV];
  if (typeof raw !== 'string' || raw.length === 0) return DEFAULT_CONTEXT_WARN_THRESHOLD;
  const parsed = Number.parseFloat(raw);
  if (Number.isFinite(parsed) && parsed > 0 && parsed <= 1) return parsed;
  return DEFAULT_CONTEXT_WARN_THRESHOLD;
}

/**
 * Observation inputs — what the observer needs to decide whether to warn.
 */
export interface ExpertContextObservation {
  readonly expertId: string;
  readonly role: string;
  readonly modelId: ModelId | undefined;
  readonly tokensUsed: number;
  /**
   * Whether `tokensUsed` is a measurement (#4743). `false` means the adapter
   * reported no usage and the number is a placeholder zero; absent means the
   * producer predates the distinction.
   */
  readonly tokensMeasured?: boolean;
  readonly taskDescription: string;
  readonly durationMs: number;
}

/**
 * Utilization calculation result. Exported for tests + telemetry
 * consumers (e.g., the SWE-bench runner may aggregate these).
 */
export interface ContextUtilization {
  readonly tokensUsed: number;
  /** Undefined when no model window is known. */
  readonly contextWindow: number | undefined;
  /** Undefined when the window or token usage is unmeasured. */
  readonly utilization: number | undefined; // ratio; can exceed 1
  readonly warned: boolean;
  readonly threshold: number;
}

/**
 * Compute utilization without emitting a log entry. Separated so the
 * SWE-bench runner can aggregate stats across many calls without
 * spamming the log channel.
 */
export function computeExpertContextUtilization(
  observation: Pick<ExpertContextObservation, 'modelId' | 'tokensUsed' | 'tokensMeasured'>,
  threshold: number = DEFAULT_CONTEXT_WARN_THRESHOLD
): ContextUtilization {
  // No model means no window measurement (#7251), rather than an assumed one.
  const contextWindow =
    observation.modelId !== undefined ? getModelContextWindow(observation.modelId) : undefined;
  const utilization =
    contextWindow !== undefined && contextWindow > 0 && observation.tokensMeasured !== false
      ? observation.tokensUsed / contextWindow
      : undefined;
  return {
    tokensUsed: observation.tokensUsed,
    contextWindow,
    utilization,
    warned: utilization !== undefined && utilization >= threshold,
    threshold,
  };
}

/**
 * Observe + log. Called by the expert-execute path right after
 * `expert.execute(task)` returns. Logger is optional (tests may omit).
 *
 * Always non-throwing — observer failure must never break the caller.
 */
export function observeExpertContext(
  observation: ExpertContextObservation,
  logger?: ILogger,
  threshold: number = resolveContextWarnThreshold()
): ContextUtilization {
  try {
    const util = computeExpertContextUtilization(observation, threshold);
    if (util.warned && util.utilization !== undefined) {
      logger?.warn('context_warning', {
        event: 'context_warning',
        expertId: observation.expertId,
        role: observation.role,
        modelId: observation.modelId,
        tokensUsed: util.tokensUsed,
        contextWindow: util.contextWindow,
        utilizationPercent: Math.round(util.utilization * 100),
        thresholdPercent: Math.round(threshold * 100),
        durationMs: observation.durationMs,
        taskLength: observation.taskDescription.length,
      });
    } else {
      logger?.debug('context_utilization', {
        event: 'context_utilization',
        expertId: observation.expertId,
        role: observation.role,
        modelId: observation.modelId,
        utilizationPercent:
          util.utilization !== undefined ? Math.round(util.utilization * 100) : undefined,
      });
    }
    return util;
  } catch {
    // Telemetry must never throw or turn a failed measurement into a measured zero.
    return {
      tokensUsed: observation.tokensUsed,
      contextWindow: undefined,
      utilization: undefined,
      warned: false,
      threshold,
    };
  }
}
