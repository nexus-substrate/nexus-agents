/* eslint-disable max-lines -- Cohesive dispatch module (governance: 400-600 OK if cohesive) */
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
import type { ExecutionAccessMode, IModelAdapter } from '../../core/index.js';
import { createLogger, getErrorMessage } from '../../core/index.js';
import { resolveV2Config } from '../../pipeline/v2-config.js';
import type { AgentPlan, AgentPlanEntry } from '../../orchestration/aorchestra/index.js';
import {
  dispatchWorkers,
  detectConflicts,
  analyzeDispatch,
  evaluateExitTriggers,
  WorkerCheckpointStore,
  createCheckpoint,
  type WorkerResult,
  type WorkerConflict,
  type QualityGateFn,
  type ExitTriggerConfig,
} from '../../orchestration/aorchestra/index.js';
import { composeWorkerPrompt } from '../../orchestration/aorchestra/compose-worker-prompt.js';
import type { WorkerLearning } from '../../orchestration/aorchestra/compose-worker-prompt.js';
import {
  synthesizeResults,
  type SynthesisSource,
} from '../../orchestration/aorchestra/result-synthesizer.js';
import { getTimeProvider, getRandomProvider } from '../../core/index.js';
import type { ContentBlock, TokenUsage } from '../../core/types/model.js';
import {
  DEFAULT_CLI,
  CliNameSchema,
  type CliNameLiteral,
} from '../../config/model-capabilities-types.js';
import { resolveAdapterForRole, getExpertFallbackChain } from './create-expert-routing.js';
import { getGlobalRegistry } from '../../adapters/unified-registry.js';
import { detectTaskCategory } from '../../config/task-specialization.js';
import { getPipelineEventBus } from '../../pipeline/event-bus.js';
import {
  getOutcomeStore,
  categorizeOutcomeErrorMessage,
} from '../../orchestration/outcomes/index.js';
import type { OutcomeFailureCategory } from '../../orchestration/outcomes/index.js';
import {
  accessModeSignal,
  resolveOutcomeCategory,
} from '../../orchestration/outcomes/outcome-types.js';
import type { OutcomeCli } from '../../orchestration/outcomes/outcome-types.js';
import {
  servedOutcomeFields,
  type ServedCall,
} from '../../orchestration/outcomes/outcome-served-model.js';
import { isGatewayModelAdapter } from '../../adapters/openai-compat-adapter.js';

// ============================================================================
// Constants
// ============================================================================

const logger = createLogger({ component: 'orchestrate-dispatch' });

/** Maximum tokens for individual worker LLM responses. */
const WORKER_MAX_TOKENS = 4000;

/**
 * The access mode every worker call runs under (#6792). A worker's output is
 * consumed as text only: synthesized, scanned for conflicting file
 * references and recorded. Nothing reads a file a worker wrote, so a worker
 * needs no command, write or network tool, and a CLI adapter that cannot
 * enforce the mode refuses the call.
 */
const WORKER_ACCESS_MODE: ExecutionAccessMode = 'read-only-analysis';

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
const DEFAULT_MAX_WORKER_CALLS = 6;

/** Default exit triggers: skip refinement when all workers done + no retriable errors (#1509). */
const DEFAULT_EXIT_TRIGGERS: ExitTriggerConfig = {
  allWorkersComplete: true,
  noRetriableErrors: true,
};

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
  /**
   * Quality gate for worker output validation (#1502). There is no default:
   * when omitted (or `false`) no gate runs and worker output is accepted
   * ungated. The orchestrate tool passes none, so its worker output is not
   * gated (#6589).
   */
  readonly qualityGate?: QualityGateFn | false;
  /**
   * `cancel_job`'s signal (#6680). Reaches the dispatcher, which skips the
   * remaining waves and forwards it into every in-flight worker's
   * `CompletionRequest.signal`, and the synthesis call. Checked before the
   * synthesis and refinement phases: once it has fired, the dispatch throws
   * {@link WorkerDispatchCancelledError} rather than returning a partial
   * result. An adapter that ignores the signal completes the current call.
   */
  readonly signal?: AbortSignal | undefined;
}

/**
 * Raised when `cancel_job`'s signal fires during worker dispatch (#6680). A
 * cancelled dispatch has no result: returning the waves that finished would
 * read as a partial success.
 */
class WorkerDispatchCancelledError extends Error {
  constructor(phase: string) {
    super(`Worker dispatch cancelled before the ${phase} phase`);
    this.name = 'WorkerDispatchCancelledError';
  }
}

/**
 * Read through a call, never inline: TypeScript narrows `signal.aborted` to
 * `false` after one check, which is unsound across the `await`s between phases.
 */
function throwIfDispatchCancelled(signal: AbortSignal | undefined, phase: string): void {
  if (signal?.aborted === true) throw new WorkerDispatchCancelledError(phase);
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

/** Resolved adapter with its CLI identity for outcome recording (#1527). */
interface ResolvedWorkerAdapter {
  readonly adapter: IModelAdapter;
  readonly cliName: string;
}

/** Resolve the adapter for a worker, optionally routing by role (Issue #1416). */
function resolveWorkerAdapter(
  entry: AgentPlanEntry,
  fallback: IModelAdapter,
  fallbackCli: string,
  perWorkerRouting: boolean,
  log: ILogger
): ResolvedWorkerAdapter {
  if (!perWorkerRouting) return { adapter: fallback, cliName: fallbackCli };
  const expertRole = `${entry.role}_expert`;
  const resolved = resolveAdapterForRole(expertRole, fallback, log) ?? fallback;
  // Derive CLI name from the adapter's providerId (e.g., 'claude', 'codex', 'gemini')
  const cliName = resolved.providerId;
  return { adapter: resolved, cliName };
}

interface WorkerExecutorConfig {
  readonly taskDescription: string;
  readonly modelAdapter: IModelAdapter;
  readonly logger: ILogger;
  readonly learnings?: readonly WorkerLearning[];
  readonly perWorkerRouting?: boolean;
}

/** Options for executeOnAdapter — bundled to stay within max-params (5). */
interface AdapterExecutionOptions {
  readonly entry: AgentPlanEntry;
  readonly adapter: IModelAdapter;
  readonly cliName: string;
  readonly taskDescription: string;
  readonly learnings?: readonly WorkerLearning[];
  readonly priorWaveResults?: readonly WorkerResult[];
  readonly workerStartMs: number;
  /**
   * #3036: cancellation signal forwarded into `adapter.complete` so that
   * when the watchdog timeout wins, the vendor SDK call cancels mid-flight
   * instead of running to completion and posting a late result.
   */
  readonly signal?: AbortSignal | undefined;
}

/**
 * Execute a worker task on a specific adapter, returning a WorkerResult that
 * states the access mode its call was dispatched under (#6792), on success
 * and on failure alike.
 */
async function executeOnAdapter(opts: AdapterExecutionOptions): Promise<WorkerResult> {
  logger.debug('Worker call access mode', {
    role: opts.entry.role,
    accessMode: WORKER_ACCESS_MODE,
  });
  return { ...(await completeOnAdapter(opts)), accessMode: WORKER_ACCESS_MODE };
}

/** {@link executeOnAdapter}'s model call under {@link WORKER_ACCESS_MODE}. */
async function completeOnAdapter(opts: AdapterExecutionOptions): Promise<WorkerResult> {
  const {
    entry,
    adapter,
    cliName,
    taskDescription,
    learnings,
    priorWaveResults,
    workerStartMs,
    signal,
  } = opts;
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
      accessMode: WORKER_ACCESS_MODE,
      ...(signal !== undefined ? { signal } : {}),
    });
    if (!result.ok) {
      return makeErrorResult(entry, workerStartMs, result.error.message, cliName);
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
      resolvedCli: cliName,
      served: servedCallOf(adapter, result.value),
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return makeErrorResult(entry, workerStartMs, message, cliName);
  }
}

/**
 * The model that answered a worker and its usage (#6624). A gateway adapter
 * names its arm, so the row is priced by the gateway's declaration.
 */
function servedCallOf(
  adapter: IModelAdapter,
  response: { readonly model: string; readonly usage?: TokenUsage | undefined }
): ServedCall {
  return {
    model: response.model,
    ...(isGatewayModelAdapter(adapter) && { gatewayArm: adapter.gatewayArm }),
    ...(response.usage !== undefined && {
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
    }),
  };
}

function createWorkerExecutor(
  config: WorkerExecutorConfig
): (
  entry: AgentPlanEntry,
  priorWaveResults?: readonly WorkerResult[],
  signal?: AbortSignal
) => Promise<WorkerResult> {
  const { taskDescription, modelAdapter, logger, learnings, perWorkerRouting } = config;
  const effectiveFallbackCli = modelAdapter.providerId;
  return async (entry, priorWaveResults, signal): Promise<WorkerResult> => {
    const workerStartMs = getTimeProvider().now();
    const { adapter, cliName } = resolveWorkerAdapter(
      entry,
      modelAdapter,
      effectiveFallbackCli,
      perWorkerRouting === true,
      logger
    );
    return executeOnAdapter({
      entry,
      adapter,
      cliName,
      taskDescription,
      workerStartMs,
      ...(learnings !== undefined ? { learnings } : {}),
      ...(priorWaveResults !== undefined ? { priorWaveResults } : {}),
      ...(signal !== undefined ? { signal } : {}),
    });
  };
}

/** Resolve an alt adapter from the fallback chain for a worker role (#1535). */
function resolveAltAdapter(
  entry: AgentPlanEntry,
  primaryCli: string,
  log: ILogger
): { adapter: IModelAdapter; cliName: string } | null {
  const chain = getExpertFallbackChain(`${entry.role}_expert`, primaryCli, log);
  const first = chain[0];
  if (first === undefined) return null;
  const altCli = first;
  try {
    const registry = getGlobalRegistry();
    return { adapter: registry.getAdapterForCli(altCli), cliName: altCli };
  } catch {
    log.debug('Alt CLI adapter unavailable', { altCli });
    return null;
  }
}

/**
 * Creates an alt executor that picks a different CLI from the fallback chain (#1535).
 * Used for `retry_different_cli` triage action — actual CLI rotation on rate-limit.
 */
function createAltWorkerExecutor(
  config: WorkerExecutorConfig
): (
  entry: AgentPlanEntry,
  priorWaveResults?: readonly WorkerResult[],
  signal?: AbortSignal
) => Promise<WorkerResult> {
  const { taskDescription, modelAdapter, logger: log, learnings } = config;
  const primaryCli = modelAdapter.providerId;
  return async (entry, priorWaveResults, signal): Promise<WorkerResult> => {
    const workerStartMs = getTimeProvider().now();
    const alt = resolveAltAdapter(entry, primaryCli, log);
    if (alt === null) {
      return makeErrorResult(entry, workerStartMs, 'No alternative CLI available');
    }
    log.info('Using alt CLI for retry', { role: entry.role, primaryCli, altCli: alt.cliName });
    return executeOnAdapter({
      entry,
      adapter: alt.adapter,
      cliName: alt.cliName,
      taskDescription,
      workerStartMs,
      ...(learnings !== undefined ? { learnings } : {}),
      ...(priorWaveResults !== undefined ? { priorWaveResults } : {}),
      ...(signal !== undefined ? { signal } : {}),
    });
  };
}

function makeErrorResult(
  entry: AgentPlanEntry,
  startMs: number,
  message: string,
  resolvedCli?: string
): WorkerResult {
  return {
    role: entry.role,
    subTask: entry.subTask,
    output: '',
    status: 'error',
    durationMs: getTimeProvider().now() - startMs,
    error: message,
    ...(resolvedCli !== undefined ? { resolvedCli } : {}),
  };
}

// ============================================================================
// Internal: Dispatch Insights (#1505)
// ============================================================================

/** Log structured insights when errors are present. */
function logDispatchInsights(results: readonly WorkerResult[], log: ILogger): void {
  const insights = analyzeDispatch(results);
  if (insights.dominantErrorType !== undefined) {
    log.info('Dispatch insights', {
      dominantErrorType: insights.dominantErrorType,
      errorClusters: insights.errorClusters.length,
      durationOutliers: insights.durationOutliers.length,
    });
  }
  if (insights.triage.retriedCount > 0) {
    log.info('Triage summary', {
      retried: insights.triage.retriedCount,
      retrySuccesses: insights.triage.retrySuccesses,
      retryRate: Math.round((insights.triage.retrySuccesses / insights.triage.retriedCount) * 100),
    });
  }
}

// ============================================================================
// Internal: Worker Checkpoints (#1508)
// ============================================================================

/** Save checkpoints for failed workers so refinement can resume context. */
function saveFailedCheckpoints(
  results: readonly WorkerResult[],
  store: WorkerCheckpointStore
): void {
  for (const r of results) {
    if (r.status !== 'error') continue;
    store.save(`${r.role}:${r.subTask}`, createCheckpoint(r.role, r.subTask, r.output));
  }
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
  checkpoints: WorkerCheckpointStore;
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
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
  });
  // Only count LLM calls toward budget — deterministic merge is free
  if (synthResult.ok && synthResult.synthesisSource !== 'deterministic') {
    state.totalModelCalls++;
  }
  if (!synthResult.ok) {
    options.logger.warn('Synthesis failed', { error: synthResult.error });
    return;
  }
  state.synthesisValue = synthResult.value;
  if (synthResult.synthesisSource !== undefined) {
    state.synthSource = synthResult.synthesisSource;
    options.logger.info('Synthesis complete', { tier: synthResult.synthesisSource });
  }
}

/** Check if refinement should be skipped due to exit triggers or signal analysis. */
function shouldSkipRefinement(
  state: DispatchPhaseState,
  entries: readonly AgentPlanEntry[],
  maxCalls: number,
  log: ILogger
): boolean {
  const exitResult = evaluateExitTriggers(DEFAULT_EXIT_TRIGGERS, {
    results: state.results,
    totalModelCalls: state.totalModelCalls,
    maxModelCalls: maxCalls,
    plannedWorkers: entries.length,
  });
  if (exitResult.shouldExit) {
    log.info('Exit triggers met — skipping refinement', { reasons: exitResult.reasons });
    return true;
  }
  const errorResults = state.results.filter((r) => r.status === 'error');
  const allRateLimit =
    errorResults.length > 0 && errorResults.every((r) => r.errorType === 'rate_limit');
  const signals: RefinementSignals = {
    errorCount: errorResults.length,
    successCount: state.results.filter((r) => r.status === 'success').length,
    conflictCount: detectConflicts(state.results).length,
    ...(state.synthSource !== undefined ? { synthesisSource: state.synthSource } : {}),
    ...(allRateLimit ? { allErrorsRateLimit: true } : {}),
  };
  return !shouldRefine(signals);
}

/** Run opt-in refinement pass if quality is low and budget allows (#1389). */
async function runRefinementPhase(
  state: DispatchPhaseState,
  entries: readonly AgentPlanEntry[],
  options: WorkerDispatchExecutionOptions,
  maxCalls: number
): Promise<boolean> {
  if (options.refine !== true || state.totalModelCalls >= maxCalls) return false;
  if (shouldSkipRefinement(state, entries, maxCalls, options.logger)) return false;

  const remaining = maxCalls - state.totalModelCalls;
  const failedEntries = entries
    .filter((e) => state.results.some((r) => r.role === e.role && r.status === 'error'))
    .slice(0, remaining);
  if (failedEntries.length === 0) return false;

  const checkpointCount = state.checkpoints.size;
  options.logger.info('Refinement pass', {
    roles: failedEntries.map((e) => e.role),
    remaining,
    checkpoints: checkpointCount,
  });
  const executor = createWorkerExecutor({
    taskDescription: options.taskDescription,
    modelAdapter: options.modelAdapter,
    logger: options.logger,
    ...(options.learnings !== undefined ? { learnings: options.learnings } : {}),
    ...(options.perWorkerRouting !== undefined
      ? { perWorkerRouting: options.perWorkerRouting }
      : {}),
  });
  const refinedResults = await dispatchWorkers(failedEntries, {
    ...(options.maxConcurrency !== undefined ? { maxConcurrency: options.maxConcurrency } : {}),
    executeWorker: executor,
    eventBus: getPipelineEventBus(),
    executionId: `refine-${Date.now().toString(36)}`,
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
  });
  state.totalModelCalls += refinedResults.length;
  state.results = mergeRefinedResults(state.results, refinedResults);
  return true;
}

// ============================================================================
// Public API
// ============================================================================

/** Enforce call budget and log dispatch start. Returns budget-limited entries. */
function prepareBudgetedEntries(
  plan: AgentPlan,
  maxCalls: number,
  log: ILogger
): readonly AgentPlanEntry[] {
  const entries = plan.entries.slice(0, maxCalls);
  if (entries.length < plan.entries.length) {
    log.warn('Worker call budget exceeded — limiting dispatch', {
      planned: plan.entries.length,
      budgeted: maxCalls,
      dispatching: entries.length,
    });
  }
  log.info('Starting worker dispatch', {
    totalExperts: entries.length,
    taskType: plan.taskType,
    complexity: plan.complexity,
    maxCalls,
  });
  return entries;
}

/** Execute worker dispatch for an agent plan. */
export async function executeWorkerDispatch(
  options: WorkerDispatchExecutionOptions
): Promise<WorkerDispatchResult> {
  const { agentPlan, taskDescription, modelAdapter, logger, maxConcurrency } = options;
  const maxCalls = resolveMaxWorkerCalls(options.maxWorkerCalls);
  const startMs = getTimeProvider().now();
  const entries = prepareBudgetedEntries(agentPlan, maxCalls, logger);

  // Quality gate: opt-in via the qualityGate option (#1502); absent means ungated (#6589).
  const qualityGate = options.qualityGate === false ? undefined : options.qualityGate;

  const executorConfig: WorkerExecutorConfig = {
    taskDescription,
    modelAdapter,
    logger,
    ...(options.learnings !== undefined ? { learnings: options.learnings } : {}),
    ...(options.perWorkerRouting !== undefined
      ? { perWorkerRouting: options.perWorkerRouting }
      : {}),
  };
  const results = await dispatchWorkers(entries, {
    ...(maxConcurrency !== undefined ? { maxConcurrency } : {}),
    executeWorker: createWorkerExecutor(executorConfig),
    altExecuteWorker: createAltWorkerExecutor(executorConfig),
    eventBus: getPipelineEventBus(),
    executionId: `dispatch-${Date.now().toString(36)}`,
    ...(qualityGate !== undefined ? { qualityGate } : {}),
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
  });

  const checkpoints = new WorkerCheckpointStore();
  saveFailedCheckpoints(results, checkpoints);

  const state: DispatchPhaseState = {
    results: [...results],
    totalModelCalls: results.filter((r) => r.status === 'success' || r.error !== undefined).length,
    checkpoints,
  };

  throwIfDispatchCancelled(options.signal, 'synthesis');
  await runSynthesisPhase(state, options, maxCalls);
  throwIfDispatchCancelled(options.signal, 'refinement');
  const refined = await runRefinementPhase(state, entries, options, maxCalls);

  const base = buildDispatchResult(state.results, startMs, logger, state.totalModelCalls);
  logDispatchInsights(state.results, logger);

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
  if (errorType === 'rate_limit') return 'rate_limit';
  if (errorType === 'logic_error') return 'execution';
  if (errorType === 'model_error') return 'execution';
  return 'unknown';
}

/** Builds optional metadata fields for a worker outcome entry. */
function buildOptionalFields(r: WorkerResult): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  if (r.status !== 'success') {
    fields['failureCategory'] = mapErrorType(r.errorType, r.error ?? '');
    const errorMessage = (r.error ?? '').slice(0, 500);
    if (errorMessage !== '') fields['errorMessage'] = errorMessage;
  }
  if (r.wasRetried === true) fields['wasRetried'] = true;
  if (r.triageAction !== undefined) fields['triageAction'] = r.triageAction;
  // #6792: the mode the worker's call ran under; absent means unmeasured.
  if (r.accessMode !== undefined) fields['qualitySignals'] = [accessModeSignal(r.accessMode)];
  return fields;
}

/**
 * Normalizes a worker's resolved CLI identity to a valid OutcomeCli (#6529).
 *
 * Strips the adapter 'cli-' prefix if present, validates against CliNameSchema,
 * and falls back to 'unknown' if invalid. When no resolved CLI is provided,
 * falls back to the category's primary CLI.
 */
function resolveWorkerOutcomeCli(
  resolvedCli: string | undefined,
  fallbackCli: CliNameLiteral
): OutcomeCli {
  if (resolvedCli === undefined) {
    return fallbackCli;
  }
  const bare = resolvedCli.startsWith('cli-') ? resolvedCli.slice('cli-'.length) : resolvedCli;
  const parsed = CliNameSchema.safeParse(bare);
  return parsed.success ? parsed.data : 'unknown';
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
    const categoryFields = resolveOutcomeCategory(match?.category);
    // Fallback CLI from specialization — only used when worker has no resolvedCli
    const fallbackCli = match?.primaryCli ?? DEFAULT_CLI;
    const ts = new Date(getTimeProvider().now()).toISOString();

    for (const r of results) {
      // Skip intentional routing decisions — not real failures (#1528)
      if (r.status === 'skipped') continue;
      const success = r.status === 'success';
      // Use actual CLI that executed (#1527), normalized and validated (#6529)
      const cli = resolveWorkerOutcomeCli(r.resolvedCli, fallbackCli);
      store.append({
        id: `worker-${r.role}-${String(getTimeProvider().now())}-${getRandomProvider().random().toString(36).slice(2, 6)}`,
        cli,
        ...categoryFields,
        model: `worker-${r.role}`,
        success,
        durationMs: r.durationMs,
        timestamp: ts,
        source: 'delegate',
        ...buildOptionalFields(r),
        // #6624: the model that answered, beside the `worker-<role>` marker
        // the weather report and the learnings group on.
        ...servedOutcomeFields(r.served),
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
  /** When all errors are rate-limit, refinement is unlikely to help (#1504). */
  readonly allErrorsRateLimit?: boolean;
}

/** Returns true when result quality warrants a refinement pass. */
export function shouldRefine(signals: RefinementSignals): boolean {
  // Skip refinement when all errors are rate limits — retrying won't help (#1504)
  if (signals.allErrorsRateLimit === true) return false;
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
