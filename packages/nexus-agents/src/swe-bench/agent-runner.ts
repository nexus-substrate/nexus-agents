/**
 * nexus-agents/swe-bench - Agent Runner
 *
 * Runs an agent on a SWE-bench instance to generate patches.
 *
 * @module swe-bench/agent-runner
 * (Source: Issue #257 - SWE-Bench Evaluation)
 */

import type { Result } from '../core/result.js';
import { getTimeProvider } from '../core/index.js';
import type { SWEBenchInstance, SWEBenchRunResult, SWEBenchConfig } from './types.js';
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
  };
  const result = await runIterationLoop(executor, context, state, loopOptions);
  return { ok: true, value: result };
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
      if (isDuplicatePatch(state.finalPatch, seenPatches)) {
        state.finalPatch = undefined;
        return buildDuplicateResult(context.instance.instance_id, startTime, state, onMessage);
      }
      onMessage?.('Patch applies successfully');
      break;
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
