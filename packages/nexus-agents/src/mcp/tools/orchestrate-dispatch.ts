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
import { createLogger, getErrorMessage } from '../../core/index.js';
import { resolveV2Config } from '../../pipeline/v2-config.js';
import type { AgentPlan, AgentPlanEntry } from '../../orchestration/aorchestra/index.js';
import {
  dispatchWorkers,
  detectConflicts,
  type WorkerResult,
  type WorkerConflict,
} from '../../orchestration/aorchestra/index.js';
import { composeWorkerPrompt } from '../../orchestration/aorchestra/compose-worker-prompt.js';
import type { WorkerLearning } from '../../orchestration/aorchestra/compose-worker-prompt.js';
import {
  synthesizeResults,
  type SynthesisSource,
} from '../../orchestration/aorchestra/result-synthesizer.js';
import { getTimeProvider } from '../../core/index.js';
import type { ContentBlock } from '../../core/types/model.js';
import { DEFAULT_CLI } from '../../config/model-capabilities-types.js';
import { resolveAdapterForRole } from './create-expert-routing.js';
import { detectTaskCategory } from '../../config/task-specialization.js';
import { getPipelineEventBus } from '../../pipeline/event-bus.js';
import {
  getOutcomeStore,
  categorizeOutcomeErrorMessage,
} from '../../orchestration/outcomes/index.js';
import type { OutcomeFailureCategory } from '../../orchestration/outcomes/index.js';

// ============================================================================
// Constants
// ============================================================================

const logger = createLogger({ component: 'orchestrate-dispatch' });

/** Maximum tokens for individual worker LLM responses. */
const WORKER_MAX_TOKENS = 4000;

/** Resolves max worker calls from env or option (#1321). */
function resolveMaxWorkerCalls(option?: number): number {
  if (option !== undefined) return option;
  const env = process.env['NEXUS_WORKER_MAX_CALLS'];
  if (env !== undefined) {
    const parsed = Number(env);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_MAX_WORKER_CALLS;
}

// ============================================================================
// Types
// ============================================================================

/** Default maximum model calls per orchestrate invocation (#1321). */
export const DEFAULT_MAX_WORKER_CALLS = 6;

/** Options for executing worker dispatch. */
export interface WorkerDispatchExecutionOptions {
  readonly agentPlan: AgentPlan;
  readonly taskDescription: string;
  readonly modelAdapter: IModelAdapter;
  readonly logger: ILogger;
  readonly maxConcurrency?: number;
  /** Opt-in: run synthesis LLM call to merge worker outputs (Issue #1309) */
  readonly synthesize?: boolean;
  /** Max model calls per invocation (default: 6, env: NEXUS_WORKER_MAX_CALLS) (#1321) */
  readonly maxWorkerCalls?: number;
  /** Opt-in: re-dispatch failed workers if quality is low and budget allows (Issue #1389) */
  readonly refine?: boolean;
  /** Optional learnings from session memory for worker prompt enrichment (Issue #1415) */
  readonly learnings?: readonly WorkerLearning[];
  /** Opt-in: route each worker to its task-optimal CLI via specialization matrix (Issue #1416) */
  readonly perWorkerRouting?: boolean;
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
  /** Total model calls made during this dispatch (#1321). */
  readonly totalModelCalls: number;
  /** True when a refinement pass was applied (Issue #1389). */
  readonly refined?: boolean;
}

// ============================================================================
// Feature Flag
// ============================================================================

/** Checks if worker dispatch is enabled via unified V2Config (#1321). */
export function isWorkerDispatchEnabled(): boolean {
  const config = resolveV2Config();
  const enabled = config.dispatchEnabled;
  if (!enabled) {
    logger.debug('Worker dispatch disabled (dispatchEnabled=false in V2Config)');
  }
  return enabled;
}

// ============================================================================
// Internal: Worker Execution
// ============================================================================

/** Resolve the adapter for a worker, optionally routing by role (Issue #1416). */
function resolveWorkerAdapter(
  entry: AgentPlanEntry,
  fallback: IModelAdapter,
  perWorkerRouting: boolean,
  log: ILogger
): IModelAdapter {
  if (!perWorkerRouting) return fallback;
  const expertRole = `${entry.role}_expert`;
  return resolveAdapterForRole(expertRole, fallback, log) ?? fallback;
}

function createWorkerExecutor(
  taskDescription: string,
  modelAdapter: IModelAdapter,
  logger: ILogger,
  learnings?: readonly WorkerLearning[],
  perWorkerRouting?: boolean
): (entry: AgentPlanEntry, priorWaveResults?: readonly WorkerResult[]) => Promise<WorkerResult> {
  return async (
    entry: AgentPlanEntry,
    priorWaveResults?: readonly WorkerResult[]
  ): Promise<WorkerResult> => {
    const workerStartMs = getTimeProvider().now();
    const adapter = resolveWorkerAdapter(entry, modelAdapter, perWorkerRouting === true, logger);
    const prompt = composeWorkerPrompt({
      entry,
      taskDescription,
      ...(priorWaveResults !== undefined ? { priorWaveResults } : {}),
      ...(learnings !== undefined && learnings.length > 0 ? { learnings } : {}),
    });

    try {
      const result = await adapter.complete({
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
// Internal: Synthesis + Refinement Helpers
// ============================================================================

/** Intermediate state passed between dispatch phases. */
interface DispatchPhaseState {
  results: WorkerResult[];
  totalModelCalls: number;
  synthesisValue?: string;
  synthSource?: SynthesisSource;
}

/** Run opt-in synthesis if within call budget (#1321). */
async function runSynthesisPhase(
  state: DispatchPhaseState,
  options: WorkerDispatchExecutionOptions,
  maxCalls: number
): Promise<void> {
  if (options.synthesize !== true || state.totalModelCalls >= maxCalls) return;
  const successResults = state.results.filter((r) => r.status === 'success');
  if (successResults.length === 0) return;

  options.logger.info('Running result synthesis', { workerCount: successResults.length });
  const synthResult = await synthesizeResults({
    results: state.results,
    conflicts: [...detectConflicts(state.results)],
    taskDescription: options.taskDescription,
    modelAdapter: options.modelAdapter,
  });
  state.totalModelCalls++;
  if (!synthResult.ok) {
    options.logger.warn('Synthesis failed', { error: synthResult.error });
    return;
  }
  state.synthesisValue = synthResult.value;
  if (synthResult.synthesisSource !== undefined) {
    state.synthSource = synthResult.synthesisSource;
  }
}

/** Run opt-in refinement pass if quality is low and budget allows (#1389). */
async function runRefinementPhase(
  state: DispatchPhaseState,
  entries: readonly AgentPlanEntry[],
  options: WorkerDispatchExecutionOptions,
  maxCalls: number
): Promise<boolean> {
  if (options.refine !== true || state.totalModelCalls >= maxCalls) return false;

  const signals: RefinementSignals = {
    errorCount: state.results.filter((r) => r.status === 'error').length,
    successCount: state.results.filter((r) => r.status === 'success').length,
    conflictCount: detectConflicts(state.results).length,
    ...(state.synthSource !== undefined ? { synthesisSource: state.synthSource } : {}),
  };
  if (!shouldRefine(signals)) return false;

  const remaining = maxCalls - state.totalModelCalls;
  const failedEntries = entries
    .filter((e) => state.results.some((r) => r.role === e.role && r.status === 'error'))
    .slice(0, remaining);
  if (failedEntries.length === 0) return false;

  options.logger.info('Refinement pass', {
    roles: failedEntries.map((e) => e.role),
    remaining,
  });
  const executor = createWorkerExecutor(
    options.taskDescription,
    options.modelAdapter,
    options.logger,
    options.learnings,
    options.perWorkerRouting
  );
  const refinedResults = await dispatchWorkers(failedEntries, {
    ...(options.maxConcurrency !== undefined ? { maxConcurrency: options.maxConcurrency } : {}),
    executeWorker: executor,
    eventBus: getPipelineEventBus(),
    executionId: `refine-${Date.now().toString(36)}`,
  });
  state.totalModelCalls += refinedResults.length;
  state.results = mergeRefinedResults(state.results, refinedResults);
  return true;
}

// ============================================================================
// Public API
// ============================================================================

/** Execute worker dispatch for an agent plan. */
export async function executeWorkerDispatch(
  options: WorkerDispatchExecutionOptions
): Promise<WorkerDispatchResult> {
  const { agentPlan, taskDescription, modelAdapter, logger, maxConcurrency } = options;
  const maxCalls = resolveMaxWorkerCalls(options.maxWorkerCalls);
  const startMs = getTimeProvider().now();

  // Enforce call budget: limit entries to maxCalls (#1321)
  const entries = agentPlan.entries.slice(0, maxCalls);
  if (entries.length < agentPlan.entries.length) {
    logger.warn('Worker call budget exceeded — limiting dispatch', {
      planned: agentPlan.entries.length,
      budgeted: maxCalls,
      dispatching: entries.length,
    });
  }

  logger.info('Starting worker dispatch', {
    totalExperts: entries.length,
    taskType: agentPlan.taskType,
    complexity: agentPlan.complexity,
    maxCalls,
  });

  const results = await dispatchWorkers(entries, {
    ...(maxConcurrency !== undefined ? { maxConcurrency } : {}),
    executeWorker: createWorkerExecutor(
      taskDescription,
      modelAdapter,
      logger,
      options.learnings,
      options.perWorkerRouting
    ),
    eventBus: getPipelineEventBus(),
    executionId: `dispatch-${Date.now().toString(36)}`,
  });

  const state: DispatchPhaseState = {
    results: [...results],
    totalModelCalls: results.filter((r) => r.status === 'success' || r.error !== undefined).length,
  };

  await runSynthesisPhase(state, options, maxCalls);
  const refined = await runRefinementPhase(state, entries, options, maxCalls);

  const base = buildDispatchResult(state.results, startMs, logger, state.totalModelCalls);
  return {
    ...base,
    ...(refined ? { refined: true } : {}),
    ...(state.synthesisValue !== undefined ? { synthesis: state.synthesisValue } : {}),
  };
}

// ============================================================================
// Outcome Recording (Issue #1323, Epic #1322)
// ============================================================================

/** Maps WorkerErrorType + error message to OutcomeFailureCategory. */
function mapErrorType(errorType: string | undefined, errorMsg: string): OutcomeFailureCategory {
  // Always try comprehensive message-based classification first (#1401 Phase 6.3)
  if (errorMsg !== '') {
    const fromMessage = categorizeOutcomeErrorMessage(errorMsg);
    if (fromMessage !== 'unknown') return fromMessage;
  }
  // Fall back to coarse WorkerErrorType when message classification fails
  if (errorType === 'timeout') return 'timeout';
  if (errorType === 'logic_error') return 'execution';
  if (errorType === 'model_error') return 'execution';
  return 'unknown';
}

/**
 * Records per-worker outcomes to OutcomeStore for closed-loop learning.
 * Best-effort: never throws. Each worker result becomes one OutcomeStore entry.
 */
export function recordWorkerOutcomes(
  results: readonly WorkerResult[],
  taskDescription: string
): void {
  try {
    const store = getOutcomeStore();
    const match = detectTaskCategory(taskDescription);
    const category = match?.category ?? 'exploration';
    const cli = match?.primaryCli ?? DEFAULT_CLI;
    const ts = new Date(getTimeProvider().now()).toISOString();

    for (const r of results) {
      const success = r.status === 'success';
      const failureCategory = !success ? mapErrorType(r.errorType, r.error ?? '') : undefined;

      store.append({
        id: `worker-${r.role}-${String(Date.now())}-${Math.random().toString(36).slice(2, 6)}`,
        cli,
        category,
        model: `worker-${r.role}`,
        success,
        durationMs: r.durationMs,
        timestamp: ts,
        source: 'delegate',
        ...(failureCategory !== undefined ? { failureCategory } : {}),
      });
    }
  } catch (error: unknown) {
    logger.debug('Best-effort worker outcome recording failed', {
      error: getErrorMessage(error),
    });
  }
}

function buildDispatchResult(
  results: WorkerResult[],
  startMs: number,
  logger: ILogger,
  totalModelCalls: number
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

  return {
    results,
    totalWorkers: results.length,
    successCount,
    errorCount,
    durationMs,
    conflicts,
    totalModelCalls,
  };
}

// ============================================================================
// Refinement (Issue #1389)
// ============================================================================

/** Quality signals for refinement decision. */
export interface RefinementSignals {
  readonly errorCount: number;
  readonly successCount: number;
  readonly conflictCount: number;
  readonly synthesisSource?: SynthesisSource;
}

/** Returns true when result quality warrants a refinement pass. */
export function shouldRefine(signals: RefinementSignals): boolean {
  if (signals.successCount === 0) return true;
  if (signals.errorCount > 0) return true;
  if (signals.synthesisSource === 'fallback') return true;
  return false;
}

function mergeRefinedResults(
  original: readonly WorkerResult[],
  refined: readonly WorkerResult[]
): WorkerResult[] {
  const refinedByRole = new Map(refined.map((r) => [r.role, r]));
  return original.map((orig) => {
    if (orig.status !== 'error') return orig;
    const replacement = refinedByRole.get(orig.role);
    return replacement?.status === 'success' ? replacement : orig;
  });
}
