/**
 * Worker Dispatch integration for the orchestrate MCP tool (Issue #1303).
 *
 * Bridges AOrchestra agent plans to actual worker execution via
 * dispatchWorkers + composeWorkerPrompt. Opt-in via
 * NEXUS_AORCHESTRA_DISPATCH feature flag.
 *
 * @module mcp/tools/orchestrate-dispatch
 * (Source: Issue #1303, Epic #1299, arXiv:2602.20478)
 */

import type { ILogger } from '../../core/index.js';
import type { IModelAdapter } from '../../core/index.js';
import type { AgentPlan, AgentPlanEntry } from '../../orchestration/aorchestra/index.js';
import {
  dispatchWorkers,
  detectConflicts,
  type WorkerResult,
  type WorkerConflict,
} from '../../orchestration/aorchestra/index.js';
import { composeWorkerPrompt } from '../../orchestration/aorchestra/compose-worker-prompt.js';
import { synthesizeResults } from '../../orchestration/aorchestra/result-synthesizer.js';
import { getTimeProvider } from '../../core/index.js';
import type { ContentBlock } from '../../core/types/model.js';

// ============================================================================
// Constants
// ============================================================================

/** Maximum tokens for individual worker LLM responses. */
const WORKER_MAX_TOKENS = 4000;

// ============================================================================
// Types
// ============================================================================

/** Options for executing worker dispatch. */
export interface WorkerDispatchExecutionOptions {
  readonly agentPlan: AgentPlan;
  readonly taskDescription: string;
  readonly modelAdapter: IModelAdapter;
  readonly logger: ILogger;
  readonly maxConcurrency?: number;
  /** Opt-in: run synthesis LLM call to merge worker outputs (Issue #1309) */
  readonly synthesize?: boolean;
}

/** Result from worker dispatch execution. */
export interface WorkerDispatchResult {
  readonly results: readonly WorkerResult[];
  readonly totalWorkers: number;
  readonly successCount: number;
  readonly errorCount: number;
  readonly durationMs: number;
  readonly conflicts: readonly WorkerConflict[];
  /** Unified response from synthesis (only present when synthesize=true) */
  readonly synthesis?: string;
}

// ============================================================================
// Feature Flag
// ============================================================================

/** Checks if worker dispatch is enabled via feature flag. */
export function isWorkerDispatchEnabled(): boolean {
  return process.env['NEXUS_AORCHESTRA_DISPATCH'] === 'true';
}

// ============================================================================
// Internal: Worker Execution
// ============================================================================

function createWorkerExecutor(
  taskDescription: string,
  modelAdapter: IModelAdapter,
  logger: ILogger
): (entry: AgentPlanEntry, priorWaveResults?: readonly WorkerResult[]) => Promise<WorkerResult> {
  return async (
    entry: AgentPlanEntry,
    priorWaveResults?: readonly WorkerResult[]
  ): Promise<WorkerResult> => {
    const workerStartMs = getTimeProvider().now();
    const prompt = composeWorkerPrompt({
      entry,
      taskDescription,
      ...(priorWaveResults !== undefined ? { priorWaveResults } : {}),
    });

    try {
      const result = await modelAdapter.complete({
        messages: [{ role: 'user', content: prompt }],
        maxTokens: WORKER_MAX_TOKENS,
      });

      if (!result.ok) {
        return makeErrorResult(entry, workerStartMs, result.error.message);
      }

      const textContent = result.value.content
        .filter((b: ContentBlock): b is ContentBlock & { type: 'text' } => b.type === 'text')
        .map((b) => b.text)
        .join('\n');

      return {
        role: entry.role,
        subTask: entry.subTask,
        output: textContent,
        status: 'success',
        durationMs: getTimeProvider().now() - workerStartMs,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('Worker execution failed', { role: entry.role, error: message });
      return makeErrorResult(entry, workerStartMs, message);
    }
  };
}

function makeErrorResult(entry: AgentPlanEntry, startMs: number, message: string): WorkerResult {
  return {
    role: entry.role,
    subTask: entry.subTask,
    output: '',
    status: 'error',
    durationMs: getTimeProvider().now() - startMs,
    error: message,
  };
}

// ============================================================================
// Public API
// ============================================================================

/** Execute worker dispatch for an agent plan. */
export async function executeWorkerDispatch(
  options: WorkerDispatchExecutionOptions
): Promise<WorkerDispatchResult> {
  const { agentPlan, taskDescription, modelAdapter, logger, maxConcurrency, synthesize } = options;
  const startMs = getTimeProvider().now();

  logger.info('Starting worker dispatch', {
    totalExperts: agentPlan.totalExperts,
    taskType: agentPlan.taskType,
    complexity: agentPlan.complexity,
  });

  const results = await dispatchWorkers(agentPlan.entries, {
    ...(maxConcurrency !== undefined ? { maxConcurrency } : {}),
    executeWorker: createWorkerExecutor(taskDescription, modelAdapter, logger),
  });

  const baseResult = buildDispatchResult(results, startMs, logger);

  // Opt-in synthesis (Issue #1309)
  if (synthesize === true && baseResult.successCount > 0) {
    logger.info('Running result synthesis', { workerCount: baseResult.successCount });
    const synthResult = await synthesizeResults({
      results,
      conflicts: [...baseResult.conflicts],
      taskDescription,
      modelAdapter,
    });
    return { ...baseResult, synthesis: synthResult.value };
  }

  return baseResult;
}

function buildDispatchResult(
  results: WorkerResult[],
  startMs: number,
  logger: ILogger
): WorkerDispatchResult {
  const successCount = results.filter((r) => r.status === 'success').length;
  const errorCount = results.filter((r) => r.status === 'error').length;
  const conflicts = detectConflicts(results);

  if (conflicts.length > 0) {
    logger.warn('Worker output conflicts detected — human review recommended', {
      conflictCount: conflicts.length,
      files: conflicts.map((c) => c.filePath),
    });
  }

  const durationMs = getTimeProvider().now() - startMs;
  logger.info('Worker dispatch complete', {
    totalWorkers: results.length,
    successCount,
    errorCount,
    conflicts: conflicts.length,
    durationMs,
  });

  return { results, totalWorkers: results.length, successCount, errorCount, durationMs, conflicts };
}
