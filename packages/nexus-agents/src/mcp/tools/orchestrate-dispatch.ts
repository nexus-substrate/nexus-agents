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
import { createLogger, getErrorMessage, err, ModelError, ErrorCode } from '../../core/index.js';
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
import {
  prepareWorkerPrompt,
  measureWorkerPromptInput,
} from '../../orchestration/aorchestra/compose-worker-prompt.js';
import {
  checkExpandedPromptBudget,
  isExpandedWorkerInput,
  preflightWorkerPrompts,
  WORKER_OUTPUT_RESERVE_TOKENS,
} from '../../orchestration/aorchestra/worker-input-preflight.js';
import {
  isCodexTransport,
  inlineWorkerArtifacts,
} from '../../orchestration/aorchestra/worker-artifact.js';
import type {
  WorkerLearning,
  WorkerPromptEvidence,
} from '../../orchestration/aorchestra/compose-worker-prompt.js';
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
import { resolveAdapterForRole, resolveAdapterForRoleAccess } from './create-expert-routing.js';
import { queryModelAccessMode } from '../../adapters/access-mode-support.js';
import { warmModelMetadata } from '../../adapters/model-metadata.js';
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
import { validatedModelIdentity } from '../../cli-adapters/model-identity.js';

// ============================================================================
// Constants
// ============================================================================

const logger = createLogger({ component: 'orchestrate-dispatch' });

/** Maximum tokens for individual worker LLM responses. */
const WORKER_MAX_TOKENS = WORKER_OUTPUT_RESERVE_TOKENS;

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

/** Default completion-attempt maximum for this dispatch, including retries and synthesis. */
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
  /** Maximum underlying adapter completion attempts, including retries/refinement/synthesis.
   * Excludes planning/voting and unobserved internal provider retries (default: 6). */
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
  /** Relevant files/artifacts to inline or provide to workers (#7413) */
  readonly relevantFiles?: readonly string[] | undefined;
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
  /** Observed underlying adapter.complete attempts across workers and synthesis.
   * Adapter-internal/provider retries and billable/native calls are unmeasured. */
  readonly totalModelCalls: number;
  /** True when a refinement pass was applied (Issue #1389). */
  readonly refined?: boolean;
  /** No completion was attempted because required inline delivery could not be supported. */
  readonly unsupportedReason?: string;
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

/** Eligibility is resolved before whole-plan preflight, including short inputs. */
async function resolveWorkerAdapter(
  entry: AgentPlanEntry,
  config: Pick<WorkerExecutorConfig, 'modelAdapter' | 'perWorkerRouting' | 'logger'>,
  signal?: AbortSignal,
  exclude?: IModelAdapter
): Promise<ResolvedWorkerAdapter | string> {
  const role = `${entry.role}_expert`;
  let primary = exclude ?? config.modelAdapter;
  if (exclude === undefined && config.perWorkerRouting === true) {
    try {
      primary =
        resolveAdapterForRole(role, config.modelAdapter, config.logger) ?? config.modelAdapter;
    } catch {
      config.logger.debug('Role-primary acquisition unavailable', { role });
    }
  }
  const selected = await resolveAdapterForRoleAccess(primary, config.modelAdapter, {
    role,
    mode: WORKER_ACCESS_MODE,
    logger: config.logger,
    includeRoleChain: config.perWorkerRouting === true,
    signal,
    exclude,
  });
  if (!selected.ok) return selected.error;
  try {
    return { adapter: selected.value, cliName: selected.value.providerId };
  } catch {
    return 'unsupported worker access-mode delivery: selected identity unavailable';
  }
}

/** Private aggregate of observable adapter invocations, independent of result slots. */
interface WorkerCallCounter {
  attempts: number;
  readonly maxCalls: number;
}

/** Reserve synchronously; concurrent continuations cannot both claim the final call. */
function reserveWorkerCall(counter: WorkerCallCounter): boolean {
  if (counter.attempts >= counter.maxCalls) return false;
  counter.attempts++;
  return true;
}

interface WorkerExecutorConfig {
  readonly callCounter: WorkerCallCounter;
  readonly unsupportedEntries: Set<AgentPlanEntry>;
  readonly taskDescription: string;
  readonly modelAdapter: IModelAdapter;
  readonly logger: ILogger;
  readonly learnings?: readonly WorkerLearning[];
  readonly perWorkerRouting?: boolean;
  readonly resolvedAdapters?: ReadonlyMap<AgentPlanEntry, ResolvedWorkerAdapter>;
  readonly modeUnsupported?: string;
  readonly relevantFiles?: readonly string[] | undefined;
}

/** Options for executeOnAdapter — bundled to stay within max-params (5). */
interface AdapterExecutionOptions {
  readonly callCounter: WorkerCallCounter;
  readonly unsupportedEntries: Set<AgentPlanEntry>;
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
  readonly relevantFiles?: readonly string[] | undefined;
}

/** Per-invocation evidence prevents concurrent attempts from labeling a refused worker. */
async function executeOnAdapter(opts: AdapterExecutionOptions): Promise<WorkerResult> {
  const invocation = { attempts: 0 };
  const result = await completeOnAdapter(opts, () => {
    if (!reserveWorkerCall(opts.callCounter)) return false;
    invocation.attempts++;
    return true;
  });
  if (invocation.attempts === 0) return result;
  if (result.status === 'success') return { ...result, accessMode: WORKER_ACCESS_MODE };
  return { ...result, requestedCli: opts.cliName, requestedAccessMode: WORKER_ACCESS_MODE };
}

function resolveAdapterInlinedArtifacts(
  cliName: string,
  relevantFiles?: readonly string[]
): { ok: true; value: string | undefined } | { ok: false; error: string } {
  if (relevantFiles === undefined || relevantFiles.length === 0 || !isCodexTransport(cliName)) {
    return { ok: true, value: undefined };
  }
  const inlined = inlineWorkerArtifacts(relevantFiles);
  if (!inlined.ok) {
    return {
      ok: false,
      error: `unsupported inline delivery: worker transport lacks permitted artifact reader (${inlined.error})`,
    };
  }
  return { ok: true, value: inlined.value };
}

async function validateExpandedBudget(
  adapter: IModelAdapter,
  prompt: string,
  signal?: AbortSignal
): Promise<string | undefined> {
  try {
    await warmModelMetadata([adapter], signal);
  } catch {
    return 'unsupported inline delivery: model metadata preflight failed';
  }
  return checkExpandedPromptBudget(adapter, prompt, 0, signal);
}

/** {@link executeOnAdapter}'s model call under {@link WORKER_ACCESS_MODE}. */
async function prepareAdapterPrompt(
  opts: AdapterExecutionOptions
): Promise<ReturnType<typeof prepareWorkerPrompt>> {
  const inlinedArtifacts = resolveAdapterInlinedArtifacts(opts.cliName, opts.relevantFiles);
  if (!inlinedArtifacts.ok) return inlinedArtifacts;

  const prepared = prepareWorkerPrompt({
    entry: opts.entry,
    accessMode: WORKER_ACCESS_MODE,
    taskDescription: opts.taskDescription,
    cli: opts.cliName,
    ...(opts.relevantFiles !== undefined ? { relevantFiles: opts.relevantFiles } : {}),
    ...(inlinedArtifacts.value !== undefined ? { inlinedArtifacts: inlinedArtifacts.value } : {}),
    ...(opts.priorWaveResults !== undefined ? { priorWaveResults: opts.priorWaveResults } : {}),
    ...(opts.learnings !== undefined && opts.learnings.length > 0
      ? { learnings: opts.learnings }
      : {}),
  });
  if (!prepared.ok) return prepared;
  if (isExpandedWorkerInput(opts.taskDescription, opts.entry.subTask)) {
    const reason = await validateExpandedBudget(opts.adapter, prepared.value.prompt, opts.signal);
    if (reason !== undefined) return { ok: false, error: reason };
  }
  return prepared;
}

/** Only an observed late non-support suppresses unchanged refinement, not generic errors. */
async function noteUnsupportedAfterError(
  opts: AdapterExecutionOptions,
  error: ModelError
): Promise<void> {
  if (
    error.code === ErrorCode.INVALID_INPUT &&
    (await queryModelAccessMode(opts.adapter, WORKER_ACCESS_MODE, opts.signal)) === false
  ) {
    opts.unsupportedEntries.add(opts.entry);
  }
}

async function completeOnAdapter(
  opts: AdapterExecutionOptions,
  onAttempt: () => boolean
): Promise<WorkerResult> {
  const { entry, adapter, cliName, workerStartMs, signal } = opts;
  const prepared = await prepareAdapterPrompt(opts);
  if (!prepared.ok)
    return {
      ...makeErrorResult(entry, workerStartMs, prepared.error),
      promptEvidence: {
        ...measureWorkerPromptInput({ entry, taskDescription: opts.taskDescription }),
        rawInputCoverage: 'UNSUPPORTED',
      },
    };
  const { prompt, evidence } = prepared.value;
  try {
    if (!onAttempt()) return exhaustedWorkerResult(opts, evidence);
    const result = await adapter.complete({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: WORKER_MAX_TOKENS,
      accessMode: WORKER_ACCESS_MODE,
      ...(signal !== undefined ? { signal } : {}),
    });
    if (!result.ok) {
      await noteUnsupportedAfterError(opts, result.error);
      return {
        ...makeErrorResult(entry, workerStartMs, result.error.message),
        promptEvidence: { ...evidence, rawInputCoverage: 'UNSUPPORTED' },
      };
    }
    return {
      role: entry.role,
      subTask: entry.subTask,
      output: deliveredWorkerOutput(result.value.content, evidence),
      status: 'success',
      durationMs: getTimeProvider().now() - workerStartMs,
      resolvedCli: cliName,
      served: servedCallOf(adapter, result.value),
      promptEvidence: evidence,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ...makeErrorResult(entry, workerStartMs, message),
      promptEvidence: { ...evidence, rawInputCoverage: 'UNSUPPORTED' },
    };
  }
}

/** Keep original retry context in subTask while identifying a refusal before completion. */
function exhaustedWorkerResult(
  opts: AdapterExecutionOptions,
  evidence: NonNullable<WorkerResult['promptEvidence']>
): WorkerResult {
  return {
    ...makeErrorResult(
      opts.entry,
      opts.workerStartMs,
      'Worker call budget exhausted before completion'
    ),
    promptEvidence: { ...evidence, rawInputCoverage: 'UNSUPPORTED' },
  };
}

/** Preserve the partial raw-byte coverage notice in the actual returned text. */
function deliveredWorkerOutput(
  content: readonly ContentBlock[],
  evidence: WorkerPromptEvidence
): string {
  const text = content
    .filter((b): b is ContentBlock & { type: 'text' } => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
  return evidence.rawInputCoverage === 'PARTIAL'
    ? `[INLINE INPUT COVERAGE: PARTIAL; raw-byte QA unsupported; model inspection unmeasured]\n${text}`
    : text;
}

/**
 * Admit the worker's raw upstream model report and preserve its usage (#7569).
 * A transport report is not provider attestation. A gateway adapter names its
 * arm independently, so an admitted model is priced by that declaration.
 */
function servedCallOf(
  adapter: IModelAdapter,
  response: { readonly reportedModel?: string | undefined; readonly usage?: TokenUsage | undefined }
): ServedCall {
  return {
    model: validatedModelIdentity(response.reportedModel),
    ...(isGatewayModelAdapter(adapter) && { gatewayArm: adapter.gatewayArm }),
    ...(response.usage !== undefined && {
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
    }),
  };
}

/**
 * Look up a resolved worker adapter from the preflight map (#1535).
 *
 * `worker-dispatcher`'s `buildRetryEntry()` clones the entry to append failure context,
 * creating a new object reference. A strict reference lookup fails for retried entries,
 * causing `createAltWorkerExecutor` to fall back to `modelAdapter` and exclude the default
 * rather than the failed role adapter. We fall back to matching by role and subTask prefix,
 * then by role.
 */
function lookupResolvedAdapter(
  resolvedAdapters: ReadonlyMap<AgentPlanEntry, ResolvedWorkerAdapter> | undefined,
  entry: AgentPlanEntry
): ResolvedWorkerAdapter | undefined {
  if (resolvedAdapters === undefined) return undefined;
  const direct = resolvedAdapters.get(entry);
  if (direct !== undefined) return direct;
  for (const [candidate, resolved] of resolvedAdapters) {
    if (candidate.role === entry.role && entry.subTask.startsWith(candidate.subTask)) {
      return resolved;
    }
  }
  for (const [candidate, resolved] of resolvedAdapters) {
    if (candidate.role === entry.role) {
      return resolved;
    }
  }
  return undefined;
}

/**
 * Resolves the primary adapter assigned to this worker entry (#1535).
 * Falls back from preflight resolution to role routing, then default model adapter.
 */
function resolvePrimaryAdapter(config: WorkerExecutorConfig, entry: AgentPlanEntry): IModelAdapter {
  const resolved = lookupResolvedAdapter(config.resolvedAdapters, entry);
  if (resolved !== undefined) return resolved.adapter;
  if (config.perWorkerRouting === true) {
    try {
      const rolePrimary = resolveAdapterForRole(
        `${entry.role}_expert`,
        config.modelAdapter,
        config.logger
      );
      if (rolePrimary !== undefined) return rolePrimary;
    } catch {
      // Fall back to modelAdapter
    }
  }
  return config.modelAdapter;
}

function createWorkerExecutor(
  config: WorkerExecutorConfig
): (
  entry: AgentPlanEntry,
  priorWaveResults?: readonly WorkerResult[],
  signal?: AbortSignal
) => Promise<WorkerResult> {
  const { taskDescription, learnings, relevantFiles } = config;
  return async (entry, priorWaveResults, signal): Promise<WorkerResult> => {
    const workerStartMs = getTimeProvider().now();
    const resolved =
      lookupResolvedAdapter(config.resolvedAdapters, entry) ??
      (await resolveWorkerAdapter(entry, config, signal));
    if (typeof resolved === 'string') {
      config.unsupportedEntries.add(entry);
      return makeErrorResult(entry, workerStartMs, resolved);
    }
    const { adapter, cliName } = resolved;
    return executeOnAdapter({
      callCounter: config.callCounter,
      unsupportedEntries: config.unsupportedEntries,
      entry,
      adapter,
      cliName,
      taskDescription,
      workerStartMs,
      ...(learnings !== undefined ? { learnings } : {}),
      ...(priorWaveResults !== undefined ? { priorWaveResults } : {}),
      ...(signal !== undefined ? { signal } : {}),
      ...(relevantFiles !== undefined ? { relevantFiles } : {}),
    });
  };
}

function refusedInlineDispatch(
  entries: readonly AgentPlanEntry[],
  taskDescription: string,
  reason: string,
  startMs: number,
  log: ILogger
): WorkerDispatchResult {
  const refused = entries.map((entry) => ({
    ...makeErrorResult(entry, startMs, reason),
    promptEvidence: {
      ...measureWorkerPromptInput({ entry, taskDescription }),
      rawInputCoverage: 'UNSUPPORTED' as const,
    },
  }));
  return { ...buildDispatchResult(refused, startMs, log, 0), unsupportedReason: reason };
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
  const { taskDescription, logger: log, learnings, relevantFiles } = config;

  return async (entry, priorWaveResults, signal): Promise<WorkerResult> => {
    const workerStartMs = getTimeProvider().now();
    const primary = resolvePrimaryAdapter(config, entry);
    const alt = await resolveWorkerAdapter(
      entry,
      { ...config, perWorkerRouting: true },
      signal,
      primary
    );
    if (typeof alt === 'string') return makeErrorResult(entry, workerStartMs, alt);
    log.info('Using alt CLI for retry', {
      role: entry.role,
      primaryCli: primary.providerId,
      altCli: alt.cliName,
    });
    return executeOnAdapter({
      callCounter: config.callCounter,
      unsupportedEntries: config.unsupportedEntries,
      entry,
      adapter: alt.adapter,
      cliName: alt.cliName,
      taskDescription,
      workerStartMs,
      ...(learnings !== undefined ? { learnings } : {}),
      ...(priorWaveResults !== undefined ? { priorWaveResults } : {}),
      ...(signal !== undefined ? { signal } : {}),
      ...(relevantFiles !== undefined ? { relevantFiles } : {}),
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
  readonly callCounter: WorkerCallCounter;
  readonly unsupportedEntries: Set<AgentPlanEntry>;
  results: WorkerResult[];
  totalModelCalls: number;
  synthesisValue?: string;
  synthSource?: SynthesisSource;
  checkpoints: WorkerCheckpointStore;
}

/** Delegate synthesis without changing adapter receivers or optional identity capabilities. */
function synthesisAdapter(adapter: IModelAdapter, counter: WorkerCallCounter): IModelAdapter {
  const listModels = adapter.listModels?.bind(adapter);
  const supportsAccessMode = adapter.supportsAccessMode?.bind(adapter);
  return {
    providerId: adapter.providerId,
    modelId: adapter.modelId,
    capabilities: adapter.capabilities,
    complete: async (request) => {
      if (!reserveWorkerCall(counter)) {
        return err(
          new ModelError('Worker call budget exhausted before synthesis', {
            retryable: false,
            context: { operation: 'orchestrate-call-budget', attempted: false },
          })
        );
      }
      return adapter.complete(request);
    },
    stream: (request) => adapter.stream(request),
    countTokens: (text) => adapter.countTokens(text),
    validateConfig: () => adapter.validateConfig(),
    ...(listModels !== undefined ? { listModels } : {}),
    ...(supportsAccessMode !== undefined ? { supportsAccessMode } : {}),
  };
}

/** Run opt-in synthesis; every actual completion shares the worker reservation. */
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
    modelAdapter: synthesisAdapter(options.modelAdapter, state.callCounter),
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
  });
  // Counts failed and multi-tier attempts too; deterministic merge remains free.
  state.totalModelCalls = state.callCounter.attempts;
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
    .filter(
      (e) =>
        !state.unsupportedEntries.has(e) &&
        state.results.some((r) => r.role === e.role && r.status === 'error')
    )
    .slice(0, remaining);
  if (failedEntries.length === 0) return false;

  const checkpointCount = state.checkpoints.size;
  options.logger.info('Refinement pass', {
    roles: failedEntries.map((e) => e.role),
    remaining,
    checkpoints: checkpointCount,
  });
  const executor = createWorkerExecutor({
    callCounter: state.callCounter,
    unsupportedEntries: state.unsupportedEntries,
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
  state.totalModelCalls = state.callCounter.attempts;
  state.results = mergeRefinedResults(state.results, refinedResults);
  return true;
}

// ============================================================================
// Public API
// ============================================================================

/** Limit initial worker slots before reserving individual completion attempts. */
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

async function createPinnedExecutorConfig(
  options: WorkerDispatchExecutionOptions,
  entries: readonly AgentPlanEntry[],
  maxCalls: number
): Promise<WorkerExecutorConfig> {
  const config: WorkerExecutorConfig = {
    callCounter: { attempts: 0, maxCalls },
    unsupportedEntries: new Set(),
    taskDescription: options.taskDescription,
    modelAdapter: options.modelAdapter,
    logger: options.logger,
    ...(options.learnings !== undefined ? { learnings: options.learnings } : {}),
    ...(options.perWorkerRouting !== undefined
      ? { perWorkerRouting: options.perWorkerRouting }
      : {}),
    ...(options.relevantFiles !== undefined ? { relevantFiles: options.relevantFiles } : {}),
  };
  const resolvedAdapters = new Map<AgentPlanEntry, ResolvedWorkerAdapter>();
  for (const entry of entries) {
    const resolved = await resolveWorkerAdapter(entry, config, options.signal);
    if (typeof resolved === 'string')
      return { ...config, resolvedAdapters, modeUnsupported: resolved };
    resolvedAdapters.set(entry, resolved);
  }
  return { ...config, resolvedAdapters };
}

async function prepareDispatchPreflight(
  options: WorkerDispatchExecutionOptions,
  maxCalls: number
): Promise<{
  readonly pinnedConfig: WorkerExecutorConfig;
  readonly unsupported: string | undefined;
}> {
  const entries = options.agentPlan.entries;
  const pinnedConfig = await createPinnedExecutorConfig(options, entries, maxCalls);
  if (pinnedConfig.modeUnsupported !== undefined)
    return { pinnedConfig, unsupported: pinnedConfig.modeUnsupported };
  const unsupported = await preflightWorkerPrompts({
    entries,
    taskDescription: options.taskDescription,
    adapters: new Map(
      [...(pinnedConfig.resolvedAdapters ?? [])].map(([entry, resolved]) => [
        entry,
        resolved.adapter,
      ])
    ),
    learnings: options.learnings,
    signal: options.signal,
    ...(options.relevantFiles !== undefined ? { relevantFiles: options.relevantFiles } : {}),
  });
  throwIfDispatchCancelled(options.signal, 'inline preflight');
  return { pinnedConfig, unsupported };
}

/** Execute worker dispatch for an agent plan. */
export async function executeWorkerDispatch(
  options: WorkerDispatchExecutionOptions
): Promise<WorkerDispatchResult> {
  const { agentPlan, taskDescription, logger, maxConcurrency } = options;
  const maxCalls = resolveMaxWorkerCalls(options.maxWorkerCalls);
  const startMs = getTimeProvider().now();
  const entries = prepareBudgetedEntries(agentPlan, maxCalls, logger);

  // Quality gate: opt-in via the qualityGate option (#1502); absent means ungated (#6589).
  const qualityGate = options.qualityGate === false ? undefined : options.qualityGate;

  const { pinnedConfig, unsupported } = await prepareDispatchPreflight(options, maxCalls);
  if (unsupported !== undefined) {
    return refusedInlineDispatch(entries, taskDescription, unsupported, startMs, logger);
  }
  const results = await dispatchWorkers(entries, {
    ...(maxConcurrency !== undefined ? { maxConcurrency } : {}),
    executeWorker: createWorkerExecutor(pinnedConfig),
    altExecuteWorker: createAltWorkerExecutor(pinnedConfig),
    eventBus: getPipelineEventBus(),
    executionId: `dispatch-${Date.now().toString(36)}`,
    ...(qualityGate !== undefined ? { qualityGate } : {}),
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
  });

  const checkpoints = new WorkerCheckpointStore();
  saveFailedCheckpoints(results, checkpoints);

  const state: DispatchPhaseState = {
    results: [...results],
    callCounter: pinnedConfig.callCounter,
    unsupportedEntries: pinnedConfig.unsupportedEntries,
    totalModelCalls: pinnedConfig.callCounter.attempts,
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
  // #6792: the mode the worker's call asked for. A model adapter's response
  // does not report what it enforced, so the row says "requested", not more.
  const requestedMode = r.accessMode ?? r.requestedAccessMode;
  if (requestedMode !== undefined) {
    fields['qualitySignals'] = [accessModeSignal(requestedMode, 'requested')];
  }
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
