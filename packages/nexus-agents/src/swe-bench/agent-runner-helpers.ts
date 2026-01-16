/**
 * nexus-agents/swe-bench - Agent Runner Helpers
 *
 * Git operations and result builders extracted from agent-runner.ts.
 *
 * @module swe-bench/agent-runner-helpers
 * (Source: Issue #257 - SWE-Bench Evaluation)
 */

import type { Result } from '../core/result.js';
import type { SWEBenchInstance, SWEBenchPrediction, SWEBenchRunResult } from './types.js';

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
 * Internal state for iteration loop.
 */
export interface IterationState {
  totalTokens: number;
  iterations: number;
  lastError: string | undefined;
  lastPatch: string | undefined;
  finalPatch: string | undefined;
}

// ============================================================================
// Git Operations
// ============================================================================

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

/**
 * Clones a repository to a working directory.
 */
export async function cloneRepository(
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

/**
 * Applies a patch to the repository.
 */
export async function applyPatch(
  repoDir: string,
  patch: string
): Promise<Result<void, AgentRunnerError>> {
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

/**
 * Resets repository to clean state.
 */
export async function resetRepository(repoDir: string): Promise<Result<void, AgentRunnerError>> {
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

/**
 * Builds a failed result.
 */
export function buildFailedResult(
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

/**
 * Builds a success result.
 */
export function buildSuccessResult(
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
