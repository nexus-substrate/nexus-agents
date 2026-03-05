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

async function processSingleIteration(
  opts: ProcessIterationOptions
): Promise<{ success: boolean; patch?: string; response?: string }> {
  const { executor, context, state, systemPromptOverride, contextSummary } = opts;
  await resetRepository(context.workDir);

  const iterResult = await runIteration({
    executor,
    context,
    previousError: state.lastError,
    previousPatch: state.lastPatch,
    systemPromptOverride,
    contextSummary,
  });

  if (!iterResult.ok) {
    state.lastError = iterResult.error.message;
    state.lastPatch = undefined;
    return { success: false };
  }

  state.totalTokens += iterResult.value.tokensUsed;
  state.lastPatch = iterResult.value.patch;
  const agentResponse = iterResult.value.response;

  const applyResult = await applyPatch(context.workDir, iterResult.value.patch);
  if (!applyResult.ok) {
    state.lastError = applyResult.error.message;
    return { success: false, response: agentResponse };
  }

  return { success: true, patch: iterResult.value.patch, response: agentResponse };
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
    systemPromptOverride: options.systemPrompt,
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

async function runIterationLoop(
  executor: IAgentExecutor,
  context: AgentContext,
  state: IterationState,
  options: IterationLoopOptions
): Promise<SWEBenchRunResult> {
  const { config, startTime, onMessage } = options;

  while (state.iterations < config.max_iterations) {
    const earlyExit = checkEarlyExit(context.instance.instance_id, options, state);
    if (earlyExit !== null) return earlyExit;

    state.iterations++;
    onMessage?.(`Iteration ${state.iterations.toString()}/${config.max_iterations.toString()}`);

    const done = await executeOneIteration(executor, context, state, options);
    if (done) {
      onMessage?.('Patch applies successfully');
      break;
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
