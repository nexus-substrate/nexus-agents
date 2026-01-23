/**
 * nexus-agents/swe-bench - Harness Executor Factory
 *
 * Factory functions and quick helpers for creating harness executors.
 *
 * @module swe-bench/harness-executor-factory
 * @see https://www.swebench.com/SWE-bench/guides/evaluation/
 * (Source: Issue #257 - SWE-Bench Evaluation)
 */

import type { ILogger } from '../core/logger.js';
import { HarnessExecutor } from './harness-executor-impl.js';
import type {
  HarnessExecutionConfig,
  HarnessExecutionResult,
  HarnessValidationResult,
  HarnessProgressCallback,
} from './harness-executor-types.js';
import { DEFAULT_HARNESS_EXECUTION_CONFIG } from './harness-executor-types.js';

/**
 * Creates a new harness executor instance.
 */
export function createHarnessExecutor(logger?: ILogger): HarnessExecutor {
  return new HarnessExecutor(logger);
}

/**
 * Validates the environment and returns a configured executor if ready.
 */
export async function createValidatedExecutor(
  logger?: ILogger
): Promise<{ executor: HarnessExecutor; validation: HarnessValidationResult }> {
  const executor = createHarnessExecutor(logger);
  const validation = await executor.validate();
  return { executor, validation };
}

/**
 * Quick execution helper for simple use cases.
 */
export async function executeHarness(
  predictionsPath: string,
  options: Partial<HarnessExecutionConfig> = {},
  onProgress?: HarnessProgressCallback
): Promise<HarnessExecutionResult> {
  const executor = createHarnessExecutor();
  const config: HarnessExecutionConfig = {
    ...DEFAULT_HARNESS_EXECUTION_CONFIG,
    ...options,
    predictionsPath,
  };
  return executor.execute(config, onProgress);
}
