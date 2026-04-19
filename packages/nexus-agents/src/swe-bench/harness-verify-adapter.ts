/**
 * Harness-backed verify adapter (#2054).
 *
 * Concrete implementation of `IVerifyAdapter` that delegates to the
 * existing `IEvaluationHarness` to actually run the instance's test
 * suite. Translates the harness's `InstanceEvaluationResult` into the
 * `VerifyResult` shape the agent-runner expects.
 *
 * Wire this into the agent-runner via `RunOptions.verifyAdapter`:
 *
 * ```typescript
 * const harness = await createValidatedHarness(...);
 * const verifyAdapter = new HarnessVerifyAdapter(harness, modelName, evalConfig);
 * runAgentOnInstance(instance, { executor, config, verifyAdapter });
 * ```
 *
 * @module swe-bench/harness-verify-adapter
 */

import type { IVerifyAdapter, VerifyResult } from './agent-runner.js';
import type { IEvaluationHarness } from './evaluation-interface-types.js';
import type { EvaluationHarnessConfig } from './evaluation-config-types.js';
import type { InstanceEvaluationResult } from './evaluation-result-types.js';
import type { SWEBenchInstance, SWEBenchPrediction } from './types.js';
import { createLogger } from '../core/index.js';

const logger = createLogger({ component: 'harness-verify-adapter' });

/**
 * Builds a `VerifyResult` from an `InstanceEvaluationResult`.
 *
 * Mapping:
 * - `passed` = `resolved` (all FAIL_TO_PASS now pass, all PASS_TO_PASS still pass)
 * - `stderr` = patch application error, if any; else pytest-style summary of failed tests
 * - `stdout` = run summary (counts + status)
 *
 * Exported for direct use by tests.
 */
export function translateEvaluationResult(result: InstanceEvaluationResult): VerifyResult {
  const stderr = buildStderr(result);
  const stdout = buildStdout(result);
  return {
    passed: result.resolved,
    stderr,
    stdout,
  };
}

function buildStderr(result: InstanceEvaluationResult): string {
  if (!result.patchApplied) {
    return `patch does not apply: ${result.patchError ?? 'unknown error'}`;
  }
  if (result.status === 'timeout') {
    return `Test run timed out after ${String(result.durationMs)}ms`;
  }
  if (result.status === 'error') {
    return `Runtime error during evaluation: ${result.patchError ?? 'unknown'}`;
  }
  // Patch applied but tests failed — build a pytest-style summary
  const failed = result.testResults.filter((t) => t.status === 'failed');
  if (failed.length === 0) return '';
  const lines = failed
    .slice(0, 20)
    .map((t) => `FAILED ${t.testName}${t.errorMessage !== undefined ? `: ${t.errorMessage}` : ''}`);
  return lines.join('\n');
}

function buildStdout(result: InstanceEvaluationResult): string {
  const summary = [
    `Instance: ${result.instanceId}`,
    `Status: ${result.status}`,
    `Patch applied: ${String(result.patchApplied)}`,
    `Tests: ${String(result.testsPassed)}/${String(result.testsTotal)} passed`,
    `Duration: ${String(result.durationMs)}ms`,
  ];
  if (result.testsFailed > 0) summary.push(`Failed: ${String(result.testsFailed)}`);
  return summary.join('\n');
}

/**
 * Concrete `IVerifyAdapter` that calls `harness.evaluateInstance` per
 * verify request. Requires a validated harness — call
 * `createValidatedHarness()` first, then pass the result here.
 */
export class HarnessVerifyAdapter implements IVerifyAdapter {
  constructor(
    private readonly harness: IEvaluationHarness,
    private readonly modelNameOrPath: string,
    private readonly evalConfig: EvaluationHarnessConfig
  ) {}

  async verify(instance: SWEBenchInstance, patch: string, _workDir: string): Promise<VerifyResult> {
    const prediction: SWEBenchPrediction = {
      instance_id: instance.instance_id,
      model_name_or_path: this.modelNameOrPath,
      model_patch: patch,
    };
    try {
      const result = await this.harness.evaluateInstance(prediction, this.evalConfig);
      return translateEvaluationResult(result);
    } catch (cause) {
      const msg = cause instanceof Error ? cause.message : String(cause);
      logger.warn('Harness verify failed, treating as unresolved', {
        instanceId: instance.instance_id,
        error: msg,
      });
      return {
        passed: false,
        stderr: `Harness evaluation failed: ${msg}`,
        stdout: '',
      };
    }
  }
}
