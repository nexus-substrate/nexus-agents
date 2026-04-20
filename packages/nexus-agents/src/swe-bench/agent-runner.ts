/* eslint-disable max-lines -- Cohesive runner module: iteration loop + verify loop + helpers. */
/**
 * nexus-agents/swe-bench - Agent Runner
 *
 * Runs an agent on a SWE-bench instance to generate patches.
 *
 * @module swe-bench/agent-runner
 * (Source: Issue #257 - SWE-Bench Evaluation)
 */

import type { Result } from '../core/result.js';
import type { ILogger } from '../core/index.js';
import { getTimeProvider, createLogger, getErrorMessage } from '../core/index.js';
// ClawGuard + structured task state integration (#1414 runner wiring).
import {
  deriveAccessPolicy,
  withAccessPolicy,
  resolveAccessPolicyMode,
} from '../security/access-constraint-deriver/index.js';
import { initTaskState, updateStage, appendBlocker } from '../context/structured-task-state.js';
import type { SWEBenchInstance, SWEBenchRunResult, SWEBenchConfig } from './types.js';
import { buildVerifyOutcome } from './verify-loop.js';
import {
  SWE_BENCH_SYSTEM_PROMPT,
  createInstancePrompt,
  createRetryPrompt,
  extractPatch,
  validatePatchFormat,
} from './prompt-template.js';
import { createEmptyContext, updateContext, formatContextForPrompt } from './iteration-context.js';
import type { IterationContext } from './types.js';
import {
  AgentRunnerError,
  cloneRepository,
  applyPatch,
  resetRepository,
  captureWorkingDirDiff,
  buildFailedResult,
  buildSuccessResult,
  type IterationState,
} from './agent-runner-helpers.js';

// Re-export helpers for backward compatibility
export {
  AgentRunnerError,
  cloneRepository,
  applyPatch,
  resetRepository,
  captureWorkingDirDiff,
  buildFailedResult,
  buildSuccessResult,
  type IterationState,
} from './agent-runner-helpers.js';

/**
 * Agent execution context.
 */
export interface AgentContext {
  /** Instance being solved. */
  readonly instance: SWEBenchInstance;
  /** Working directory (cloned repo). */
  readonly workDir: string;
  /** Configuration. */
  readonly config: SWEBenchConfig;
  /** Callback for agent messages. */
  readonly onMessage?: (message: string) => void;
}

/**
 * Agent executor interface.
 */
export interface IAgentExecutor {
  execute(
    systemPrompt: string,
    userPrompt: string,
    context: AgentContext
  ): Promise<Result<AgentExecutionResult, AgentRunnerError>>;
}

/**
 * Result from agent execution.
 */
export interface AgentExecutionResult {
  readonly response: string;
  readonly tokensUsed: number;
  readonly durationMs: number;
}

/**
 * Options for iteration loop to reduce parameter count.
 */
interface IterationLoopOptions {
  readonly config: SWEBenchConfig;
  readonly signal: AbortSignal | undefined;
  readonly startTime: number;
  readonly onMessage: ((msg: string) => void) | undefined;
  readonly systemPrompt: string | undefined;
  iterationContext: IterationContext;
  readonly verifyAdapter?: IVerifyAdapter;
  readonly maxVerifyRetries?: number;
  verifyAttempts: number;
}

/**
 * Result of a post-patch verification attempt (#2032 integration).
 */
export interface VerifyResult {
  readonly passed: boolean;
  readonly stderr: string;
  readonly stdout: string;
}

/**
 * Adapter that runs the instance's test suite against a freshly-applied
 * patch (#2032 integration). Verification is opt-in — when no adapter
 * is provided, the runner behaves exactly as before.
 */
export interface IVerifyAdapter {
  verify(instance: SWEBenchInstance, patch: string, workDir: string): Promise<VerifyResult>;
}

/**
 * Options for running an agent on an instance.
 */
export interface RunOptions {
  readonly executor: IAgentExecutor;
  readonly config: SWEBenchConfig;
  readonly onMessage?: (message: string) => void;
  readonly signal?: AbortSignal;
  /** Override system prompt (e.g., with memory-enriched version). */
  readonly systemPrompt?: string;
  /**
   * Optional post-patch verify adapter (#2032). When provided, successful
   * patches are verified by running the instance's test suite; failures
   * trigger a bounded retry loop using the classification + retry-hint
   * logic from `verify-loop.ts`. Default cap: 2 retries.
   */
  readonly verifyAdapter?: IVerifyAdapter;
  /** Override max verify retries (default 2). */
  readonly maxVerifyRetries?: number;
}

// ============================================================================
// Agent Iteration
// ============================================================================

interface RunIterationOptions {
  readonly executor: IAgentExecutor;
  readonly context: AgentContext;
  readonly previousError?: string;
  readonly previousPatch?: string;
  readonly systemPromptOverride?: string;
  readonly contextSummary?: string;
}

interface IterationResult {
  readonly patch: string;
  readonly tokensUsed: number;
  readonly response: string;
}

async function runIteration(
  opts: RunIterationOptions
): Promise<Result<IterationResult, AgentRunnerError>> {
  const { executor, context, previousError, previousPatch, systemPromptOverride, contextSummary } =
    opts;
  const systemPrompt = systemPromptOverride ?? SWE_BENCH_SYSTEM_PROMPT;
  let userPrompt = createInstancePrompt(context.instance);

  if (previousError !== undefined) {
    userPrompt += '\n\n' + createRetryPrompt(previousError, previousPatch, contextSummary);
  }

  const result = await executor.execute(systemPrompt, userPrompt, context);
  if (!result.ok) return { ok: false, error: result.error };

  const patch = extractPatch(result.value.response);
  if (patch === null) {
    return { ok: false, error: new AgentRunnerError('No patch found in response') };
  }

  const validation = validatePatchFormat(patch);
  if (!validation.valid) {
    return { ok: false, error: new AgentRunnerError(`Invalid patch: ${validation.error ?? ''}`) };
  }

  return {
    ok: true,
    value: { patch, tokensUsed: result.value.tokensUsed, response: result.value.response },
  };
}

interface ProcessIterationOptions {
  readonly executor: IAgentExecutor;
  readonly context: AgentContext;
  readonly state: IterationState;
  readonly systemPromptOverride?: string;
  readonly contextSummary?: string;
}

/** Resolve the best patch: prefer working dir changes, fall back to text-extracted patch. */
async function resolvePatch(
  context: AgentContext,
  state: IterationState,
  textPatch: string
): Promise<{ success: boolean; patch?: string }> {
  // If agent already modified files via tools, prefer working dir diff (#1411).
  const workDirResult = await tryWorkingDirDiff(context, state, '');
  if (workDirResult.success && workDirResult.patch !== undefined) {
    return { success: true, patch: workDirResult.patch };
  }
  // Apply text-extracted patch to clean working tree
  state.lastPatch = textPatch;
  const applyResult = await applyPatch(context.workDir, textPatch);
  if (!applyResult.ok) {
    state.lastError = applyResult.error.message;
    return { success: false };
  }
  return { success: true, patch: textPatch };
}

async function processSingleIteration(
  opts: ProcessIterationOptions
): Promise<{ success: boolean; patch?: string; response?: string }> {
  const { executor, context, state, systemPromptOverride, contextSummary } = opts;
  await resetRepository(context.workDir);

  const iterResult = await runIteration({
    executor,
    context,
    ...(state.lastError !== undefined ? { previousError: state.lastError } : {}),
    ...(state.lastPatch !== undefined ? { previousPatch: state.lastPatch } : {}),
    ...(systemPromptOverride !== undefined ? { systemPromptOverride } : {}),
    ...(contextSummary !== undefined ? { contextSummary } : {}),
  });

  // No patch in response text — try working dir diff as fallback (#1411)
  if (!iterResult.ok && iterResult.error.message === 'No patch found in response') {
    return tryWorkingDirDiff(context, state, iterResult.error.message);
  }

  if (!iterResult.ok) {
    state.lastError = iterResult.error.message;
    state.lastPatch = undefined;
    return { success: false };
  }

  state.totalTokens += iterResult.value.tokensUsed;
  const resolved = await resolvePatch(context, state, iterResult.value.patch);
  return { ...resolved, response: iterResult.value.response };
}

/** Fallback: capture working dir changes when agent modified files via tools (#1411). */
async function tryWorkingDirDiff(
  context: AgentContext,
  state: IterationState,
  originalError: string
): Promise<{ success: boolean; patch?: string; response?: string }> {
  const workDirDiff = await captureWorkingDirDiff(context.workDir);
  if (workDirDiff === null) {
    state.lastError = originalError;
    state.lastPatch = undefined;
    return { success: false };
  }

  const validation = validatePatchFormat(workDirDiff);
  if (!validation.valid) {
    state.lastError = `Working dir diff invalid: ${validation.error ?? ''}`;
    state.lastPatch = undefined;
    return { success: false };
  }

  // Working dir changes are already applied — just record the patch
  state.lastPatch = workDirDiff;
  return { success: true, patch: workDirDiff };
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Runs an agent on a SWE-bench instance.
 */
export async function runAgentOnInstance(
  instance: SWEBenchInstance,
  options: RunOptions
): Promise<Result<SWEBenchRunResult, AgentRunnerError>> {
  const startTime = getTimeProvider().now();
  const { executor, config, onMessage, signal } = options;

  if (signal?.aborted === true) {
    return { ok: true, value: buildFailedResult(instance.instance_id, 'Aborted', startTime) };
  }

  onMessage?.(`Starting instance: ${instance.instance_id}`);

  const cloneResult = await cloneRepository(instance.repo, instance.base_commit, config.work_dir);
  if (!cloneResult.ok) {
    return {
      ok: true,
      value: buildFailedResult(instance.instance_id, cloneResult.error.message, startTime),
    };
  }

  const contextBase = { instance, workDir: cloneResult.value, config };
  const context: AgentContext =
    onMessage !== undefined ? { ...contextBase, onMessage } : contextBase;

  const state: IterationState = {
    totalTokens: 0,
    iterations: 0,
    lastError: undefined,
    lastPatch: undefined,
    finalPatch: undefined,
  };

  const loopOptions: IterationLoopOptions = {
    config,
    signal,
    startTime,
    onMessage,
    systemPrompt: options.systemPrompt,
    iterationContext: createEmptyContext(),
    verifyAttempts: 0,
    ...(options.verifyAdapter !== undefined ? { verifyAdapter: options.verifyAdapter } : {}),
    ...(options.maxVerifyRetries !== undefined
      ? { maxVerifyRetries: options.maxVerifyRetries }
      : {}),
  };

  // Derive ClawGuard policy + init task state before the iteration loop.
  // Both are no-ops when respective env flags are disabled.
  const runnerLogger = createLogger({ component: 'swe-bench-runner' });
  const taskId = `swebench-${instance.instance_id}`;
  const policy = await deriveRunnerAccessPolicy(instance, runnerLogger);
  recordRunnerTaskInit(taskId, instance, runnerLogger);
  const result = await withAccessPolicy(policy, () =>
    runIterationLoop(executor, context, state, loopOptions)
  );
  recordRunnerTaskFinal(taskId, result, runnerLogger);
  return { ok: true, value: result };
}

/**
 * Derive a ClawGuard access policy for this SWE-bench instance. Returns
 * a bypass/off policy when NEXUS_ACCESS_POLICY_MODE is off (default in
 * v2.50 was audit, but callers may still disable). Never throws —
 * derivation failure falls back to bypass.
 */
async function deriveRunnerAccessPolicy(
  instance: SWEBenchInstance,
  logger: ILogger
): Promise<Awaited<ReturnType<typeof deriveAccessPolicy>>> {
  const mode = resolveAccessPolicyMode();
  try {
    const policy = await deriveAccessPolicy(`Fix: ${instance.problem_statement.slice(0, 500)}`, {
      mode,
      trustTier: '1',
    });
    if (mode !== 'off') {
      logger.info('access-policy: runner policy derived', {
        instanceId: instance.instance_id,
        mode,
        source: policy.source,
      });
    }
    return policy;
  } catch (error) {
    logger.warn('access-policy: runner derivation failed, falling back to off', {
      instanceId: instance.instance_id,
      error: getErrorMessage(error),
    });
    return {
      allowedTools: '*',
      allowedPathPatterns: [],
      allowedOperations: '*',
      objectiveHash: 'runner-derivation-failed',
      derivedAt: getTimeProvider().nowIso(),
      source: 'bypass',
      mode: 'off',
    };
  }
}

/** Opt-in check for task-state recording (shared with orchestrate.ts). */
function isRunnerTaskStateEnabled(): boolean {
  const raw = process.env['NEXUS_TASK_STATE_ENABLED'];
  if (raw === undefined || raw === '') return true;
  const normalized = raw.toLowerCase();
  return normalized !== '0' && normalized !== 'false';
}

function recordRunnerTaskInit(taskId: string, instance: SWEBenchInstance, logger: ILogger): void {
  if (!isRunnerTaskStateEnabled()) return;
  const now = getTimeProvider().nowIso();
  const result = initTaskState({
    taskId,
    stage: 'planning',
    decisions: [],
    blockers: [],
    position: {
      currentStep: `swe-bench.clone(${instance.repo})`,
    },
    updatedAt: now,
  });
  if (!result.ok) {
    logger.warn('task-state: runner init failed', {
      taskId,
      error: result.error.message,
    });
    return;
  }
  updateStage(taskId, 'executing', now);
}

function recordRunnerTaskFinal(taskId: string, result: SWEBenchRunResult, logger: ILogger): void {
  if (!isRunnerTaskStateEnabled()) return;
  const now = getTimeProvider().nowIso();
  // Runner reports "completed" when a patch was produced; errors → blocked.
  const succeeded = result.completed && result.error === undefined;
  if (!succeeded && result.error !== undefined) {
    const blockerResult = appendBlocker(taskId, { ts: now, blocker: result.error });
    if (!blockerResult.ok) {
      logger.warn('task-state: runner blocker record failed', {
        taskId,
        error: blockerResult.error.message,
      });
    }
  }
  const stage = succeeded ? 'complete' : 'blocked';
  const stageResult = updateStage(taskId, stage, now);
  if (!stageResult.ok) {
    logger.warn('task-state: runner stage update failed', {
      taskId,
      stage,
      error: stageResult.error.message,
    });
  }
}

function checkEarlyExit(
  instanceId: string,
  options: IterationLoopOptions,
  state: IterationState
): SWEBenchRunResult | null {
  const { signal, startTime, config } = options;
  if (signal?.aborted === true) {
    return buildFailedResult(instanceId, 'Aborted', startTime, state);
  }
  if (getTimeProvider().now() - startTime > config.timeout_ms) {
    return buildFailedResult(instanceId, 'Timeout', startTime, state);
  }
  return null;
}

function buildContextSummaryArg(
  ctx: IterationContext
): { contextSummary: string } | Record<string, never> {
  const summary = formatContextForPrompt(ctx);
  return summary.length > 0 ? { contextSummary: summary } : {};
}

async function executeOneIteration(
  executor: IAgentExecutor,
  context: AgentContext,
  state: IterationState,
  options: IterationLoopOptions
): Promise<boolean> {
  const iterResult = await processSingleIteration({
    executor,
    context,
    state,
    ...(options.systemPrompt !== undefined ? { systemPromptOverride: options.systemPrompt } : {}),
    ...buildContextSummaryArg(options.iterationContext),
  });

  const hadPatch = iterResult.patch !== undefined;
  options.iterationContext = updateContext(
    options.iterationContext,
    iterResult.response ?? '',
    state.iterations,
    hadPatch,
    iterResult.success
  );

  if (iterResult.success && iterResult.patch !== undefined) {
    state.finalPatch = iterResult.patch;
    return true;
  }
  return false;
}

/** Returns true if the patch was already seen; adds it to the set if new. */
function isDuplicatePatch(patch: string | undefined, seenPatches: Set<string>): boolean {
  if (patch === undefined) return false;
  if (seenPatches.has(patch)) return true;
  seenPatches.add(patch);
  return false;
}

function buildDuplicateResult(
  instanceId: string,
  startTime: number,
  state: IterationState,
  onMessage: ((msg: string) => void) | undefined
): SWEBenchRunResult {
  onMessage?.('Duplicate patch detected, terminating early');
  return buildFailedResult(instanceId, 'Duplicate patch — agent is stuck', startTime, state);
}

/** Invoke the verify adapter and build the outcome. Pure wrapper. */
async function invokeVerifyAdapter(
  adapter: IVerifyAdapter,
  patch: string,
  context: AgentContext,
  options: IterationLoopOptions
): Promise<ReturnType<typeof buildVerifyOutcome>> {
  const { passed, stderr, stdout } = await adapter.verify(context.instance, patch, context.workDir);
  return buildVerifyOutcome({
    passed,
    iteration: options.verifyAttempts - 1,
    stderr,
    stdout,
    ...(options.maxVerifyRetries !== undefined ? { maxRetries: options.maxVerifyRetries } : {}),
  });
}

/** Record verification-failure state and reset finalPatch so the next iteration runs. */
function applyVerifyRetry(
  outcome: ReturnType<typeof buildVerifyOutcome>,
  state: IterationState,
  onMessage: ((msg: string) => void) | undefined
): void {
  const category = outcome.classification?.category ?? 'unknown';
  onMessage?.(`Verify failed (${category}); retrying with hint`);
  state.lastError = outcome.retryHint ?? 'Verification failed; re-emit the patch';
  state.lastPatch = state.finalPatch;
  state.finalPatch = undefined;
}

/**
 * Run post-patch verification if a verify adapter is configured (#2032).
 * Returns `true` when the outer iteration loop should break (no adapter,
 * verify passes, or retry cap reached). Returns `false` when retry is
 * permitted — state.lastError now holds the retry hint for the agent.
 */
async function runPostPatchVerify(
  context: AgentContext,
  state: IterationState,
  options: IterationLoopOptions
): Promise<boolean> {
  const adapter = options.verifyAdapter;
  if (adapter === undefined || state.finalPatch === undefined) return true;
  options.verifyAttempts += 1;
  options.onMessage?.(`Verifying patch (attempt ${String(options.verifyAttempts)})`);
  const outcome = await invokeVerifyAdapter(adapter, state.finalPatch, context, options);
  if (outcome.ok) return true;
  if (!outcome.willRetry) {
    const category = outcome.classification?.category ?? 'unknown';
    options.onMessage?.(`Verify failed (${category}); no more retries`);
    return true;
  }
  applyVerifyRetry(outcome, state, options.onMessage);
  return false;
}

/** Outcome of a single loop iteration: keep looping, break, or early-exit with a built result. */
type IterationControl = 'break' | 'continue' | { readonly result: SWEBenchRunResult };

async function handleIterationDone(
  context: AgentContext,
  state: IterationState,
  options: IterationLoopOptions,
  seenPatches: Set<string>
): Promise<IterationControl> {
  if (isDuplicatePatch(state.finalPatch, seenPatches)) {
    state.finalPatch = undefined;
    return {
      result: buildDuplicateResult(
        context.instance.instance_id,
        options.startTime,
        state,
        options.onMessage
      ),
    };
  }
  options.onMessage?.('Patch applies successfully');
  const verifyOk = await runPostPatchVerify(context, state, options);
  return verifyOk ? 'break' : 'continue';
}

async function runIterationLoop(
  executor: IAgentExecutor,
  context: AgentContext,
  state: IterationState,
  options: IterationLoopOptions
): Promise<SWEBenchRunResult> {
  const { config, startTime, onMessage } = options;
  const seenPatches = new Set<string>();

  while (state.iterations < config.max_iterations) {
    const earlyExit = checkEarlyExit(context.instance.instance_id, options, state);
    if (earlyExit !== null) return earlyExit;

    state.iterations++;
    onMessage?.(`Iteration ${state.iterations.toString()}/${config.max_iterations.toString()}`);

    const done = await executeOneIteration(executor, context, state, options);
    if (done) {
      const control = await handleIterationDone(context, state, options, seenPatches);
      if (control === 'break') break;
      if (control === 'continue') continue;
      return control.result;
    }

    if (isDuplicatePatch(state.lastPatch, seenPatches)) {
      return buildDuplicateResult(context.instance.instance_id, startTime, state, onMessage);
    }
  }

  if (state.finalPatch === undefined) {
    return buildFailedResult(
      context.instance.instance_id,
      state.lastError ?? 'Max iterations',
      startTime,
      state
    );
  }

  return buildSuccessResult(context.instance, state.finalPatch, config.model, startTime, state);
}

/**
 * Creates a mock executor for testing.
 */
export function createMockExecutor(responses: string[]): IAgentExecutor {
  let index = 0;
  return {
    execute(): Promise<Result<AgentExecutionResult, AgentRunnerError>> {
      const response = responses[index];
      if (response === undefined) {
        return Promise.resolve({
          ok: false,
          error: new AgentRunnerError('No more mock responses'),
        });
      }
      index++;
      return Promise.resolve({ ok: true, value: { response, tokensUsed: 100, durationMs: 50 } });
    },
  };
}
