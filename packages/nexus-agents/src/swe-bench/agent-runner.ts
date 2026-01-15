/**
 * nexus-agents/swe-bench - Agent Runner
 *
 * Runs an agent on a SWE-bench instance to generate patches.
 *
 * @module swe-bench/agent-runner
 * (Source: Issue #257 - SWE-Bench Evaluation)
 */

import type { Result } from '../core/result.js';
import type {
  SWEBenchInstance,
  SWEBenchPrediction,
  SWEBenchRunResult,
  SWEBenchConfig,
} from './types.js';
import {
  SWE_BENCH_SYSTEM_PROMPT,
  createInstancePrompt,
  createRetryPrompt,
  extractPatch,
  validatePatchFormat,
} from './prompt-template.js';

/**
 * Error for agent runner.
 */
export class AgentRunnerError extends Error {
  override readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'AgentRunnerError';
    this.cause = cause;
  }
}

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
 * Internal state for iteration loop.
 */
interface IterationState {
  totalTokens: number;
  iterations: number;
  lastError: string | undefined;
  lastPatch: string | undefined;
  finalPatch: string | undefined;
}

/**
 * Options for iteration loop to reduce parameter count.
 */
interface IterationLoopOptions {
  readonly config: SWEBenchConfig;
  readonly signal: AbortSignal | undefined;
  readonly startTime: number;
  readonly onMessage: ((msg: string) => void) | undefined;
}

/**
 * Options for running an agent on an instance.
 */
export interface RunOptions {
  readonly executor: IAgentExecutor;
  readonly config: SWEBenchConfig;
  readonly onMessage?: (message: string) => void;
  readonly signal?: AbortSignal;
}

// ============================================================================
// Git Operations
// ============================================================================

/**
 * Clones a repository to a working directory.
 */
async function cloneRepository(
  repo: string,
  commit: string,
  workDir: string
): Promise<Result<string, AgentRunnerError>> {
  const path = await import('node:path');
  const fs = await import('node:fs/promises');
  const childProcess = await import('node:child_process');
  const { promisify } = await import('node:util');
  const exec = promisify(childProcess.exec);

  const repoDir = path.join(workDir, repo.replace('/', '__'));

  try {
    await fs.mkdir(workDir, { recursive: true });
    const cloned = await tryExistingClone(repoDir, commit, exec);
    if (cloned) return { ok: true, value: repoDir };

    await exec(`git clone https://github.com/${repo}.git ${repoDir}`);
    await exec(`git checkout ${commit}`, { cwd: repoDir });
    return { ok: true, value: repoDir };
  } catch (err) {
    return { ok: false, error: new AgentRunnerError(`Failed to clone: ${repo}`, err) };
  }
}

type ExecFn = (cmd: string, opts?: { cwd?: string }) => Promise<{ stdout: string }>;

async function tryExistingClone(repoDir: string, commit: string, exec: ExecFn): Promise<boolean> {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  try {
    await fs.access(path.join(repoDir, '.git'));
    await exec(`git fetch origin`, { cwd: repoDir });
    await exec(`git checkout ${commit}`, { cwd: repoDir });
    await exec(`git clean -fd`, { cwd: repoDir });
    return true;
  } catch {
    return false;
  }
}

async function applyPatch(repoDir: string, patch: string): Promise<Result<void, AgentRunnerError>> {
  const childProcess = await import('node:child_process');
  const { promisify } = await import('node:util');
  const exec = promisify(childProcess.exec);
  const fs = await import('node:fs/promises');
  const path = await import('node:path');

  try {
    const patchFile = path.join(repoDir, '.agent_patch.diff');
    await fs.writeFile(patchFile, patch);
    await exec(`git apply ${patchFile}`, { cwd: repoDir });
    await fs.unlink(patchFile);
    return { ok: true, value: undefined };
  } catch (err) {
    return { ok: false, error: new AgentRunnerError('Failed to apply patch', err) };
  }
}

async function resetRepository(repoDir: string): Promise<Result<void, AgentRunnerError>> {
  const childProcess = await import('node:child_process');
  const { promisify } = await import('node:util');
  const exec = promisify(childProcess.exec);

  try {
    await exec(`git checkout -- .`, { cwd: repoDir });
    await exec(`git clean -fd`, { cwd: repoDir });
    return { ok: true, value: undefined };
  } catch (err) {
    return { ok: false, error: new AgentRunnerError('Failed to reset repository', err) };
  }
}

// ============================================================================
// Result Builders
// ============================================================================

function buildFailedResult(
  instanceId: string,
  error: string,
  startTime: number,
  state?: IterationState
): SWEBenchRunResult {
  const base = {
    instance_id: instanceId,
    completed: false as const,
    error,
    duration_ms: Date.now() - startTime,
  };

  if (state === undefined) {
    return base;
  }

  return {
    ...base,
    tokens_used: state.totalTokens,
    iterations: state.iterations,
  };
}

function buildSuccessResult(
  instance: SWEBenchInstance,
  patch: string,
  modelName: string,
  startTime: number,
  state: IterationState
): SWEBenchRunResult {
  const prediction: SWEBenchPrediction = {
    instance_id: instance.instance_id,
    model_name_or_path: modelName,
    model_patch: patch,
  };
  return {
    instance_id: instance.instance_id,
    completed: true,
    prediction,
    duration_ms: Date.now() - startTime,
    tokens_used: state.totalTokens,
    iterations: state.iterations,
  };
}

// ============================================================================
// Agent Iteration
// ============================================================================

async function runIteration(
  executor: IAgentExecutor,
  context: AgentContext,
  previousError?: string,
  previousPatch?: string
): Promise<Result<{ patch: string; tokensUsed: number }, AgentRunnerError>> {
  const systemPrompt = SWE_BENCH_SYSTEM_PROMPT;
  let userPrompt = createInstancePrompt(context.instance);

  if (previousError !== undefined) {
    userPrompt += '\n\n' + createRetryPrompt(previousError, previousPatch);
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

  return { ok: true, value: { patch, tokensUsed: result.value.tokensUsed } };
}

async function processSingleIteration(
  executor: IAgentExecutor,
  context: AgentContext,
  state: IterationState
): Promise<{ success: boolean; patch?: string }> {
  await resetRepository(context.workDir);

  const iterResult = await runIteration(executor, context, state.lastError, state.lastPatch);

  if (!iterResult.ok) {
    state.lastError = iterResult.error.message;
    state.lastPatch = undefined;
    return { success: false };
  }

  state.totalTokens += iterResult.value.tokensUsed;
  state.lastPatch = iterResult.value.patch;

  const applyResult = await applyPatch(context.workDir, iterResult.value.patch);
  if (!applyResult.ok) {
    state.lastError = applyResult.error.message;
    return { success: false };
  }

  return { success: true, patch: iterResult.value.patch };
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
  const startTime = Date.now();
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

  const contextBase = {
    instance,
    workDir: cloneResult.value,
    config,
  };
  const context: AgentContext =
    onMessage !== undefined ? { ...contextBase, onMessage } : contextBase;

  const state: IterationState = {
    totalTokens: 0,
    iterations: 0,
    lastError: undefined,
    lastPatch: undefined,
    finalPatch: undefined,
  };

  const loopOptions: IterationLoopOptions = { config, signal, startTime, onMessage };
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
  if (Date.now() - startTime > config.timeout_ms) {
    return buildFailedResult(instanceId, 'Timeout', startTime, state);
  }
  return null;
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

    const iterResult = await processSingleIteration(executor, context, state);
    if (iterResult.success && iterResult.patch !== undefined) {
      state.finalPatch = iterResult.patch;
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
